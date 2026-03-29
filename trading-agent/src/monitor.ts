// src/monitor.ts
// ============================================================
// Position Monitor — runs every 5 minutes, ZERO Claude calls.
//
// Checks ALL open positions across all tiers for:
//   - Stop-loss triggers  → close immediately
//   - Take-profit triggers → close immediately
//
// Handles multi-asset: ETH, BTC, UNI, AAVE, LINK, BNKR,
// BRETT, TOSHI, DEGEN — anything in the ledger's positions.
// ============================================================

import * as fs from 'fs';
import * as path from 'path';
import { loadLedger, type Ledger, type Position } from './executor.js';

const LEDGER_PATH = path.resolve('paper-ledger.json');

// ── CoinGecko ID map for all tier assets ──────────────────────
const COINGECKO_IDS: Record<string, string> = {
  ETH:   'ethereum',
  BTC:   'bitcoin',
  UNI:   'uniswap',
  AAVE:  'aave',
  LINK:  'chainlink',
  BNKR:  'bankr',
  BRETT: 'based-brett',
  TOSHI: 'toshi',
  DEGEN: 'degen-base',
};

// ── Price cache — 60s TTL to reduce API calls ─────────────────
let priceCache: Record<string, number> = {};
let priceCacheTime = 0;
const PRICE_TTL_MS = 60_000;

async function getPrices(symbols: string[]): Promise<Record<string, number>> {
  const now = Date.now();
  if (now - priceCacheTime < PRICE_TTL_MS && Object.keys(priceCache).length > 0) {
    return priceCache;
  }

  const cgIds = [...new Set(symbols.map(s => COINGECKO_IDS[s.toUpperCase()]).filter(Boolean))];
  if (cgIds.length === 0) return priceCache;

  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${cgIds.join(',')}&vs_currencies=usd`
    );
    const data = await res.json() as Record<string, { usd: number }>;

    const prices: Record<string, number> = {};
    for (const [sym, cgId] of Object.entries(COINGECKO_IDS)) {
      if (data[cgId]) prices[sym] = data[cgId].usd;
    }
    priceCache = prices;
    priceCacheTime = now;
    return prices;
  } catch (err: any) {
    console.error('⚠️  Monitor price fetch failed:', err.message);
    return priceCache;
  }
}

function assetFromPair(pair: string): string {
  return pair.split('/')[0].toUpperCase();
}

function saveLedger(ledger: Ledger): void {
  fs.writeFileSync(LEDGER_PATH, JSON.stringify(ledger, null, 2));
}

// ── Main monitor run ──────────────────────────────────────────

export interface MonitorResult {
  closedCount: number;
  alerts: string[];
  openCount: number;
}

export async function runMonitor(): Promise<MonitorResult> {
  const ledger = loadLedger();
  const open = ledger.positions.filter(p => p.status === 'OPEN');

  if (open.length === 0) {
    return { closedCount: 0, alerts: [], openCount: 0 };
  }

  const symbols = [...new Set(open.map(p => assetFromPair(p.pair)))];
  const prices  = await getPrices(symbols);

  const alerts: string[] = [];
  let closedCount = 0;
  const stillOpen: Position[] = [];

  for (const pos of ledger.positions) {
    if (pos.status !== 'OPEN') {
      stillOpen.push(pos);
      continue;
    }

    const symbol       = assetFromPair(pos.pair);
    const currentPrice = prices[symbol];

    if (!currentPrice) {
      stillOpen.push(pos);
      continue;
    }

    let shouldClose = false;
    let closeReason = '';
    let exitPrice   = currentPrice;

    if (pos.action === 'BUY') {
      if (pos.stopLoss !== null && currentPrice <= pos.stopLoss) {
        shouldClose = true; closeReason = 'STOP LOSS';   exitPrice = pos.stopLoss;
      } else if (pos.takeProfit !== null && currentPrice >= pos.takeProfit) {
        shouldClose = true; closeReason = 'TAKE PROFIT'; exitPrice = pos.takeProfit;
      }
    } else {
      if (pos.stopLoss !== null && currentPrice >= pos.stopLoss) {
        shouldClose = true; closeReason = 'STOP LOSS';   exitPrice = pos.stopLoss;
      } else if (pos.takeProfit !== null && currentPrice <= pos.takeProfit) {
        shouldClose = true; closeReason = 'TAKE PROFIT'; exitPrice = pos.takeProfit;
      }
    }

    // Time-based exit for positions with maxHoldHours set
    if (!shouldClose && pos.maxHoldHours && pos.status === 'OPEN') {
      const elapsedMs = Date.now() - new Date(pos.timestamp).getTime();
      if (elapsedMs > pos.maxHoldHours * 60 * 60 * 1000) {
        exitPrice = currentPrice;
        shouldClose = true;
        closeReason = 'TIME_LIMIT';
      }
    }

    if (shouldClose) {
      const units    = pos.amountUsd / pos.entryPrice;
      const exitVal  = units * exitPrice;
      const pnl      = pos.action === 'BUY' ? exitVal - pos.amountUsd : pos.amountUsd - exitVal;
      const pnlSign  = pnl >= 0 ? '+' : '';

      // Update balances
      if (pos.action === 'BUY') {
        ledger.ethBalance -= units;
        ledger.usdBalance += exitVal;
      } else {
        ledger.usdBalance -= exitVal;
        ledger.ethBalance += units;
      }

      pos.status    = 'CLOSED';
      pos.exitPrice = exitPrice;
      pos.pnl       = pnl;
      ledger.tradeHistory.push(pos);
      closedCount++;

      alerts.push(
        `🔔 ${closeReason} | ${symbol} | ` +
        `Entry: $${pos.entryPrice.toFixed(2)} → Exit: $${exitPrice.toFixed(2)} | ` +
        `PnL: ${pnlSign}$${pnl.toFixed(2)}`
      );
    } else {
      stillOpen.push(pos);
    }
  }

  ledger.positions = stillOpen;
  saveLedger(ledger);

  return { closedCount, alerts, openCount: stillOpen.filter(p => p.status === 'OPEN').length };
}

// ── Unrealized PnL snapshot (for dashboard display) ──────────

export async function getUnrealizedPnL(): Promise<{
  byPosition: Array<{ id: string; pair: string; pnl: number; pnlPct: number }>;
  total: number;
}> {
  const ledger = loadLedger();
  const open   = ledger.positions.filter(p => p.status === 'OPEN');
  if (open.length === 0) return { byPosition: [], total: 0 };

  const symbols = [...new Set(open.map(p => assetFromPair(p.pair)))];
  const prices  = await getPrices(symbols);

  let total = 0;
  const byPosition = open.map(pos => {
    const sym   = assetFromPair(pos.pair);
    const price = prices[sym] ?? pos.entryPrice;
    const units = pos.amountUsd / pos.entryPrice;
    const curVal = units * price;
    const pnl   = pos.action === 'BUY' ? curVal - pos.amountUsd : pos.amountUsd - curVal;
    const pnlPct = (pnl / pos.amountUsd) * 100;
    total += pnl;
    return { id: pos.id, pair: pos.pair, pnl, pnlPct };
  });

  return { byPosition, total };
}

// src/analysis.ts
// ============================================================
// Performance Tracking & Regression Analysis
//
// - getMetricsByTier()   → win rate, PnL, drawdown per tier
// - generateWeeklySummary() → formatted weekly report string
// - exportToCsv()        → writes data/trades.csv
// - appendMarketState()  → logs market state changes
// ============================================================

import * as fs   from 'fs';
import * as path from 'path';
import { loadLedger, type Position } from './executor.js';

const DATA_DIR         = path.resolve('data');
const TRADES_CSV       = path.join(DATA_DIR, 'trades.csv');
const MARKET_STATE_LOG = path.join(DATA_DIR, 'market-states.json');

// Ensure data/ exists
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// ── Types ──────────────────────────────────────────────────────

export interface TierMetrics {
  tier: number | 'all';
  totalTrades: number;
  winCount: number;
  lossCount: number;
  winRate: number;        // 0–1
  totalPnl: number;
  avgProfit: number;
  avgLoss: number;
  maxDrawdown: number;
  profitFactor: number;   // gross profit / gross loss
}

export interface MarketStateEntry {
  timestamp: string;
  state: 'BULL' | 'NEUTRAL' | 'BEAR';
  fearGreed: number;
  btcDominance: number;
  ethChange24h: number;
}

// ── Helpers ────────────────────────────────────────────────────

function tierFromPosition(pos: Position): number {
  // Positions store tier in id prefix: "t1-trade-...", "t2-trade-..."
  // Fall back to 1 for legacy positions without prefix.
  const match = pos.id.match(/^t(\d)-/);
  return match ? parseInt(match[1], 10) : 1;
}

function calcDrawdown(positions: Position[]): number {
  // Max peak-to-trough on cumulative PnL curve
  let peak = 0;
  let cumPnl = 0;
  let maxDD = 0;
  for (const p of positions) {
    cumPnl += p.pnl ?? 0;
    if (cumPnl > peak) peak = cumPnl;
    const dd = peak - cumPnl;
    if (dd > maxDD) maxDD = dd;
  }
  return maxDD;
}

// ── Core metrics ───────────────────────────────────────────────

export function getMetrics(positions: Position[], tier: number | 'all'): TierMetrics {
  const closed  = positions.filter(p => p.status === 'CLOSED' && p.pnl !== undefined);
  const winners = closed.filter(p => (p.pnl ?? 0) > 0);
  const losers  = closed.filter(p => (p.pnl ?? 0) <= 0);

  const totalPnl    = closed.reduce((s, p) => s + (p.pnl ?? 0), 0);
  const grossProfit = winners.reduce((s, p) => s + (p.pnl ?? 0), 0);
  const grossLoss   = Math.abs(losers.reduce((s, p) => s + (p.pnl ?? 0), 0));

  return {
    tier,
    totalTrades:  closed.length,
    winCount:     winners.length,
    lossCount:    losers.length,
    winRate:      closed.length > 0 ? winners.length / closed.length : 0,
    totalPnl,
    avgProfit:    winners.length > 0 ? grossProfit / winners.length : 0,
    avgLoss:      losers.length  > 0 ? grossLoss   / losers.length  : 0,
    maxDrawdown:  calcDrawdown(closed),
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0,
  };
}

export function getMetricsByTier(): Record<string, TierMetrics> {
  const { tradeHistory } = loadLedger();
  const byTier: Record<number, Position[]> = { 1: [], 2: [], 3: [], 4: [] };

  for (const pos of tradeHistory) {
    const t = tierFromPosition(pos);
    if (!byTier[t]) byTier[t] = [];
    byTier[t].push(pos);
  }

  const result: Record<string, TierMetrics> = {};
  for (const [tier, positions] of Object.entries(byTier)) {
    result[`tier${tier}`] = getMetrics(positions, parseInt(tier, 10));
  }
  result.all = getMetrics(tradeHistory, 'all');
  return result;
}

// ── Weekly summary ─────────────────────────────────────────────

export function generateWeeklySummary(startingValue?: number): string {
  const ledger  = loadLedger();
  const metrics = getMetricsByTier();
  const now     = new Date();

  // Approximate current portfolio value (ETH at last known price)
  const ethPrice = 2000; // Will be overridden by caller if available
  const curValue = ledger.usdBalance + ledger.ethBalance * ethPrice;
  const gainLoss = startingValue ? curValue - startingValue : metrics.all.totalPnl;
  const gainPct  = startingValue && startingValue > 0
    ? ((gainLoss / startingValue) * 100).toFixed(1)
    : 'N/A';

  const lines: string[] = [
    `WEEKLY PERFORMANCE SUMMARY — Week ending ${now.toLocaleDateString()}`,
    '━'.repeat(50),
  ];

  if (startingValue) {
    lines.push(`Portfolio: $${startingValue.toFixed(2)} → $${curValue.toFixed(2)} (${gainPct}%)`);
    lines.push('');
  }

  for (const [key, m] of Object.entries(metrics)) {
    if (key === 'all' || m.totalTrades === 0) continue;
    const sign = m.totalPnl >= 0 ? '+' : '';
    lines.push(
      `${key.toUpperCase()}: ${sign}$${m.totalPnl.toFixed(2)} | ` +
      `${m.totalTrades} trades | ` +
      `Win rate: ${(m.winRate * 100).toFixed(0)}% | ` +
      `PF: ${isFinite(m.profitFactor) ? m.profitFactor.toFixed(2) : '∞'}`
    );
  }

  lines.push('');
  const all = metrics.all;
  if (all.totalTrades > 0) {
    const sign = all.totalPnl >= 0 ? '+' : '';
    lines.push(`TOTAL: ${sign}$${all.totalPnl.toFixed(2)} across ${all.totalTrades} trades`);
    lines.push(`  Win rate: ${(all.winRate * 100).toFixed(0)}%`);
    lines.push(`  Avg profit: +$${all.avgProfit.toFixed(2)} | Avg loss: -$${all.avgLoss.toFixed(2)}`);
    lines.push(`  Max drawdown: $${all.maxDrawdown.toFixed(2)}`);
  } else {
    lines.push('No closed trades yet.');
  }

  return lines.join('\n');
}

// ── CSV export ─────────────────────────────────────────────────

export function exportToCsv(): string {
  const { tradeHistory } = loadLedger();

  const headers = [
    'id', 'tier', 'timestamp', 'action', 'pair',
    'entryPrice', 'exitPrice', 'amountUsd', 'pnl',
    'pnlPct', 'stopLoss', 'takeProfit', 'status',
  ];

  const rows = tradeHistory.map(pos => {
    const tier   = tierFromPosition(pos);
    const pnlPct = pos.pnl !== undefined
      ? ((pos.pnl / pos.amountUsd) * 100).toFixed(2)
      : '';
    return [
      pos.id,
      tier,
      pos.timestamp,
      pos.action,
      pos.pair,
      pos.entryPrice.toFixed(2),
      pos.exitPrice?.toFixed(2) ?? '',
      pos.amountUsd.toFixed(2),
      pos.pnl?.toFixed(2) ?? '',
      pnlPct,
      pos.stopLoss?.toFixed(2) ?? '',
      pos.takeProfit?.toFixed(2) ?? '',
      pos.status,
    ].join(',');
  });

  const csv = [headers.join(','), ...rows].join('\n');
  fs.writeFileSync(TRADES_CSV, csv, 'utf8');
  return TRADES_CSV;
}

// ── Market state log ───────────────────────────────────────────

export function appendMarketState(entry: MarketStateEntry): void {
  let log: MarketStateEntry[] = [];
  if (fs.existsSync(MARKET_STATE_LOG)) {
    try { log = JSON.parse(fs.readFileSync(MARKET_STATE_LOG, 'utf8')); } catch { log = []; }
  }
  log.push(entry);
  // Keep last 500 entries
  if (log.length > 500) log = log.slice(-500);
  fs.writeFileSync(MARKET_STATE_LOG, JSON.stringify(log, null, 2));
}

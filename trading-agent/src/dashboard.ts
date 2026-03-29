// src/dashboard.ts
// ============================================================
// Coolbreeze Dashboard — HTTP server on port 3333
// ============================================================

import * as http from 'http';
import { loadLedger, executePaperTrade } from './executor.js';
import type { RouterResult } from './router.js';
import { getPriceHistory } from './research/alchemy-client.js';

const PORT = 3333;

// ── Agent pause/resume state ──────────────────────────────────

let agentPaused = false;
export function isAgentPaused(): boolean { return agentPaused; }

let sprintMode = false;
export function isSprintMode(): boolean { return sprintMode; }

// ── Research log ──────────────────────────────────────────────

export interface ResearchEntry {
  tier: number;
  asset: string;
  directive: string;
  confidence: number;
  thesis: string;
  timestamp: string;
  nextResearch?: string;
  stopLoss?: number | null;
  takeProfit?: number | null;
}

const researchLog: ResearchEntry[] = [];

export function addResearchEntry(entry: ResearchEntry): void {
  researchLog.unshift(entry);
  if (researchLog.length > 30) researchLog.pop();
}

// ── Tier trigger callbacks (registered by index.ts) ───────────

const tierTriggers = new Map<number, () => Promise<void>>();
export function registerTierTrigger(tier: number, fn: () => Promise<void>): void {
  tierTriggers.set(tier, fn);
}
// Keep backward-compat alias
export function registerTier1Trigger(fn: () => Promise<void>): void {
  tierTriggers.set(1, fn);
}

// ── Shared market state ───────────────────────────────────────

let sharedMarket: RouterResult | null = null;
export function setDashboardMarket(result: RouterResult): void {
  sharedMarket = result;
}

// ── Watched assets ────────────────────────────────────────────

const WATCHED = [
  // ── Core ─────────────────────────────────────────────────────
  { symbol: 'ETH',    name: 'Ethereum',    cgId: 'ethereum',          category: 'Core'     },
  { symbol: 'BTC',    name: 'Bitcoin',     cgId: 'bitcoin',           category: 'Core'     },
  // ── DeFi ─────────────────────────────────────────────────────
  { symbol: 'UNI',    name: 'Uniswap',     cgId: 'uniswap',           category: 'DeFi'     },
  { symbol: 'AAVE',   name: 'Aave',        cgId: 'aave',              category: 'DeFi'     },
  { symbol: 'LINK',   name: 'Chainlink',   cgId: 'chainlink',         category: 'DeFi'     },
  // ── Emerging (Base) ──────────────────────────────────────────
  { symbol: 'MORPHO', name: 'Morpho',      cgId: 'morpho',            category: 'Emerging' },
  { symbol: 'AERO',   name: 'Aerodrome',   cgId: 'aerodrome-finance', category: 'Emerging' },
  { symbol: 'BNKR',   name: 'Bankr',       cgId: 'bankr',             category: 'Emerging' },
  // ── AI ───────────────────────────────────────────────────────
  { symbol: 'RENDER', name: 'Render',      cgId: 'render-token',      category: 'AI'       },
  { symbol: 'TAO',    name: 'Bittensor',   cgId: 'bittensor',         category: 'AI'       },
  { symbol: 'FET',    name: 'Fetch.ai',    cgId: 'fetch-ai',          category: 'AI'       },
  { symbol: 'GRT',    name: 'The Graph',   cgId: 'the-graph',         category: 'AI'       },
  { symbol: 'WLD',    name: 'Worldcoin',   cgId: 'worldcoin-wld',     category: 'AI'       },
  // ── Meme ─────────────────────────────────────────────────────
  { symbol: 'BRETT',  name: 'Based Brett', cgId: 'based-brett',       category: 'Meme'     },
  { symbol: 'TOSHI',  name: 'Toshi',       cgId: 'toshi',             category: 'Meme'     },
  { symbol: 'DEGEN',  name: 'Degen',       cgId: 'degen-base',        category: 'Meme'     },
];

const COINGECKO_IDS: Record<string, string> = Object.fromEntries(WATCHED.map(a => [a.symbol, a.cgId]));

// ── Price cache ───────────────────────────────────────────────

interface PriceData { price: number; change24h: number; vol24h: number; }
let priceCache: Record<string, PriceData> = {};
let priceCacheTime = 0;

// Internal price log for computing 24h change on Alchemy-sourced tokens
const assetPriceLog: Record<string, { price: number; time: number }[]> = {};

function recordAssetPrice(symbol: string, price: number): void {
  if (!assetPriceLog[symbol]) assetPriceLog[symbol] = [];
  assetPriceLog[symbol].push({ price, time: Date.now() });
  const cutoff = Date.now() - 25 * 60 * 60 * 1000;
  assetPriceLog[symbol] = assetPriceLog[symbol].filter(e => e.time > cutoff);
}

function get24hChange(symbol: string, currentPrice: number): number {
  const log = assetPriceLog[symbol] ?? [];
  const target = Date.now() - 24 * 60 * 60 * 1000;
  const old = log.reduce((best: { price: number; time: number } | null, e) =>
    !best || Math.abs(e.time - target) < Math.abs(best.time - target) ? e : best, null);
  if (!old || old.price === 0 || Math.abs(old.time - target) > 2 * 60 * 60 * 1000) return 0;
  return ((currentPrice - old.price) / old.price) * 100;
}

async function getAlchemyPricesBatch(symbols: string[]): Promise<Record<string, number>> {
  const apiKey = process.env.ALCHEMY_API_KEY;
  if (!apiKey) return {};
  try {
    const params = symbols.map(s => `symbols[]=${encodeURIComponent(s)}`).join('&');
    const res = await fetch(`https://api.g.alchemy.com/prices/v1/${apiKey}/tokens/by-symbol?${params}`);
    if (!res.ok) return {};
    const data = await res.json() as {
      data?: Array<{ symbol: string; prices?: Array<{ currency: string; value: string }>; error?: string }>;
    };
    const out: Record<string, number> = {};
    for (const item of data.data ?? []) {
      if (!item.error && item.prices?.length) {
        const usdPrice = item.prices.find(p => p.currency === 'usd');
        if (usdPrice) out[item.symbol.toUpperCase()] = parseFloat(usdPrice.value);
      }
    }
    return out;
  } catch { return {}; }
}

async function getEnrichedPrices(): Promise<Record<string, PriceData>> {
  const now = Date.now();
  if (now - priceCacheTime < 300_000 && Object.keys(priceCache).length > 0) return priceCache;

  // Step 1: Alchemy batch price lookup (no rate limits)
  const alchemyPrices = await getAlchemyPricesBatch(WATCHED.map(a => a.symbol));

  // Step 2: CoinGecko fallback for tokens Alchemy doesn't support
  const missing = WATCHED.filter(a => !alchemyPrices[a.symbol]);
  let geckoData: Record<string, { usd: number; usd_24h_change: number; usd_24h_vol: number }> = {};
  if (missing.length > 0) {
    try {
      const cgIds = missing.map(a => a.cgId).join(',');
      const res = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${cgIds}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true`
      );
      if (res.ok) {
        const raw = await res.json();
        if (raw && typeof raw === 'object' && !raw.status) geckoData = raw;
      }
    } catch { /* ignore */ }
  }

  const out: Record<string, PriceData> = {};
  for (const asset of WATCHED) {
    const alchemyPrice = alchemyPrices[asset.symbol];
    if (alchemyPrice) {
      recordAssetPrice(asset.symbol, alchemyPrice);
      out[asset.symbol] = { price: alchemyPrice, change24h: get24hChange(asset.symbol, alchemyPrice), vol24h: 0 };
    } else {
      const d = geckoData[asset.cgId];
      if (d) {
        recordAssetPrice(asset.symbol, d.usd);
        out[asset.symbol] = { price: d.usd, change24h: d.usd_24h_change ?? 0, vol24h: d.usd_24h_vol ?? 0 };
      } else if (priceCache[asset.symbol]) {
        out[asset.symbol] = priceCache[asset.symbol]; // stale but better than nothing
      }
    }
  }

  priceCache = out;
  priceCacheTime = now;
  return out;
}

// ── API data builder ──────────────────────────────────────────

async function buildApiData() {
  const ledger = loadLedger();
  const openPositions = ledger.positions.filter(p => p.status === 'OPEN');
  const prices = await getEnrichedPrices();
  const ethPrice = prices['ETH']?.price ?? 0;

  const total = ledger.usdBalance + ledger.ethBalance * ethPrice;
  const realizedPnl = ledger.tradeHistory.reduce((sum, t) => sum + (t.pnl ?? 0), 0);

  const history = ledger.portfolioHistory ?? [];
  const now = Date.now();
  function getPctChange(msAgo: number): number | null {
    const past = history.filter(h => new Date(h.timestamp).getTime() <= now - msAgo);
    if (past.length === 0) return null;
    const ref = past[past.length - 1].value;
    return ((total - ref) / ref) * 100;
  }

  const positions = openPositions.map(pos => {
    const sym = pos.pair.split('/')[0].toUpperCase();
    const currentPrice = prices[sym]?.price ?? pos.entryPrice;
    const units = pos.amountUsd / pos.entryPrice;
    const pnl = pos.action === 'BUY'
      ? units * currentPrice - pos.amountUsd
      : pos.amountUsd - units * currentPrice;
    return { ...pos, currentPrice, pnl, pnlPct: (pnl / pos.amountUsd) * 100 };
  });

  const watchedAssets = WATCHED.map(a => ({
    ...a,
    ...(prices[a.symbol] ?? { price: 0, change24h: 0, vol24h: 0 }),
  }));

  return {
    agentStatus: agentPaused ? 'paused' : 'running',
    sprintMode,
    portfolio: {
      total, usdBalance: ledger.usdBalance, ethBalance: ledger.ethBalance, ethPrice,
      change: {
        '24h': getPctChange(86_400_000),
        '7d':  getPctChange(604_800_000),
        '30d': getPctChange(2_592_000_000),
        '365d':getPctChange(31_536_000_000),
        'total': ((total - 1000) / 1000) * 100,
      },
    },
    positions,
    watchedAssets,
    researchLog,
    registeredTiers: [...tierTriggers.keys()],
    market: sharedMarket,
    realizedPnl,
    tradeCount: ledger.tradeHistory.length,
    tradeHistory: ledger.tradeHistory.slice().reverse().slice(0, 50),
    portfolioHistory: ledger.portfolioHistory ?? [],
    lastUpdated: new Date().toISOString(),
  };
}

// ── Embedded HTML ─────────────────────────────────────────────

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Coolbreeze</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg: #0e0e10;
    --surface: #16161a;
    --surface-2: #1c1c21;
    --border: #26262c;
    --border-soft: #1e1e24;
    --text-primary: #f0f0f2;
    --text-secondary: #8b8b99;
    --text-muted: #4a4a58;
    --green: #5eead4;
    --green-bg: rgba(94,234,212,0.08);
    --red: #f87171;
    --red-bg: rgba(248,113,113,0.08);
    --blue: #818cf8;
    --blue-bg: rgba(129,140,248,0.08);
    --amber: #fbbf24;
    --radius: 4px;
    --font: 'Helvetica Neue', Helvetica, Arial, sans-serif;
  }

  body.light {
    --bg: #f5f5f7;
    --surface: #ffffff;
    --surface-2: #f0f0f2;
    --border: #e2e2e6;
    --border-soft: #eaeaee;
    --text-primary: #111114;
    --text-secondary: #5a5a68;
    --text-muted: #9a9aaa;
    --green: #0d9488;
    --green-bg: rgba(13,148,136,0.07);
    --red: #dc2626;
    --red-bg: rgba(220,38,38,0.07);
    --blue: #4f46e5;
    --blue-bg: rgba(79,70,229,0.07);
    --amber: #d97706;
  }

  /* ── PnL Chart ── */
  .chart-card {
    background: var(--surface);
    border: 1px solid var(--border);
    padding: 20px 24px 16px;
    margin-bottom: 16px;
  }
  .chart-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
  .chart-title {
    font-size: 10px; font-weight: 600; letter-spacing: 0.12em;
    text-transform: uppercase; color: var(--text-muted);
  }
  .chart-wrap { position: relative; height: 180px; }

  /* ── Trade history ── */
  .td-closed-pos { color: var(--green); font-weight: 500; }
  .td-closed-neg { color: var(--red); font-weight: 500; }

  /* ── Asset grid expanded ── */
  .assets-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; }
  @media (max-width: 1200px) { .assets-grid { grid-template-columns: repeat(3, 1fr); } }
  @media (max-width: 700px)  { .assets-grid { grid-template-columns: repeat(2, 1fr); } }

  /* ── Asset category groups ── */
  .asset-group { margin-bottom: 20px; }
  .asset-group-label {
    font-size: 10px; font-weight: 600; letter-spacing: 0.14em;
    text-transform: uppercase; color: var(--text-muted);
    margin-bottom: 10px; padding-bottom: 8px;
    border-bottom: 1px solid var(--border-soft);
  }

  /* ── Theme toggle ── */
  .theme-btn {
    font-family: var(--font); font-size: 16px; line-height: 1;
    background: transparent; border: 1px solid var(--border);
    color: var(--text-muted); cursor: pointer; padding: 5px 9px;
    transition: all 0.1s;
  }
  .theme-btn:hover { color: var(--text-primary); border-color: #3a3a44; }

  body {
    background: var(--bg);
    color: var(--text-primary);
    font-family: var(--font);
    font-size: 14px;
    line-height: 1.5;
    min-height: 100vh;
  }

  /* ── Header ── */
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 28px;
    border-bottom: 1px solid var(--border);
    background: var(--surface);
    position: sticky;
    top: 0;
    z-index: 10;
  }
  .header-left { display: flex; align-items: center; gap: 16px; }
  .logo { font-size: 13px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: var(--text-primary); }
  .logo-dot { color: var(--green); }
  .tag {
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-muted);
    border: 1px solid var(--border);
    padding: 2px 8px;
  }

  .header-right { display: flex; align-items: center; gap: 16px; }
  .status-pill {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-secondary);
  }
  .status-dot {
    width: 6px; height: 6px;
    border-radius: 50%;
    background: var(--green);
  }
  .status-dot.paused { background: var(--amber); }
  .last-update { font-size: 11px; color: var(--text-muted); }

  .btn {
    font-family: var(--font);
    font-size: 12px;
    font-weight: 500;
    letter-spacing: 0.04em;
    padding: 7px 16px;
    border: 1px solid var(--border);
    background: var(--surface-2);
    color: var(--text-primary);
    cursor: pointer;
    transition: background 0.1s, border-color 0.1s;
  }
  .btn:hover { background: var(--border); }
  .btn.stop { border-color: var(--red); color: var(--red); }
  .btn.stop:hover { background: var(--red-bg); }
  .btn.start { border-color: var(--green); color: var(--green); }
  .btn.start:hover { background: var(--green-bg); }
  .btn.ghost { border-color: var(--border); color: var(--text-secondary); }
  .btn.ghost:hover { color: var(--text-primary); border-color: #3a3a44; }
  .btn.dim { border-color: transparent; color: var(--text-muted); background: transparent; }
  .btn.dim:hover { color: var(--text-secondary); border-color: var(--border); }
  .btn.sprint { border-color: var(--amber); color: var(--amber); }
  .btn.sprint:hover { background: rgba(251,191,36,0.08); }
  .btn.sprint.active { background: rgba(251,191,36,0.08); }

  /* ── Research log ── */
  .research-section-header {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 14px; padding-bottom: 10px; border-bottom: 1px solid var(--border-soft);
  }
  .research-filter-tabs { display: flex; gap: 2px; }
  .filter-tab {
    font-family: var(--font); font-size: 10px; font-weight: 600;
    letter-spacing: 0.08em; text-transform: uppercase;
    padding: 4px 10px; background: transparent;
    border: 1px solid transparent; color: var(--text-muted); cursor: pointer;
    transition: all 0.1s;
  }
  .filter-tab:hover { color: var(--text-secondary); border-color: var(--border); }
  .filter-tab.active { color: var(--text-primary); background: var(--surface-2); border-color: var(--border); }
  .filter-tab.ft1.active { color: var(--blue); border-color: rgba(129,140,248,0.4); background: var(--blue-bg); }
  .filter-tab.ft2.active { color: var(--green); border-color: rgba(94,234,212,0.4); background: var(--green-bg); }
  .filter-tab.ft3.active { color: var(--amber); border-color: rgba(251,191,36,0.4); background: rgba(251,191,36,0.08); }
  .filter-tab.ft4.active { color: var(--red); border-color: rgba(248,113,113,0.4); background: var(--red-bg); }
  .collapse-btn {
    font-family: var(--font); font-size: 10px; font-weight: 600;
    letter-spacing: 0.08em; text-transform: uppercase;
    padding: 4px 10px; background: transparent; border: 1px solid var(--border);
    color: var(--text-muted); cursor: pointer; transition: all 0.1s;
  }
  .collapse-btn:hover { color: var(--text-secondary); border-color: #3a3a44; }
  .research-empty {
    border: 1px dashed var(--border);
    padding: 32px;
    text-align: center;
    color: var(--text-muted);
    font-size: 12px;
    letter-spacing: 0.04em;
  }
  .research-card {
    background: var(--surface);
    border: 1px solid var(--border);
    padding: 20px;
    margin-bottom: 10px;
  }
  .research-card:last-child { margin-bottom: 0; }
  .research-header { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; flex-wrap: wrap; }
  .tier-badge {
    font-size: 10px; font-weight: 700; letter-spacing: 0.1em;
    padding: 3px 8px; border: 1px solid;
  }
  .tier-1 { color: var(--blue); border-color: rgba(129,140,248,0.4); background: var(--blue-bg); }
  .tier-2 { color: var(--green); border-color: rgba(94,234,212,0.4); background: var(--green-bg); }
  .tier-3 { color: var(--amber); border-color: rgba(251,191,36,0.4); background: rgba(251,191,36,0.08); }
  .tier-4 { color: var(--red); border-color: rgba(248,113,113,0.4); background: var(--red-bg); }
  .directive-badge {
    font-size: 10px; font-weight: 700; letter-spacing: 0.1em;
    padding: 3px 8px; border: 1px solid var(--border);
    color: var(--text-secondary); background: var(--surface-2);
  }
  .directive-LONG, .directive-ACCUMULATE, .directive-ENTER {
    color: var(--green); border-color: rgba(94,234,212,0.3); background: var(--green-bg);
  }
  .directive-SHORT, .directive-REDUCE, .directive-EXIT {
    color: var(--red); border-color: rgba(248,113,113,0.3); background: var(--red-bg);
  }
  .research-asset { font-size: 13px; font-weight: 600; color: var(--text-primary); }
  .research-time { font-size: 11px; color: var(--text-muted); margin-left: auto; }
  .confidence-bar { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
  .confidence-track { flex: 1; height: 2px; background: var(--border); max-width: 120px; }
  .confidence-fill { height: 100%; background: var(--blue); }
  .confidence-label { font-size: 11px; color: var(--text-muted); }
  .research-thesis {
    font-size: 12px; line-height: 1.7; color: var(--text-secondary);
    border-left: 2px solid var(--border);
    padding-left: 12px;
    margin-bottom: 10px;
  }
  .research-thesis.collapsed {
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
  }
  .research-meta { display: flex; gap: 16px; flex-wrap: wrap; }
  .research-meta-item { font-size: 11px; color: var(--text-muted); }
  .research-meta-item span { color: var(--text-secondary); }
  .expand-btn {
    font-family: var(--font); font-size: 11px; color: var(--text-muted);
    background: none; border: none; cursor: pointer; padding: 0; margin-top: 4px;
  }
  .expand-btn:hover { color: var(--text-secondary); }

  /* ── Footer ── */
  .footer {
    position: fixed; bottom: 0; left: 0; right: 0;
    background: var(--surface);
    border-top: 1px solid var(--border);
    padding: 12px 28px;
    display: flex; align-items: center; justify-content: space-between;
    z-index: 10;
  }
  .footer-left { display: flex; align-items: center; gap: 8px; }
  .footer-label { font-size: 10px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: var(--text-muted); margin-right: 4px; }
  .tier-btn {
    font-family: var(--font); font-size: 11px; font-weight: 600;
    letter-spacing: 0.06em; padding: 5px 14px;
    background: transparent; border: 1px solid var(--border);
    color: var(--text-muted); cursor: pointer; transition: all 0.1s;
  }
  .tier-btn:hover { color: var(--text-primary); border-color: #3a3a44; }
  .tier-btn.selected { color: var(--text-primary); background: var(--surface-2); border-color: #3a3a44; }
  .tier-btn.t1.selected { color: var(--blue); border-color: rgba(129,140,248,0.4); background: var(--blue-bg); }
  .tier-btn.t2.selected { color: var(--green); border-color: rgba(94,234,212,0.4); background: var(--green-bg); }
  .tier-btn.t3.selected { color: var(--amber); border-color: rgba(251,191,36,0.4); background: rgba(251,191,36,0.08); }
  .tier-btn.t4.selected { color: var(--red); border-color: rgba(248,113,113,0.4); background: var(--red-bg); }

  .toast {
    position: fixed; bottom: 24px; right: 24px;
    padding: 10px 18px; font-size: 12px; font-weight: 500;
    border: 1px solid var(--border); background: var(--surface-2);
    color: var(--text-primary); z-index: 100;
    opacity: 0; transform: translateY(8px);
    transition: opacity 0.2s, transform 0.2s;
    pointer-events: none;
  }
  .toast.show { opacity: 1; transform: translateY(0); }
  .toast.ok  { border-color: rgba(94,234,212,0.4); color: var(--green); }
  .toast.err { border-color: rgba(248,113,113,0.4); color: var(--red); }

  /* ── Layout ── */
  .page { padding: 28px; max-width: 1400px; margin: 0 auto; }
  .section { margin-bottom: 28px; }
  .section-label {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--text-muted);
    margin-bottom: 14px;
    padding-bottom: 10px;
    border-bottom: 1px solid var(--border-soft);
  }

  /* ── KPI card ── */
  .kpi-card {
    background: var(--surface);
    border: 1px solid var(--border);
    padding: 28px;
    margin-bottom: 16px;
  }
  .kpi-label {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-muted);
    margin-bottom: 12px;
  }
  .kpi-row { display: flex; align-items: flex-end; justify-content: space-between; flex-wrap: wrap; gap: 16px; margin-bottom: 20px; }
  .kpi-value { font-size: 48px; font-weight: 300; letter-spacing: -0.02em; color: var(--text-primary); line-height: 1; }
  .kpi-change {
    font-size: 13px;
    font-weight: 500;
    padding: 5px 12px;
    border: 1px solid transparent;
  }
  .kpi-change.pos { color: var(--green); background: var(--green-bg); border-color: rgba(94,234,212,0.2); }
  .kpi-change.neg { color: var(--red); background: var(--red-bg); border-color: rgba(248,113,113,0.2); }
  .kpi-change.na  { color: var(--text-muted); background: transparent; border-color: var(--border); }

  .period-tabs { display: flex; gap: 2px; }
  .period-btn {
    font-family: var(--font);
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.06em;
    padding: 5px 14px;
    background: transparent;
    border: 1px solid transparent;
    color: var(--text-muted);
    cursor: pointer;
    transition: all 0.1s;
  }
  .period-btn:hover { color: var(--text-secondary); border-color: var(--border); }
  .period-btn.active { color: var(--text-primary); background: var(--surface-2); border-color: var(--border); }

  /* ── Stat cards ── */
  .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 28px; }
  @media (max-width: 900px) { .stats-grid { grid-template-columns: repeat(2, 1fr); } }

  .stat-card {
    background: var(--surface);
    border: 1px solid var(--border);
    padding: 20px;
  }
  .stat-label {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-muted);
    margin-bottom: 10px;
  }
  .stat-value { font-size: 22px; font-weight: 400; color: var(--text-primary); line-height: 1.2; }
  .stat-value.pos { color: var(--green); }
  .stat-value.neg { color: var(--red); }
  .stat-sub { font-size: 11px; color: var(--text-muted); margin-top: 5px; }

  .market-badge {
    display: inline-block;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    padding: 3px 8px;
    border: 1px solid;
  }
  .market-BULL { color: var(--green); border-color: rgba(94,234,212,0.3); background: var(--green-bg); }
  .market-BEAR { color: var(--red); border-color: rgba(248,113,113,0.3); background: var(--red-bg); }
  .market-NEUTRAL { color: var(--text-secondary); border-color: var(--border); background: transparent; }

  .tier4-badge {
    display: inline-block;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    padding: 3px 8px;
    border: 1px solid;
  }
  .tier4-active   { color: var(--green); border-color: rgba(94,234,212,0.3); background: var(--green-bg); }
  .tier4-inactive { color: var(--text-muted); border-color: var(--border); background: transparent; }

  .criteria { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px; }
  .criterion {
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.04em;
    padding: 2px 6px;
    border: 1px solid;
  }
  .c-met   { color: var(--green); border-color: rgba(94,234,212,0.2); }
  .c-unmet { color: var(--text-muted); border-color: var(--border); }

  /* ── Watched assets ── */

  .asset-card {
    background: var(--surface);
    border: 1px solid var(--border);
    padding: 18px 20px;
    transition: border-color 0.15s;
  }
  .asset-card:hover { border-color: #3a3a44; }
  .asset-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
  .asset-symbol { font-size: 13px; font-weight: 600; letter-spacing: 0.04em; color: var(--text-primary); }
  .asset-name   { font-size: 10px; color: var(--text-muted); margin-top: 1px; }
  .asset-price  { font-size: 18px; font-weight: 400; color: var(--text-primary); margin-bottom: 6px; }
  .asset-change { font-size: 12px; font-weight: 500; }
  .asset-change.pos { color: var(--green); }
  .asset-change.neg { color: var(--red); }
  .asset-vol { font-size: 10px; color: var(--text-muted); margin-top: 4px; }

  /* ── Table ── */
  .table-card {
    background: var(--surface);
    border: 1px solid var(--border);
    overflow: hidden;
  }
  .table-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 20px;
    border-bottom: 1px solid var(--border);
  }
  .table-title {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-muted);
  }
  .table-count { font-size: 11px; color: var(--text-muted); }

  table { width: 100%; border-collapse: collapse; }
  th {
    text-align: left;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-muted);
    padding: 10px 20px;
    border-bottom: 1px solid var(--border-soft);
    white-space: nowrap;
  }
  td { padding: 14px 20px; border-bottom: 1px solid var(--border-soft); font-size: 13px; }
  tr:last-child td { border-bottom: none; }
  tbody tr:hover td { background: rgba(255,255,255,0.015); }

  .td-pair { font-weight: 500; color: var(--text-primary); }
  .td-action {
    display: inline-block;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.06em;
    padding: 2px 6px;
    border: 1px solid;
    margin-top: 3px;
    color: var(--blue);
    border-color: rgba(129,140,248,0.3);
    background: var(--blue-bg);
  }
  .td-pos { color: var(--green); font-weight: 500; }
  .td-neg { color: var(--red); font-weight: 500; }
  .td-muted { color: var(--text-muted); font-size: 11px; }
  .td-tp { color: var(--green); }
  .td-sl { color: var(--red); }

  .empty-state {
    text-align: center;
    padding: 60px 20px;
    color: var(--text-muted);
    font-size: 13px;
    letter-spacing: 0.02em;
  }
  .empty-state small { display: block; margin-top: 6px; font-size: 11px; color: var(--text-muted); opacity: 0.6; }
</style>
</head>
<body>

<!-- Header -->
<header class="header">
  <div class="header-left">
    <span class="logo">Coolbreeze<span class="logo-dot">.</span></span>
    <span class="tag">Paper Mode</span>
  </div>
  <div class="header-right">
    <div class="status-pill">
      <span class="status-dot" id="statusDot"></span>
      <span id="statusLabel">Running</span>
    </div>
    <span class="last-update" id="lastUpdate">—</span>
    <button class="theme-btn" id="themeBtn" onclick="toggleTheme()" title="Toggle light/dark mode">☀</button>
    <button class="btn sprint" id="sprintBtn" onclick="toggleSprint()">Sprint</button>
    <button class="btn stop" id="toggleBtn" onclick="toggleAgent()">Pause Bot</button>
  </div>
</header>
<div class="toast" id="toast"></div>

<div class="page" style="padding-bottom: 72px">

  <!-- Research Log -->
  <div class="section" id="researchSection" style="display:none">
    <div class="research-section-header">
      <div class="research-filter-tabs">
        <button class="filter-tab active" data-filter="all" onclick="setLogFilter(this)">All</button>
        <button class="filter-tab ft1" data-filter="1" onclick="setLogFilter(this)">T1 · Macro</button>
        <button class="filter-tab ft2" data-filter="2" onclick="setLogFilter(this)">T2 · DeFi</button>
        <button class="filter-tab ft3" data-filter="3" onclick="setLogFilter(this)">T3 · Emerging</button>
        <button class="filter-tab ft4" data-filter="4" onclick="setLogFilter(this)">T4 · Meme</button>
      </div>
      <button class="collapse-btn" id="collapseLogBtn" onclick="toggleLogCollapse()">Minimize ↑</button>
    </div>
    <div id="researchLog"></div>
  </div>

  <!-- Portfolio KPI -->
  <div class="kpi-card">
    <div class="kpi-label">Total Portfolio Value</div>
    <div class="kpi-row">
      <div class="kpi-value" id="portfolioValue">—</div>
      <div class="kpi-change na" id="kpiChange">—</div>
    </div>
    <div class="period-tabs" id="periodTabs">
      <button class="period-btn active" data-p="24h">24h</button>
      <button class="period-btn" data-p="7d">7d</button>
      <button class="period-btn" data-p="30d">30d</button>
      <button class="period-btn" data-p="365d">1y</button>
      <button class="period-btn" data-p="total">All time</button>
    </div>
  </div>

  <!-- PnL Chart -->
  <div class="chart-card">
    <div class="chart-header">
      <span class="chart-title">Portfolio Value Over Time</span>
      <span class="td-muted" id="chartPoints" style="font-size:11px"></span>
    </div>
    <div class="chart-wrap">
      <canvas id="pnlChart"></canvas>
    </div>
  </div>

  <!-- Stat cards -->
  <div class="stats-grid">
    <div class="stat-card">
      <div class="stat-label">USDC Balance</div>
      <div class="stat-value" id="usdBalance">—</div>
      <div class="stat-sub">Available cash</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Realized PnL</div>
      <div class="stat-value" id="realizedPnl">—</div>
      <div class="stat-sub" id="tradeCount">— closed trades</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Market State</div>
      <div style="margin-top:4px">
        <span class="market-badge market-NEUTRAL" id="marketState">—</span>
        <span style="margin-left:8px;font-size:12px;color:var(--text-secondary)" id="fearGreed">—</span>
      </div>
      <div class="stat-sub" style="margin-top:8px">BTC Dom <span id="btcDom">—</span></div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Tier 4</div>
      <div style="margin-top:4px">
        <span class="tier4-badge tier4-inactive" id="tier4Badge">Inactive</span>
      </div>
      <div class="criteria" id="tier4Criteria"></div>
    </div>
  </div>

  <!-- Watched Assets -->
  <div class="section">
    <div class="section-label">Watched Assets</div>
    <div id="assetsGrid"><div style="color:var(--text-muted);font-size:12px;padding:20px">Loading…</div></div>
  </div>

  <!-- Open Positions -->
  <div class="section">
    <div class="section-label">Open Positions</div>
    <div class="table-card">
      <div class="table-header">
        <span class="table-title">Active Trades</span>
        <span class="table-count" id="posCount">0 positions</span>
      </div>
      <table>
        <thead>
          <tr>
            <th>Pair</th>
            <th>Entry</th>
            <th>Current</th>
            <th>Size</th>
            <th>Unrealized PnL</th>
            <th>Take Profit</th>
            <th>Stop Loss</th>
            <th>Opened</th>
          </tr>
        </thead>
        <tbody id="positionsBody">
          <tr><td colspan="8" class="empty-state">No open positions<small>Monitoring for entry signals</small></td></tr>
        </tbody>
      </table>
    </div>
  </div>

  <!-- Trade History -->
  <div class="section">
    <div class="section-label">Trade History</div>
    <div class="table-card">
      <div class="table-header">
        <span class="table-title">Closed Trades</span>
        <span class="table-count" id="historyCount">0 trades</span>
      </div>
      <table>
        <thead>
          <tr>
            <th>Pair</th>
            <th>Action</th>
            <th>Entry</th>
            <th>Exit</th>
            <th>Size</th>
            <th>PnL</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody id="historyBody">
          <tr><td colspan="7" class="empty-state">No closed trades yet<small>Paper trades will appear here</small></td></tr>
        </tbody>
      </table>
    </div>
  </div>

</div>

<!-- Footer -->
<footer class="footer">
  <div class="footer-left">
    <span class="footer-label">Research</span>
    <button class="tier-btn t1 selected" data-tier="1" onclick="selectTier(this)">T1 · Macro</button>
    <button class="tier-btn t2" data-tier="2" onclick="selectTier(this)">T2 · DeFi</button>
    <button class="tier-btn t3" data-tier="3" onclick="selectTier(this)">T3 · Emerging</button>
    <button class="tier-btn t4" data-tier="4" onclick="selectTier(this)">T4 · Meme</button>
    <button class="btn" id="runBtn" onclick="runTier()" style="margin-left:8px">Run T1</button>
  </div>
  <div style="display:flex;gap:8px;align-items:center">
    <div id="buyForm" style="display:none;align-items:center;gap:8px">
      <select id="buyAsset" class="btn" style="cursor:pointer"></select>
      <input id="buyAmount" type="number" placeholder="USD amount" style="width:100px;padding:6px 10px;background:var(--surface-2);border:1px solid var(--border);color:var(--text-primary);font-family:var(--font);font-size:12px">
      <button class="btn start" onclick="executeBuy()">Execute Paper Buy</button>
      <button class="btn dim" onclick="toggleBuyForm()">Cancel</button>
    </div>
    <button class="btn ghost" id="buyBtn" onclick="toggleBuyForm()">+ Buy</button>
    <button class="btn dim" onclick="testAlchemy()">Test Alchemy</button>
  </div>
</footer>

<script>
  let data = null;
  let period = '24h';
  let selectedTier = 1;
  let logFilter = 'all';
  let logCollapsed = false;
  let countdown = 30;
  let pnlChart = null;

  // ── Formatters ──
  const usd = n => n == null ? '—' : '$' + new Intl.NumberFormat('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n);
  const pct = n => n == null ? 'N/A' : (n>=0?'+':'')+n.toFixed(2)+'%';
  const compact = n => {
    if (n == null) return '—';
    if (Math.abs(n) >= 1e9) return '$'+(n/1e9).toFixed(1)+'B';
    if (Math.abs(n) >= 1e6) return '$'+(n/1e6).toFixed(1)+'M';
    return usd(n);
  };
  const fmtDate = iso => {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('en-US',{month:'short',day:'numeric'}) + ' ' + d.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});
  };
  const timeAgo = iso => {
    if (!iso) return '—';
    const s = Math.floor((Date.now() - new Date(iso)) / 1000);
    if (s < 60) return s + 's ago';
    if (s < 3600) return Math.floor(s/60) + 'm ago';
    return Math.floor(s/3600) + 'h ago';
  };

  // ── Period tabs ──
  document.getElementById('periodTabs').addEventListener('click', e => {
    const btn = e.target.closest('.period-btn');
    if (!btn) return;
    document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    period = btn.dataset.p;
    renderChange();
  });

  function renderChange() {
    if (!data) return;
    const val = data.portfolio.change[period];
    const el = document.getElementById('kpiChange');
    if (val == null) { el.textContent = 'N/A'; el.className = 'kpi-change na'; return; }
    el.textContent = pct(val);
    el.className = 'kpi-change ' + (val >= 0 ? 'pos' : 'neg');
  }

  // ── Toast ──
  let toastTimer;
  function showToast(msg, type = '') {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className = 'toast show' + (type ? ' ' + type : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.className = 'toast', 4000);
  }

  // ── Tier selector ──
  const tierLabels = { 1: 'T1 · Macro', 2: 'T2 · DeFi', 3: 'T3 · Emerging', 4: 'T4 · Meme' };
  function selectTier(btn) {
    document.querySelectorAll('.tier-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    selectedTier = parseInt(btn.dataset.tier);
    document.getElementById('runBtn').textContent = 'Run T' + selectedTier;
  }

  // ── Run selected tier ──
  async function runTier() {
    showToast('Triggering Tier ' + selectedTier + ' research…');
    try {
      const res = await fetch('/api/trigger/tier' + selectedTier, { method: 'POST' });
      const d = await res.json();
      if (d.status === 'triggered') {
        showToast('✓ Tier ' + selectedTier + ' triggered — results will appear above', 'ok');
        setTimeout(loadData, 3000);
      } else {
        showToast('✗ ' + (d.error || 'Unknown error'), 'err');
      }
    } catch(e) { showToast('✗ Request failed', 'err'); }
  }

  // ── Alchemy test ──
  async function testAlchemy() {
    showToast('Testing Alchemy connection…');
    try {
      const res = await fetch('/api/alchemy-check');
      const d = await res.json();
      showToast(d.ok ? '✓ Alchemy: ' + d.message : '✗ Alchemy: ' + d.message, d.ok ? 'ok' : 'err');
    } catch(e) { showToast('✗ Request failed', 'err'); }
  }

  // ── Log filter ──
  function setLogFilter(btn) {
    document.querySelectorAll('.filter-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    logFilter = btn.dataset.filter;
    if (data) renderResearchLog(data.researchLog);
  }

  // ── Log collapse ──
  function toggleLogCollapse() {
    logCollapsed = !logCollapsed;
    const container = document.getElementById('researchLog');
    const btn = document.getElementById('collapseLogBtn');
    container.style.display = logCollapsed ? 'none' : 'block';
    btn.textContent = logCollapsed ? 'Expand ↓' : 'Minimize ↑';
  }

  // ── Research log renderer ──
  function renderResearchLog(log) {
    const section = document.getElementById('researchSection');
    const container = document.getElementById('researchLog');
    if (!log || log.length === 0) { section.style.display = 'none'; return; }
    section.style.display = 'block';
    if (logCollapsed) return;
    const filtered = logFilter === 'all' ? log : log.filter(e => String(e.tier) === logFilter);
    container.innerHTML = filtered.map((e, i) => {
      const dirClass = 'directive-' + e.directive;
      const tierClass = 'tier-' + e.tier;
      const confPct = Math.round((e.confidence || 0) * 100);
      const time = new Date(e.timestamp).toLocaleString('en-US', {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
      return \`<div class="research-card">
        <div class="research-header">
          <span class="tier-badge \${tierClass}">TIER \${e.tier}</span>
          <span class="research-asset">\${e.asset}</span>
          <span class="directive-badge \${dirClass}">\${e.directive}</span>
          <span class="research-time">\${time}</span>
        </div>
        <div class="confidence-bar">
          <div class="confidence-track"><div class="confidence-fill" style="width:\${confPct}%"></div></div>
          <span class="confidence-label">\${confPct}% confidence</span>
        </div>
        <div class="research-thesis collapsed" id="thesis-\${i}">\${e.thesis}</div>
        <button class="expand-btn" onclick="toggleThesis(\${i}, this)">Show more ↓</button>
        <div class="research-meta" style="margin-top:10px">
          \${e.stopLoss ? '<div class="research-meta-item">SL <span>$' + e.stopLoss.toFixed(2) + '</span></div>' : ''}
          \${e.takeProfit ? '<div class="research-meta-item">TP <span>$' + e.takeProfit.toFixed(2) + '</span></div>' : ''}
          \${e.nextResearch ? '<div class="research-meta-item">Next research <span>' + e.nextResearch + '</span></div>' : ''}
        </div>
      </div>\`;
    }).join('') || '<div class="research-empty">No entries for this tier yet</div>';
  }

  function toggleThesis(i, btn) {
    const el = document.getElementById('thesis-' + i);
    const collapsed = el.classList.toggle('collapsed');
    btn.textContent = collapsed ? 'Show more ↓' : 'Show less ↑';
  }

  // ── Toggle agent ──
  async function toggleAgent() {
    const btn = document.getElementById('toggleBtn');
    const isPaused = data?.agentStatus === 'paused';
    btn.disabled = true;
    try {
      await fetch(isPaused ? '/api/resume' : '/api/pause', { method: 'POST' });
      await loadData();
    } finally {
      btn.disabled = false;
    }
  }

  // ── Toggle sprint ──
  async function toggleSprint() {
    const btn = document.getElementById('sprintBtn');
    const on = !btn.classList.contains('active');
    await fetch('/api/sprint/' + (on ? 'on' : 'off'), { method: 'POST' });
    btn.classList.toggle('active', on);
    btn.textContent = on ? 'Sprint ON' : 'Sprint';
    showToast(on ? '\u26a1 Sprint mode ON \u2014 accelerated cycles' : 'Sprint mode OFF', on ? 'ok' : '');
  }

  // ── Render ──
  function render() {
    if (!data) return;

    // Status
    const paused = data.agentStatus === 'paused';
    const dot = document.getElementById('statusDot');
    dot.className = 'status-dot' + (paused ? ' paused' : '');
    document.getElementById('statusLabel').textContent = paused ? 'Paused' : 'Running';
    document.getElementById('lastUpdate').textContent = 'Updated ' + timeAgo(data.lastUpdated);
    const btn = document.getElementById('toggleBtn');
    btn.textContent = paused ? 'Resume Bot' : 'Pause Bot';
    btn.className = 'btn ' + (paused ? 'start' : 'stop');

    // Sprint button state
    const sprintBtn = document.getElementById('sprintBtn');
    sprintBtn.classList.toggle('active', !!data.sprintMode);
    sprintBtn.textContent = data.sprintMode ? 'Sprint ON' : 'Sprint';

    // Research log
    renderResearchLog(data.researchLog);

    // Portfolio
    document.getElementById('portfolioValue').textContent = usd(data.portfolio.total);
    renderChange();

    // Stats
    document.getElementById('usdBalance').textContent = usd(data.portfolio.usdBalance);
    const pnl = data.realizedPnl;
    const pnlEl = document.getElementById('realizedPnl');
    pnlEl.textContent = (pnl >= 0 ? '+' : '') + usd(pnl);
    pnlEl.className = 'stat-value ' + (pnl >= 0 ? 'pos' : 'neg');
    document.getElementById('tradeCount').textContent = data.tradeCount + ' closed trade' + (data.tradeCount === 1 ? '' : 's');

    // Market
    const m = data.market;
    if (m) {
      const ms = document.getElementById('marketState');
      ms.textContent = m.state || '—';
      ms.className = 'market-badge market-' + (m.state || 'NEUTRAL');
      document.getElementById('fearGreed').textContent =
        m.fearGreedLabel ? m.fearGreed + ' · ' + m.fearGreedLabel : '—';
      document.getElementById('btcDom').textContent =
        m.btcDominance ? m.btcDominance.toFixed(1) + '%' : '—';

      const t4 = m.tier4Criteria;
      if (t4) {
        const badge = document.getElementById('tier4Badge');
        badge.textContent = t4.allMet ? 'Active' : 'Inactive';
        badge.className = 'tier4-badge ' + (t4.allMet ? 'tier4-active' : 'tier4-inactive');
        const labels = ['T1 Bull','T2 Active','F&G>75','AltSzn','MemeVol'];
        const vals   = [t4.tier1Bullish, t4.tier2Active, t4.fearGreedAbove75, t4.altSeason, t4.memeVolume];
        document.getElementById('tier4Criteria').innerHTML =
          labels.map((l,i) => '<span class="criterion '+(vals[i]?'c-met':'c-unmet')+'">'+l+'</span>').join('');
      }
    }

    // Watched assets — grouped by category
    const grid = document.getElementById('assetsGrid');
    if (data.watchedAssets && data.watchedAssets.length > 0) {
      const groups = {};
      for (const a of data.watchedAssets) {
        const cat = a.category || 'Other';
        if (!groups[cat]) groups[cat] = [];
        groups[cat].push(a);
      }
      const ORDER = ['Core', 'DeFi', 'Emerging', 'AI', 'Meme'];
      const cats = ORDER.filter(c => groups[c]).concat(Object.keys(groups).filter(c => !ORDER.includes(c)));
      const cardHtml = a => {
        const cls = (a.change24h ?? 0) >= 0 ? 'pos' : 'neg';
        const arrow = (a.change24h ?? 0) >= 0 ? '↑' : '↓';
        return \`<div class="asset-card">
          <div class="asset-header"><div>
            <div class="asset-symbol">\${a.symbol}</div>
            <div class="asset-name">\${a.name}</div>
          </div></div>
          <div class="asset-price">\${a.price ? usd(a.price) : '—'}</div>
          <div class="asset-change \${cls}">\${arrow} \${a.change24h ? Math.abs(a.change24h).toFixed(2)+'%' : '—'}</div>
          <div class="asset-vol">Vol \${compact(a.vol24h)}</div>
        </div>\`;
      };
      grid.innerHTML = cats.map(cat => \`
        <div class="asset-group">
          <div class="asset-group-label">\${cat}</div>
          <div class="assets-grid">\${groups[cat].map(cardHtml).join('')}</div>
        </div>\`).join('');
    }

    // Positions
    const tbody = document.getElementById('positionsBody');
    const posCount = document.getElementById('posCount');
    const positions = data.positions || [];
    posCount.textContent = positions.length + ' position' + (positions.length === 1 ? '' : 's');

    if (positions.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="empty-state">No open positions<small>Monitoring for entry signals</small></td></tr>';
      return;
    }

    tbody.innerHTML = positions.map(p => {
      const cls = p.pnl >= 0 ? 'td-pos' : 'td-neg';
      return \`<tr>
        <td><div class="td-pair">\${p.pair}</div><div class="td-action">\${p.action}</div></td>
        <td>\${usd(p.entryPrice)}</td>
        <td>\${usd(p.currentPrice)}</td>
        <td>\${usd(p.amountUsd)}</td>
        <td class="\${cls}">\${p.pnl >= 0 ? '+' : ''}\${usd(p.pnl)}<br><span class="td-muted">\${pct(p.pnlPct)}</span></td>
        <td class="td-tp">\${p.takeProfit ? usd(p.takeProfit) : '<span class="td-muted">—</span>'}</td>
        <td class="td-sl">\${p.stopLoss ? usd(p.stopLoss) : '<span class="td-muted">—</span>'}</td>
        <td class="td-muted">\${fmtDate(p.timestamp)}</td>
      </tr>\`;
    }).join('');
  }

  // ── Buy form ──
  function toggleBuyForm() {
    const form = document.getElementById('buyForm');
    const btn = document.getElementById('buyBtn');
    const visible = form.style.display !== 'none';
    form.style.display = visible ? 'none' : 'flex';
    btn.style.display = visible ? 'inline-block' : 'none';
    if (!visible && data?.watchedAssets) {
      const sel = document.getElementById('buyAsset');
      sel.innerHTML = data.watchedAssets.map(a => \`<option value="\${a.symbol}">\${a.symbol} \u2014 \${a.price ? usd(a.price) : '\u2014'}</option>\`).join('');
    }
  }
  async function executeBuy() {
    const symbol = document.getElementById('buyAsset').value;
    const amountUsd = parseFloat(document.getElementById('buyAmount').value);
    if (!symbol || !amountUsd || amountUsd <= 0) { showToast('Enter a valid amount', 'err'); return; }
    showToast('Executing paper buy\u2026');
    try {
      const res = await fetch('/api/manual-trade', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ symbol, amountUsd }) });
      const d = await res.json();
      if (d.ok) { showToast('\u2713 Bought $' + amountUsd + ' ' + symbol + ' at ' + usd(d.price), 'ok'); toggleBuyForm(); setTimeout(loadData, 500); }
      else showToast('\u2717 ' + d.error, 'err');
    } catch(e) { showToast('\u2717 Request failed', 'err'); }
  }

  // ── Data loading ──
  async function loadData() {
    try {
      const res = await fetch('/api/data');
      data = await res.json();
      render();
      renderChart(data.portfolioHistory);
      renderTradeHistory(data.tradeHistory);
    } catch(e) {
      console.error('Load failed:', e);
    }
  }

  // ── Light / dark mode ──
  let isLight = localStorage.getItem('theme') === 'light';
  function applyTheme() {
    document.body.classList.toggle('light', isLight);
    document.getElementById('themeBtn').textContent = isLight ? '🌙' : '☀';
    if (pnlChart) {
      const grid = getComputedStyle(document.documentElement).getPropertyValue('--border').trim() || '#26262c';
      pnlChart.options.scales.x.grid.color = grid;
      pnlChart.options.scales.y.grid.color = grid;
      pnlChart.update();
    }
  }
  function toggleTheme() {
    isLight = !isLight;
    localStorage.setItem('theme', isLight ? 'light' : 'dark');
    applyTheme();
  }
  applyTheme();

  // ── PnL Chart ──
  function renderChart(history) {
    const pts = document.getElementById('chartPoints');
    if (!history || history.length < 2) {
      pts.textContent = 'Accumulating data…';
      return;
    }
    pts.textContent = history.length + ' snapshots';
    const labels = history.map(h => {
      const d = new Date(h.timestamp);
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });
    const values = history.map(h => h.value);
    const start = values[0];
    const end = values[values.length - 1];
    const isUp = end >= start;
    const lineColor = isUp ? '#5eead4' : '#f87171';

    if (pnlChart) {
      pnlChart.data.labels = labels;
      pnlChart.data.datasets[0].data = values;
      pnlChart.data.datasets[0].borderColor = lineColor;
      pnlChart.data.datasets[0].backgroundColor = isUp ? 'rgba(94,234,212,0.06)' : 'rgba(248,113,113,0.06)';
      pnlChart.update('none');
      return;
    }

    const ctx = document.getElementById('pnlChart').getContext('2d');
    pnlChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          data: values,
          borderColor: lineColor,
          backgroundColor: isUp ? 'rgba(94,234,212,0.06)' : 'rgba(248,113,113,0.06)',
          borderWidth: 1.5,
          pointRadius: 0,
          fill: true,
          tension: 0.3,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: { legend: { display: false }, tooltip: {
          callbacks: { label: ctx => ' $' + ctx.parsed.y.toFixed(2) },
          backgroundColor: '#16161a', borderColor: '#26262c', borderWidth: 1,
          titleColor: '#8b8b99', bodyColor: '#f0f0f2', padding: 10,
        }},
        scales: {
          x: { grid: { color: '#26262c' }, ticks: { color: '#4a4a58', font: { size: 10 }, maxTicksLimit: 8 }, border: { display: false } },
          y: { grid: { color: '#26262c' }, ticks: { color: '#4a4a58', font: { size: 10 }, callback: v => '$' + v.toFixed(0) }, border: { display: false } },
        }
      }
    });
    applyTheme();
  }

  // ── Trade history ──
  function renderTradeHistory(trades) {
    const tbody = document.getElementById('historyBody');
    const count = document.getElementById('historyCount');
    if (!trades || trades.length === 0) {
      count.textContent = '0 trades';
      tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No closed trades yet<small>Paper trades will appear here</small></td></tr>';
      return;
    }
    count.textContent = trades.length + ' trade' + (trades.length === 1 ? '' : 's');
    tbody.innerHTML = trades.map(t => {
      const pnl = t.pnl ?? 0;
      const cls = pnl >= 0 ? 'td-closed-pos' : 'td-closed-neg';
      return \`<tr>
        <td class="td-pair">\${t.pair}</td>
        <td><span class="td-action">\${t.action}</span></td>
        <td>\${usd(t.entryPrice)}</td>
        <td>\${t.exitPrice ? usd(t.exitPrice) : '<span class="td-muted">—</span>'}</td>
        <td>\${usd(t.amountUsd)}</td>
        <td class="\${cls}">\${pnl >= 0 ? '+' : ''}\${usd(pnl)}</td>
        <td class="td-muted">\${fmtDate(t.timestamp)}</td>
      </tr>\`;
    }).join('');
  }

  // ── Countdown ──
  setInterval(() => {
    countdown--;
    if (countdown <= 0) { countdown = 30; loadData(); }
  }, 1000);

  loadData();
</script>
</body>
</html>`;

// ── HTTP server ───────────────────────────────────────────────

export function startDashboard(): void {
  const server = http.createServer(async (req, res) => {

    // Alchemy connectivity check
    if (req.url === '/api/alchemy-check') {
      try {
        const points = await getPriceHistory('ETH', 1);
        if (points.length > 0) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            ok: true,
            message: `Connected — ${points.length} price points returned`,
            sample: points[points.length - 1],
          }));
        } else {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, message: 'API responded but returned no data' }));
        }
      } catch (err: any) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, message: err.message }));
      }
      return;
    }

    // Tier trigger (any tier)
    const tierMatch = req.method === 'POST' && req.url?.match(/^\/api\/trigger\/tier(\d)$/);
    if (tierMatch) {
      const tier = parseInt(tierMatch[1]);
      const fn = tierTriggers.get(tier);
      if (!fn) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Tier ${tier} trigger not registered` }));
        return;
      }
      fn().catch(console.error);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'triggered', tier }));
      return;
    }

    if (req.method === 'POST' && req.url === '/api/pause') {
      agentPaused = true;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'paused' }));
      return;
    }

    if (req.method === 'POST' && req.url === '/api/resume') {
      agentPaused = false;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'running' }));
      return;
    }

    if (req.method === 'POST' && req.url === '/api/sprint/on') {
      sprintMode = true;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'sprint_on' }));
      return;
    }

    if (req.method === 'POST' && req.url === '/api/sprint/off') {
      sprintMode = false;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'sprint_off' }));
      return;
    }

    if (req.method === 'POST' && req.url === '/api/manual-trade') {
      try {
        const body = await new Promise<string>((resolve) => {
          let data = '';
          req.on('data', chunk => data += chunk);
          req.on('end', () => resolve(data));
        });
        const { symbol, amountUsd } = JSON.parse(body);
        if (!symbol || !amountUsd || amountUsd <= 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'Invalid symbol or amount' }));
          return;
        }
        const prices = await getEnrichedPrices();
        const priceData = prices[symbol.toUpperCase()];
        if (!priceData || priceData.price === 0) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: `No price available for ${symbol}` }));
          return;
        }
        const ledger = loadLedger();
        const result = executePaperTrade('BUY', amountUsd, priceData.price, null, null, ledger, { pair: `${symbol.toUpperCase()}/USDC` });
        if (result.startsWith('⚠️')) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: result }));
        } else {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, price: priceData.price }));
        }
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
      return;
    }

    if (req.url === '/api/data') {
      try {
        const payload = await buildApiData();
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify(payload));
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(HTML);
  });

  server.listen(PORT, () => {
    console.log(`[Dashboard] http://localhost:${PORT}`);
  });
}

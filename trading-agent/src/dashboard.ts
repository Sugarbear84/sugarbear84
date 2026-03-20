// src/dashboard.ts
// ============================================================
// Coolbreeze Dashboard — HTTP server on port 3333
// Serves a live trading dashboard with portfolio KPIs,
// open positions table, and market state.
// ============================================================

import * as http from 'http';
import { loadLedger } from './executor.js';
import type { RouterResult } from './router.js';

const PORT = 3333;

// ── Shared state set by index.ts ──────────────────────────────

let sharedMarket: RouterResult | null = null;

export function setDashboardMarket(result: RouterResult): void {
  sharedMarket = result;
}

// ── Price fetcher (reuses CoinGecko, 60s cache) ───────────────

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

let priceCache: Record<string, number> = {};
let priceCacheTime = 0;

async function getPrices(symbols: string[]): Promise<Record<string, number>> {
  const now = Date.now();
  if (now - priceCacheTime < 60_000 && Object.keys(priceCache).length > 0) return priceCache;
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
  } catch {
    return priceCache;
  }
}

// ── API data builder ──────────────────────────────────────────

async function buildApiData() {
  const ledger = loadLedger();
  const openPositions = ledger.positions.filter(p => p.status === 'OPEN');

  const symbols = ['ETH', ...new Set(openPositions.map(p => p.pair.split('/')[0].toUpperCase()))];
  const prices = await getPrices(symbols);
  const ethPrice = prices['ETH'] ?? 0;

  const total = ledger.usdBalance + ledger.ethBalance * ethPrice;
  const realizedPnl = ledger.tradeHistory.reduce((sum, t) => sum + (t.pnl ?? 0), 0);

  // % changes from portfolio history
  const history = ledger.portfolioHistory ?? [];
  const now = Date.now();

  function getPctChange(msAgo: number): number | null {
    const cutoff = now - msAgo;
    // Find the snapshot closest to (but before) the cutoff
    const past = history.filter(h => new Date(h.timestamp).getTime() <= cutoff);
    if (past.length === 0) return null;
    const ref = past[past.length - 1].value;
    return ((total - ref) / ref) * 100;
  }

  const change: Record<string, number | null> = {
    '24h':  getPctChange(24 * 60 * 60 * 1000),
    '7d':   getPctChange(7 * 24 * 60 * 60 * 1000),
    '30d':  getPctChange(30 * 24 * 60 * 60 * 1000),
    '365d': getPctChange(365 * 24 * 60 * 60 * 1000),
    'total': ((total - 1000) / 1000) * 100,
  };

  // Enrich open positions with current price + unrealized PnL
  const positions = openPositions.map(pos => {
    const sym = pos.pair.split('/')[0].toUpperCase();
    const currentPrice = prices[sym] ?? pos.entryPrice;
    const units = pos.amountUsd / pos.entryPrice;
    const currentValue = units * currentPrice;
    const pnl = pos.action === 'BUY' ? currentValue - pos.amountUsd : pos.amountUsd - currentValue;
    const pnlPct = (pnl / pos.amountUsd) * 100;
    return { ...pos, currentPrice, pnl, pnlPct };
  });

  return {
    portfolio: { total, usdBalance: ledger.usdBalance, ethBalance: ledger.ethBalance, ethPrice, change },
    positions,
    market: sharedMarket,
    realizedPnl,
    tradeCount: ledger.tradeHistory.length,
    lastUpdated: new Date().toISOString(),
  };
}

// ── Embedded HTML dashboard ───────────────────────────────────

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Coolbreeze Dashboard</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { background: #0a0f1a; color: #e2e8f0; font-family: 'SF Mono', 'Fira Code', 'Menlo', monospace; min-height: 100vh; padding: 24px; }

.header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 28px; border-bottom: 1px solid #1e293b; padding-bottom: 16px; }
.header h1 { font-size: 1.3rem; font-weight: 700; color: #7dd3fc; letter-spacing: 0.04em; }
.header h1 .sub { color: #475569; font-weight: 400; font-size: 0.85rem; margin-left: 10px; }
.live { display: inline-flex; align-items: center; gap: 6px; font-size: 0.72rem; color: #22c55e; }
.live-dot { width: 8px; height: 8px; border-radius: 50%; background: #22c55e; animation: pulse 2s infinite; }
@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
.refresh-info { font-size: 0.72rem; color: #334155; margin-left: 16px; }

.kpi-card { background: #111827; border: 1px solid #1e293b; border-radius: 14px; padding: 24px 28px; margin-bottom: 18px; }
.kpi-label { font-size: 0.68rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 10px; }
.kpi-row { display: flex; align-items: flex-end; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin-bottom: 16px; }
.kpi-value { font-size: 3.2rem; font-weight: 800; color: #f1f5f9; line-height: 1; }
.kpi-badge { font-size: 1.1rem; font-weight: 600; padding: 5px 14px; border-radius: 24px; }
.pos { color: #22c55e; } .neg { color: #ef4444; } .neutral { color: #94a3b8; }
.bg-pos { background: rgba(34,197,94,0.1); } .bg-neg { background: rgba(239,68,68,0.1); } .bg-neutral { background: rgba(148,163,184,0.1); }

.period-tabs { display: flex; gap: 8px; flex-wrap: wrap; }
.period-btn { background: #1e293b; border: 1px solid #334155; color: #94a3b8; padding: 6px 16px; border-radius: 20px; font-size: 0.72rem; cursor: pointer; font-family: inherit; transition: all 0.15s; }
.period-btn:hover { border-color: #7dd3fc; color: #7dd3fc; }
.period-btn.active { background: rgba(29,78,216,0.4); border-color: #3b82f6; color: #93c5fd; }

.grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 18px; }
@media (max-width: 900px) { .grid { grid-template-columns: repeat(2, 1fr); } }
.card { background: #111827; border: 1px solid #1e293b; border-radius: 12px; padding: 18px 20px; }
.card-label { font-size: 0.65rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 8px; }
.card-value { font-size: 1.5rem; font-weight: 700; color: #f1f5f9; }
.card-sub { font-size: 0.72rem; color: #475569; margin-top: 4px; }

.market-state { display: inline-block; padding: 3px 10px; border-radius: 6px; font-size: 0.72rem; font-weight: 700; letter-spacing: 0.06em; }
.state-BULL { background: rgba(34,197,94,0.15); color: #22c55e; }
.state-BEAR { background: rgba(239,68,68,0.15); color: #ef4444; }
.state-NEUTRAL { background: rgba(148,163,184,0.15); color: #94a3b8; }

.tier4-badge { display: inline-flex; align-items: center; gap: 5px; padding: 3px 10px; border-radius: 6px; font-size: 0.68rem; font-weight: 700; }
.t4-active { background: rgba(34,197,94,0.1); color: #22c55e; }
.t4-inactive { background: rgba(239,68,68,0.08); color: #f87171; }
.criteria { display: flex; gap: 5px; flex-wrap: wrap; margin-top: 8px; }
.criterion { font-size: 0.6rem; padding: 2px 7px; border-radius: 4px; }
.c-met { background: rgba(34,197,94,0.1); color: #22c55e; }
.c-unmet { background: rgba(239,68,68,0.07); color: #f87171; }

.section-card { background: #111827; border: 1px solid #1e293b; border-radius: 12px; overflow: hidden; }
.section-header { padding: 14px 20px; border-bottom: 1px solid #1e293b; font-size: 0.68rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.1em; }
table { width: 100%; border-collapse: collapse; }
th { text-align: left; font-size: 0.62rem; color: #475569; text-transform: uppercase; letter-spacing: 0.08em; padding: 10px 16px; border-bottom: 1px solid #1e293b; white-space: nowrap; }
td { padding: 12px 16px; border-bottom: 1px solid #0f172a; font-size: 0.82rem; }
tr:last-child td { border-bottom: none; }
tr:hover td { background: rgba(255,255,255,0.015); }
.muted { color: #475569; font-size: 0.72rem; }
.pair { font-weight: 600; color: #e2e8f0; }
.empty-state { text-align: center; padding: 48px 16px; color: #334155; font-size: 0.82rem; }
</style>
</head>
<body>

<div class="header">
  <h1>🤖 Coolbreeze <span class="sub">Multi-Strategy Trading Agent · Paper Mode</span></h1>
  <div style="display:flex;align-items:center">
    <span class="live"><span class="live-dot"></span>LIVE</span>
    <span class="refresh-info">Refreshes in <span id="countdown">30</span>s</span>
  </div>
</div>

<!-- Portfolio KPI -->
<div class="kpi-card">
  <div class="kpi-label">Total Portfolio Value</div>
  <div class="kpi-row">
    <div class="kpi-value" id="portfolioValue">$—</div>
    <div class="kpi-badge bg-neutral neutral" id="kpiBadge">—</div>
  </div>
  <div class="period-tabs" id="periodTabs">
    <button class="period-btn active" data-period="24h">24h</button>
    <button class="period-btn" data-period="7d">7d</button>
    <button class="period-btn" data-period="30d">30d</button>
    <button class="period-btn" data-period="365d">1y</button>
    <button class="period-btn" data-period="total">Total</button>
  </div>
</div>

<!-- Stat cards -->
<div class="grid">
  <div class="card">
    <div class="card-label">USDC Balance</div>
    <div class="card-value" id="usdBalance">$—</div>
    <div class="card-sub">Available cash</div>
  </div>
  <div class="card">
    <div class="card-label">Realized PnL</div>
    <div class="card-value" id="realizedPnl">$—</div>
    <div class="card-sub" id="tradeCount">— closed trades</div>
  </div>
  <div class="card">
    <div class="card-label">Market State</div>
    <div style="margin-top:6px">
      <span class="market-state state-NEUTRAL" id="marketState">—</span>
      <span style="margin-left:8px;font-size:0.78rem;color:#94a3b8" id="fearGreed">—</span>
    </div>
    <div class="card-sub" style="margin-top:6px">BTC Dom: <span id="btcDom">—</span></div>
  </div>
  <div class="card">
    <div class="card-label">Tier 4 Status</div>
    <div style="margin-top:6px">
      <span class="tier4-badge t4-inactive" id="tier4Badge">● INACTIVE</span>
    </div>
    <div class="criteria" id="tier4Criteria"></div>
  </div>
</div>

<!-- Positions table -->
<div class="section-card">
  <div class="section-header">Open Positions</div>
  <table>
    <thead>
      <tr>
        <th>Pair</th>
        <th>Entry Price</th>
        <th>Current Price</th>
        <th>Size (USD)</th>
        <th>Unrealized PnL</th>
        <th>Next Sell (TP)</th>
        <th>Stop Loss</th>
        <th>Opened</th>
      </tr>
    </thead>
    <tbody id="positionsBody">
      <tr><td colspan="8" class="empty-state">No open positions — watching for entry signals</td></tr>
    </tbody>
  </table>
</div>

<script>
let data = null;
let activePeriod = '24h';
let countdown = 30;

const fmt = (n, d=2) => n == null ? '—' : new Intl.NumberFormat('en-US',{minimumFractionDigits:d,maximumFractionDigits:d}).format(n);
const fmtUsd = n => n == null ? '—' : '$' + fmt(n);
const fmtPct = n => n == null ? 'N/A' : (n>=0?'+':'') + fmt(n) + '%';
const fmtDate = iso => { if(!iso) return '—'; const d=new Date(iso); return d.toLocaleDateString('en-US',{month:'short',day:'numeric'})+' '+d.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'}); };

// Period selector
document.getElementById('periodTabs').addEventListener('click', e => {
  const btn = e.target.closest('.period-btn');
  if (!btn) return;
  document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  activePeriod = btn.dataset.period;
  renderChange();
});

function renderChange() {
  if (!data) return;
  const change = data.portfolio.change[activePeriod];
  const el = document.getElementById('kpiBadge');
  if (change == null) {
    el.textContent = 'N/A'; el.className = 'kpi-badge bg-neutral neutral';
  } else if (change >= 0) {
    el.textContent = '+' + fmt(change) + '%'; el.className = 'kpi-badge bg-pos pos';
  } else {
    el.textContent = fmt(change) + '%'; el.className = 'kpi-badge bg-neg neg';
  }
}

function render() {
  if (!data) return;
  const p = data.portfolio;

  document.getElementById('portfolioValue').textContent = fmtUsd(p.total);
  document.getElementById('usdBalance').textContent = fmtUsd(p.usdBalance);

  const pnl = data.realizedPnl;
  const pnlEl = document.getElementById('realizedPnl');
  pnlEl.textContent = (pnl >= 0 ? '+' : '') + fmtUsd(pnl);
  pnlEl.className = 'card-value ' + (pnl >= 0 ? 'pos' : 'neg');
  document.getElementById('tradeCount').textContent = data.tradeCount + ' closed trade' + (data.tradeCount === 1 ? '' : 's');

  renderChange();

  // Market
  const m = data.market;
  if (m) {
    const ms = document.getElementById('marketState');
    ms.textContent = m.state || '—';
    ms.className = 'market-state state-' + (m.state || 'NEUTRAL');
    document.getElementById('fearGreed').textContent = m.fearGreedLabel ? m.fearGreed + ' (' + m.fearGreedLabel + ')' : '—';
    document.getElementById('btcDom').textContent = m.btcDominance ? m.btcDominance.toFixed(1) + '%' : '—';

    const t4 = m.tier4Criteria;
    if (t4) {
      const badge = document.getElementById('tier4Badge');
      badge.textContent = t4.allMet ? '● ACTIVE' : '● INACTIVE';
      badge.className = 'tier4-badge ' + (t4.allMet ? 't4-active' : 't4-inactive');
      const labels = ['T1 Bull','T2 Active','F&G>75','AltSzn','MemeVol'];
      const vals = [t4.tier1Bullish, t4.tier2Active, t4.fearGreedAbove75, t4.altSeason, t4.memeVolume];
      document.getElementById('tier4Criteria').innerHTML = labels.map((l,i) =>
        '<span class="criterion ' + (vals[i] ? 'c-met' : 'c-unmet') + '">' + l + '</span>'
      ).join('');
    }
  }

  // Positions
  const tbody = document.getElementById('positionsBody');
  if (!data.positions || data.positions.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-state">No open positions — watching for entry signals</td></tr>';
    return;
  }
  tbody.innerHTML = data.positions.map(pos => {
    const pnlCls = pos.pnl >= 0 ? 'pos' : 'neg';
    return '<tr>' +
      '<td><span class="pair">' + pos.pair + '</span><br><span class="muted">' + pos.action + '</span></td>' +
      '<td>' + fmtUsd(pos.entryPrice) + '</td>' +
      '<td>' + fmtUsd(pos.currentPrice) + '</td>' +
      '<td>' + fmtUsd(pos.amountUsd) + '</td>' +
      '<td class="' + pnlCls + '">' + (pos.pnl >= 0 ? '+' : '') + fmtUsd(pos.pnl) +
        '<br><span class="muted">' + fmtPct(pos.pnlPct) + '</span></td>' +
      '<td class="pos">' + (pos.takeProfit ? fmtUsd(pos.takeProfit) : '<span class="muted">—</span>') + '</td>' +
      '<td class="neg">' + (pos.stopLoss ? fmtUsd(pos.stopLoss) : '<span class="muted">—</span>') + '</td>' +
      '<td class="muted">' + fmtDate(pos.timestamp) + '</td>' +
      '</tr>';
  }).join('');
}

async function loadData() {
  try {
    const res = await fetch('/api/data');
    data = await res.json();
    render();
  } catch(e) {
    console.error('Failed to load data:', e);
  }
}

setInterval(() => {
  countdown--;
  document.getElementById('countdown').textContent = countdown;
  if (countdown <= 0) { countdown = 30; loadData(); }
}, 1000);

loadData();
</script>
</body>
</html>`;

// ── HTTP server ───────────────────────────────────────────────

export function startDashboard(): void {
  const server = http.createServer(async (req, res) => {
    if (req.url === '/api/data') {
      try {
        const data = await buildApiData();
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify(data));
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    } else {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(HTML);
    }
  });

  server.listen(PORT, () => {
    console.log(`[Dashboard] http://localhost:${PORT}`);
  });
}

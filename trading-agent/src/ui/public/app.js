/**
 * Coolbreeze interface — vanilla JS port of the Coolbreeze Deck design.
 * No framework, no build step (per the design project's IA proposal).
 * All derived analytics are computed client-side from the /api/ui/state snapshot.
 */
'use strict';

/* ---------------- tier metadata + theme application ---------------- */
const C = {};
const TIERS = {
  1: { tag: 'T1 · MACRO', short: 'T1', long: 'T1 · MACRO' },
  2: { tag: 'T2 · DEFI', short: 'T2', long: 'T2 · DEFI' },
  3: { tag: 'T3 · EMERGING', short: 'T3', long: 'T3 · EMERGING' },
  4: { tag: 'T4 · MEME', short: 'T4', long: 'T4 · MEME' },
  5: { tag: 'T5 · RANGE', short: 'T5', long: 'T5 · RANGE' },
};
function applyTheme(key) {
  const t = THEMES[key] || THEMES['instrument-light'];
  Object.assign(C, {
    text: t.text, text2: t.text2, dim: t.dim, muted: t.muted, card: t.card, panel: t.rail,
    green: t.pos, greenBg: t.posBg, greenBorder: t.posEdge,
    red: t.neg, redBg: t.negBg, redBorder: t.negEdge,
    amber: t.amber, amberBg: t.amberBg, amberEdge: t.amberEdge,
    blue: t.accent, blueBg: t.accentBg, blueBorder: t.accentEdge,
    line: t.line, border: t.border, hard: t.hard, violet: t.violet,
  });
  for (const n of [1, 2, 3, 4, 5]) {
    TIERS[n].color = t['t' + n];
    TIERS[n].bg = t['t' + n + 'Bg'];
    TIERS[n].fg = t['t' + n + 'Fg'];
  }
}

/* ---------------- formatters ---------------- */
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hrsOf = h => { const m = String(h).match(/(\d+)h\s*(\d+)?/); return m ? Number(m[1]) + (Number(m[2] || 0) / 60) : 0; };
const aMoney = n => '$' + (Math.abs(n) < 100 ? Math.abs(n).toFixed(2).replace(/\.00$/, '') : Math.abs(n).toFixed(0));
const aSigned = n => (n >= 0 ? '+' : '−') + aMoney(n);
const aPx = v => v < 1 ? '$' + v.toFixed(4) : v < 1000 ? '$' + v.toFixed(2) : '$' + v.toLocaleString('en-US', { maximumFractionDigits: 0 });
const money2 = n => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pnlFmt = n => n >= 0 ? '+$' + Math.round(n) : '−$' + Math.abs(n).toFixed(1);
const fmtVal = (fmt, v) => fmt === 'usd' ? '$' + v : fmt === 'pct' ? v + '%' : fmt === 'pctOff' ? (v === 0 ? 'none' : v + '%') : String(v);
const px = v => v < 1 ? '$' + v.toFixed(4) : v < 1000 ? '$' + v.toFixed(2) : '$' + v.toLocaleString('en-US', { maximumFractionDigits: 0 });

/* ---------------- UI-side config constants (ported from the deck) ---------------- */
const PIPS = 16;
const CW = 400, CPT = 12, CPB = 118;
const CONFIRM_HOLD_MS = 800;
const TOOLTIP_DELAY_MS = 1000;

const PARAM_DEFS = [
  { group: 'Risk controls', note: 'picked up by the risk monitor on the next 60s check', rows: [
    { key: 'floor', help: 'Hard equity floor. If the book drops to this value the agent halts and stops opening anything new.', label: 'Portfolio floor', min: 100, max: 990, step: 10, fmt: 'usd' },
    { key: 'dailyLoss', help: 'Loss from the day’s opening value that triggers a halt. Measured on total book value, not per trade.', label: 'Max daily loss', min: 1, max: 30, step: 1, fmt: 'pct' },
    { key: 'drawdown', help: 'Fall from the highest value the book has ever reached. The most common reason an agent halts itself.', label: 'Max drawdown', min: 5, max: 60, step: 1, fmt: 'pct' },
    { key: 'consec', help: 'Losing trades in a row before halting — catches a strategy that has stopped working before the drawdown does.', label: 'Max consecutive losses', min: 1, max: 15, step: 1, fmt: 'num' },
    { key: 'maxTrades', help: 'Ceiling on trades in 24h. Guards against a feedback loop chewing through fees.', label: 'Max trades / day', min: 1, max: 30, step: 1, fmt: 'num' },
  ] },
  { group: 'Confidence thresholds', note: 'below these the agent holds instead of trading', rows: [
    { key: 't2conf', help: 'Minimum confidence before the agent will act on a DeFi name. Below it, the cycle logs a HOLD.', label: 'T2 minimum (DeFi)', min: 30, max: 90, step: 5, fmt: 'pct' },
    { key: 't3conf', help: 'Same gate for emerging protocols. Usually set higher than T2 because the data is thinner.', label: 'T3 minimum (Emerging)', min: 40, max: 90, step: 5, fmt: 'pct' },
  ] },
  { group: 'Macro sleeve', note: '', rows: [
    { key: 'sleeve', help: 'Capital reserved for the macro (ETH) sleeve. The rest is available to the research tiers.', label: 'Sleeve capital', min: 100, max: 1000, step: 50, fmt: 'usd' },
    { key: 'deadband', help: 'How far actual weight may drift from target before rebalancing. Wider means fewer, larger trades.', label: 'Rebalance deadband', min: 1, max: 15, step: 1, fmt: 'pct' },
    { key: 'smoothing', help: 'Share of the gap closed per cycle when rebalancing. Lower is gentler and costs less in fees.', label: 'Smoothing per cycle', min: 10, max: 100, step: 10, fmt: 'pct' },
  ] },
  { group: 'Band ceilings', wide: true, note: '0 = no ceiling · applied when a position opens, next cycle', rows: [
    { key: 't2stop', help: 'Widest stop the agent may set on a DeFi position. A directive asking for more is clamped to this before the order goes out.', label: 'T2 max stop', min: 0, max: 30, step: 2, fmt: 'pctOff' },
    { key: 't2tgt', help: 'Ceiling on the take-profit distance for DeFi. Caps the optimism in a directive without touching its direction.', label: 'T2 max target', min: 0, max: 60, step: 4, fmt: 'pctOff' },
    { key: 't3stop', help: 'Widest stop on an emerging-protocol position. Usually tighter than T2 because the drawdowns are faster.', label: 'T3 max stop', min: 0, max: 30, step: 2, fmt: 'pctOff' },
    { key: 't3tgt', help: 'Ceiling on the take-profit distance for emerging protocols.', label: 'T3 max target', min: 0, max: 60, step: 4, fmt: 'pctOff' },
    { key: 't4stop', help: 'Widest stop on a speculative position. Zero leaves the directive untouched — rarely what you want here.', label: 'T4 max stop', min: 0, max: 30, step: 2, fmt: 'pctOff' },
    { key: 't4tgt', help: 'Ceiling on the take-profit distance for speculative names.', label: 'T4 max target', min: 0, max: 60, step: 4, fmt: 'pctOff' },
  ] },
  { group: 'Range-trade mode', note: '', rows: [
    { key: 'entryZone', help: 'In range mode, buys only trigger in this bottom slice of the established range.', label: 'Entry zone (bottom of range)', min: 10, max: 40, step: 5, fmt: 'pct' },
    { key: 'exitZone', help: 'And sells only in this top slice. The gap between the two is the profit band.', label: 'Exit zone (top of range)', min: 60, max: 90, step: 5, fmt: 'pct' },
    { key: 'tradePct', help: 'Size of each range trade as a share of available cash.', label: 'Trade size (% of cash)', min: 2, max: 15, step: 1, fmt: 'pct' },
  ] },
];

const PRESETS = [
  { name: 'CAUTIOUS', desc: 'Tight stops, high gates, small size. Trades least, survives most.',
    values: { drawdown: 12, dailyLoss: 5, consec: 3, maxTrades: 6, t2conf: 70, t3conf: 80, tradePct: 3 } },
  { name: 'STANDARD', desc: 'The shipped defaults — what the agent has been running.',
    values: { drawdown: 20, dailyLoss: 8, consec: 4, maxTrades: 12, t2conf: 55, t3conf: 65, tradePct: 6 } },
  { name: 'AGGRESSIVE', desc: 'Wider drawdown, lower gates, bigger clips. More trades, louder swings.',
    values: { drawdown: 30, dailyLoss: 12, consec: 6, maxTrades: 20, t2conf: 45, t3conf: 55, tradePct: 10 } },
];

const APPENDIX = [
  { group: 'Tiers', note: 'the five research lanes the agent runs', tierRows: [
    { t: 1, def: 'Large-cap, macro-driven holdings. Sized biggest, turned over slowest; exits are usually rebalances rather than stops.' },
    { t: 2, def: 'Established DeFi protocols judged on fundamentals — fee revenue, TVL and emissions. The workhorse tier.' },
    { t: 3, def: 'Newer protocols with a shorter track record. Real theses, thinner liquidity, tighter stops.' },
    { t: 4, def: 'Meme and social-momentum trades. Smallest sizes, fastest exits, highest variance by design.' },
    { t: 5, def: 'Mean reversion inside an established range: buy the bottom zone, sell the top zone, ignore the trend.' },
  ] },
  { group: 'Risk metrics', note: 'checked every 60 seconds', rows: [
    { term: 'Drawdown', def: 'Percentage below the book’s running high-water mark. Breaching the configured limit halts new trading and leaves open positions untouched.' },
    { term: 'Daily loss', def: 'Realised plus unrealised loss since 00:00 UTC, as a share of the book at day open.' },
    { term: 'Consecutive losses', def: 'Count of losing closes in a row across all tiers. Resets on the first win.' },
    { term: 'High-water mark', def: 'The highest book value reached so far. Drawdown is always measured from this, not from the seed.' },
    { term: 'Halt', def: 'Trading stops; positions, stops and targets stay live. Clearing a halt requires typed confirmation.' },
  ] },
  { group: 'Analytics figures', note: 'all derived from the same trade ledger', rows: [
    { term: 'Book value', def: 'Seed capital plus realised P&L plus unrealised P&L on open positions.' },
    { term: 'Realised P&L', def: 'Profit and loss from closed trades only. Unrealised movement is excluded.' },
    { term: 'Win rate', def: 'Closed trades with positive P&L divided by all closed trades, in the selected scope.' },
    { term: 'Profit factor', def: 'Gross winnings divided by gross losses. Above 1.00 means the wins outweigh the losses.' },
    { term: 'Avg win / loss', def: 'Mean P&L of winning trades against the mean of losing trades. Wins running bigger is the healthy shape.' },
    { term: 'Regime', def: 'Market condition the agent recorded at entry: trending bull, ranging, or volatile.' },
    { term: 'Range switcher', def: '7D / 30D / 90D / ALL scopes the time-series charts. The scorecard always shows whole history.' },
  ] },
  { group: 'Data & cadence', note: 'where the numbers come from', rows: [
    { term: 'Prices', def: 'Marks refresh with the health rail; the age badge in the header shows how stale the current snapshot is.' },
    { term: 'Research cycle', def: 'Each tier re-researches on its own schedule. The countdown in the header is the next scheduled cycle.' },
    { term: 'Confidence', def: 'The model’s own score for a directive. Tier gates in Loadout set the minimum score required to act.' },
    { term: 'Staged vs applied', def: 'Loadout edits are staged locally and only reach the agent when you apply them.' },
    { term: 'Unknown / stale', def: 'Em-dashes mean the value was never received; desaturated values with an age mark the feed as late.' },
  ] },
];

/* ---------------- state ---------------- */
const savedTheme = (() => { try { return localStorage.getItem('cb-theme-v2'); } catch (e) { return null; } })();
const INITIAL_THEME = THEMES[savedTheme] ? savedTheme : 'instrument-light';
applyTheme(INITIAL_THEME);

const S = {
  data: null,            // last /api/ui/state snapshot
  lastSync: 0,           // ms timestamp of last successful sync
  syncFailed: false,
  themeKey: INITIAL_THEME,
  tab: 'deck', range: '30D', tierFilter: null,
  aSel: [], aRange: '30D', aFilter: 'All', info: null, tip: null, appendix: false,
  openPos: null, showClosed: false, expanded: {}, ratings: {}, journalSel: null,
  helpKey: null, hoverMark: null,
  palette: false, query: '', trade: null, hold: 0, toasts: [],
  dockPair: 'ETH/USDC', dockAmount: '', dockOpen: true,
  staged: {}, drafts: { 2: '', 3: '', 4: '', 5: '' },
  chatOpen: false, chatInput: '', thinking: false,
  clearPrompt: false, clearText: '',
  messages: [
    { id: 'm0', from: 'agent', text: 'Morning. Ask me anything about what I did or why — positions, risk, a parameter, or stage a trade in plain words.' },
  ],
};

function setState(patch) {
  Object.assign(S, typeof patch === 'function' ? patch(S) : patch);
  render();
}

/* ---------------- API client ---------------- */
async function api(path, body) {
  const res = await fetch(path, body === undefined
    ? undefined
    : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(json.error || json.message || res.statusText), { json });
  return json;
}

async function sync(rerender = true) {
  try {
    const data = await api('/api/ui/state');
    S.data = data;
    S.lastSync = Date.now();
    S.syncFailed = false;
  } catch (e) {
    S.syncFailed = true;
  }
  if (rerender) render();
}

function toast(tag, text, accent, border) {
  const id = Math.random().toString(36).slice(2);
  S.toasts = S.toasts.concat([{ id, tag, text, accent, border }]);
  render();
  setTimeout(() => { S.toasts = S.toasts.filter(t => t.id !== id); render(); }, 4200);
}

/* ---------------- event registry (closures survive innerHTML renders) ---------------- */
let EV = {};
let evSeq = 0;
function on(fn) { const id = 'e' + (++evSeq); EV[id] = fn; return id; }

function delegate(type, attr, domEvent, opts) {
  document.getElementById('root').addEventListener(domEvent, e => {
    let el = e.target;
    while (el && el !== e.currentTarget) {
      const id = el.getAttribute && el.getAttribute(attr);
      if (id && EV[id]) { EV[id](e, el); return; }
      el = el.parentElement;
    }
  }, opts || false);
}

/* ---------------- derived data helpers ---------------- */
function D() { return S.data; }
function ledger() { return D() ? D().ledger : []; }
function positions() { return D() ? D().positions : []; }
function params() { return D() ? Object.assign({}, D().params, S.staged) : {}; }
function appliedParams() { return D() ? D().params : {}; }
function posPnl(p) { return (p.mark - p.entry) / p.entry * p.size; }
function seed() { return D() ? D().seed : 0; }
function realised() { return ledger().reduce((a, t) => a + t.pnl, 0); }
function unrealised() { return positions().reduce((a, p) => a + posPnl(p), 0); }
function book() { return seed() + realised() + unrealised(); }
function cash() { return book() - positions().reduce((a, p) => a + p.size, 0); }
function tierStat(n) {
  const ts = ledger().filter(t => t.tier === n);
  const net = ts.reduce((a, t) => a + t.pnl, 0);
  const w = ts.filter(t => t.pnl > 0).length;
  return { net, n: ts.length, win: ts.length ? Math.round(w / ts.length * 100) : 0 };
}
function dstr(d) {
  const x = new Date(D().day0 + 'T00:00:00');
  x.setDate(x.getDate() + d);
  return (x.getMonth() + 1) + '/' + x.getDate();
}
function staleSecs() { return S.lastSync ? Math.floor((Date.now() - S.lastSync) / 1000) : Infinity; }
function isStale() { return staleSecs() > 60; }
function staleChip() {
  if (!isStale()) return '';
  const s = staleSecs();
  const age = s === Infinity ? '—' : s < 3600 ? Math.floor(s / 60) + 'm' : Math.floor(s / 3600) + 'h';
  return '<span style="font-size: 10px; font-weight: 600; letter-spacing: 0.06em; color: var(--amber); background: var(--amberBg); border: 1px solid var(--amberEdge); border-radius: 2px; padding: 2px 7px; white-space: nowrap">◷ ' + age + ' OLD</span>';
}

function glow(color, strong) {
  const dark = (S.themeKey || '').endsWith('dark');
  if (!color) return 'none';
  if (dark) return strong
    ? '0 0 10px ' + color + '99, 0 0 3px ' + color + 'cc, inset 0 0 4px ' + color + '55'
    : '0 0 7px ' + color + '66';
  return strong ? '0 0 8px ' + color + '66, 0 0 2px ' + color + '99' : '0 0 5px ' + color + '40';
}

function infoOf(key) {
  return {
    open: S.info === key,
    onId: on(() => setState({ info: key })),
    offId: on(() => { if (S.info === key) setState({ info: null }); }),
    edge: S.info === key ? C.blue : C.hard,
    fg: S.info === key ? C.blue : C.muted,
  };
}
function infoDot(k, extra) {
  return '<span ' + (extra || '') + ' data-enter="' + k.onId + '" data-leave="' + k.offId + '" style="font-size: 9px; font-weight: 700; width: 15px; height: 15px; border-radius: 50%; border: 1px solid ' + k.edge + '; color: ' + k.fg + '; display: inline-flex; align-items: center; justify-content: center; cursor: help; flex: none">i</span>';
}

function headerChart(range, w, h) {
  const pts = D().equityRanges[range];
  const min = Math.min(...pts) - 4, max = Math.max(...pts) + 4;
  const xs = i => (i / (pts.length - 1)) * w;
  const ys = v => h - ((v - min) / (max - min)) * (h - 12) - 6;
  const line = pts.map((v, i) => xs(i).toFixed(1) + ',' + ys(v).toFixed(1)).join(' ');
  const area = 'M' + pts.map((v, i) => xs(i).toFixed(1) + ' ' + ys(v).toFixed(1)).join(' L') + ' L' + w + ' ' + h + ' L0 ' + h + ' Z';
  return { line, area, lastX: xs(pts.length - 1).toFixed(1), lastY: ys(pts[pts.length - 1]).toFixed(1) };
}

/* max drawdown + equity series over the whole ledger (deck analytics core) */
function equitySeries() {
  const TOTAL_DAYS = D().totalDays;
  const MTM = D().mtm;
  const unreal = unrealised();
  const equity = [];
  let run = seed();
  for (let d = 0; d <= TOTAL_DAYS; d++) {
    run += ledger().filter(t => t.day === d).reduce((a, t) => a + t.pnl, 0);
    equity.push({ d, v: run + (d === TOTAL_DAYS ? unreal : MTM[Math.min(d, MTM.length - 1)]) });
  }
  let peak = -Infinity;
  const dd = equity.map(p => { peak = Math.max(peak, p.v); return { d: p.d, pct: (p.v - peak) / peak * 100, peak, v: p.v }; });
  return { equity, dd, maxDD: Math.min.apply(null, dd.map(x => x.pct)) };
}

/* ---------------- actions ---------------- */
function doHalt(kind) {
  api('/api/ui/halt', { action: kind }).then(() => sync(false)).then(() => {
    toast('halted', kind === 'halt-hour' ? 'Paused for 1 hour — resumes automatically' : 'Agent stopped — open positions untouched',
      kind === 'halt-hour' ? C.amber : C.red, kind === 'halt-hour' ? C.amberEdge : C.redBorder);
  }).catch(e => toast('error', String(e.message || e), C.red, C.redBorder));
}
function toggleHalt() {
  if (D() && D().halted) setState({ clearPrompt: true, clearText: '' });
  else doHalt('halt');
}
function doResume() {
  api('/api/ui/halt', { action: 'resume', confirm: S.clearText.trim().toUpperCase() }).then(() => {
    S.clearPrompt = false; S.clearText = '';
    return sync(false);
  }).then(() => toast('resumed', 'Agent resumed on the next cycle', C.green, C.greenBorder))
    .catch(() => toast('blocked', 'Type CLEAR to resume — halt stays on', C.amber, C.amberEdge));
}
function closePos(id) {
  api('/api/ui/positions/close', { id }).then(r => sync(false).then(() => {
    const pnl = r.pnl || 0;
    toast('closed', r.asset + ' closed at market · ' + pnlFmt(pnl), pnl >= 0 ? C.green : C.red, pnl >= 0 ? C.greenBorder : C.redBorder);
  })).catch(e => toast('error', String(e.message || e), C.red, C.redBorder));
}
function openTrade(side) {
  const amt = parseFloat(S.dockAmount) || 120;
  setState({ trade: { side, pair: S.dockPair, amount: Math.min(350, Math.max(10, amt)) }, hold: 0, palette: false });
}
function execTrade() {
  clearInterval(S._hold);
  const t = S.trade;
  if (!t) return;
  api('/api/ui/trade', { side: t.side, pair: t.pair, amount: t.amount }).then(r => {
    S.trade = null; S.hold = 0; S.dockAmount = '';
    return sync(false).then(() => toast(t.side === 'BUY' ? 'filled' : 'sold', r.message,
      t.side === 'BUY' ? C.green : C.red, t.side === 'BUY' ? C.greenBorder : C.redBorder));
  }).catch(e => { S.trade = null; S.hold = 0; render(); toast('rejected', String(e.message || e), C.red, C.redBorder); });
}
function startHold() {
  clearInterval(S._hold);
  S._t0 = Date.now();
  S._hold = setInterval(() => {
    const p = Math.min(1, (Date.now() - S._t0) / CONFIRM_HOLD_MS);
    S.hold = p;
    const fill = document.getElementById('holdFill');
    if (fill) fill.style.width = (p * 100).toFixed(0) + '%';
    if (p >= 1) { S.hold = 0; execTrade(); }
  }, 16);
}
function endHold() {
  clearInterval(S._hold);
  if (S.hold < 1) { S.hold = 0; const fill = document.getElementById('holdFill'); if (fill) fill.style.width = '0%'; }
}
function stage(key, v) {
  const staged = Object.assign({}, S.staged);
  if (v === appliedParams()[key]) delete staged[key]; else staged[key] = v;
  setState({ staged });
}
function pipValue(r, i) {
  const raw = r.min + ((i + 1) / PIPS) * (r.max - r.min);
  return Math.min(r.max, Math.max(r.min, Math.round(raw / r.step) * r.step));
}
function nudge(r, dir) {
  const cur = S.staged[r.key] != null ? S.staged[r.key] : appliedParams()[r.key];
  const v = Math.min(r.max, Math.max(r.min, +(cur + dir * r.step).toFixed(4)));
  stage(r.key, v);
}
function applyParamsNow() {
  const n = Object.keys(S.staged).length;
  api('/api/ui/params/apply', { changes: S.staged }).then(() => {
    S.staged = {};
    return sync(false);
  }).then(() => toast('saved', n + (n === 1 ? ' parameter' : ' parameters') + ' applied — live on the next 60s check', C.blue, C.blueBorder))
    .catch(e => toast('error', String(e.message || e), C.red, C.redBorder));
}
function queueResearch(target) {
  api('/api/ui/research', { target: String(target) })
    .then(r => toast('queued', r.message, C.blue, C.blueBorder))
    .catch(e => toast('error', String(e.message || e), C.red, C.redBorder));
}
function rosterOp(op, tier, symbol) {
  api('/api/ui/roster', { op, tier, symbol }).then(() => sync(false)).then(() => {
    if (op === 'add') toast('added', symbol + ' added to ' + TIERS[tier].short + ' — live next research cycle', C.blue, C.blueBorder);
  }).catch(e => toast('error', String(e.message || e), C.red, C.redBorder));
}
function sendChat() {
  const text = (S.chatInput || '').trim();
  if (!text) return;
  const id = Math.random().toString(36).slice(2);
  S.messages = S.messages.concat([{ id, from: 'me', text }]);
  S.chatInput = '';
  S.thinking = true;
  render();
  api('/api/ui/chat', { text }).then(r => {
    S.messages = S.messages.concat([{ id: id + 'a', from: 'agent', text: r.text, action: r.action }]);
    S.thinking = false;
    render();
  }).catch(() => {
    S.messages = S.messages.concat([{ id: id + 'a', from: 'agent', text: 'I could not reach the agent process — the last synced state is still shown.', action: null }]);
    S.thinking = false;
    render();
  });
}
function runChatAction(a) {
  if (a.kind === 'halt') toggleHalt();
  else if (a.kind === 'trade') setState({ trade: { side: a.side, pair: a.pair, amount: a.amount }, hold: 0 });
  else if (a.kind === 'journal') setState({ tab: 'journal', chatOpen: false });
  else setState({ tab: a.kind, chatOpen: false });
}
function setTheme(key) {
  applyTheme(key);
  try { localStorage.setItem('cb-theme-v2', key); } catch (e) {}
  setState({ themeKey: key });
}
function setRating(id, r) {
  S.ratings = Object.assign({}, S.ratings, { [id]: S.ratings[id] === r ? null : r });
  render();
}
function rateBtns(id) {
  const cur = S.ratings[id];
  return [
    { glyph: '✓', key: 'good', color: C.green, bg: C.greenBg, border: C.greenBorder },
    { glyph: '~', key: 'ok', color: C.dim, bg: C.panel, border: C.border },
    { glyph: '✗', key: 'bad', color: C.red, bg: C.redBg, border: C.redBorder },
  ].map(b => ({
    glyph: b.glyph,
    color: cur === b.key ? b.color : C.muted,
    bg: cur === b.key ? b.bg : C.card,
    border: cur === b.key ? b.border : C.border,
    setId: on(e => { e.stopPropagation(); setRating(id, b.key); }),
  }));
}
function queueHelp(key) {
  clearTimeout(S._help);
  S._help = setTimeout(() => setState({ helpKey: key }), TOOLTIP_DELAY_MS);
}
function cancelHelp() { clearTimeout(S._help); if (S.helpKey !== null) setState({ helpKey: null }); }
function pickTier(t) {
  setState(s => {
    if (t === null) return { aSel: [] };
    if (s.aSel.indexOf(t) >= 0) return { aSel: s.aSel.filter(x => x !== t) };
    if (s.aSel.length >= 3) return { aSel: s.aSel.slice(1).concat(t) };
    return { aSel: s.aSel.concat(t).sort() };
  });
}
function showTip(tip) { setState({ tip }); }
function hideTip() { setState({ tip: null }); }

/* ---------------- render: chrome ---------------- */
function btnMono(extra) {
  return "font-family: 'IBM Plex Mono', monospace; " + (extra || '');
}

function renderRail() {
  const d = D();
  const p = params();
  const pal = S.themeKey.split('-')[0];
  const TH = THEMES[S.themeKey];
  const mode = TH.mode;
  const running = d ? !d.halted : false;
  const loopAge = d && !S.syncFailed ? d.loopAgeS + 's' : '—';
  const tradesToday = d ? d.tradesToday + ' of ' + (p.maxTrades != null ? p.maxTrades : '—') : '—';
  const clock = d ? d.clock : '—';
  const uptime = d ? d.uptime : '—';
  const eggTitle = ((THEMES[S.themeKey] || {}).name || 'Instrument') + ' cabinet — change it in Loadout → Cabinet';
  return `
  <div style="display: flex; align-items: center; flex-wrap: wrap; gap: 8px 16px; padding: 9px 18px; background: var(--rail); border-bottom: 1px solid var(--border); font-size: 10.5px; white-space: nowrap; border-radius: 9px 9px 0 0">
    <span style="font-size: 13px; font-weight: 700; letter-spacing: 0.12em; flex: none">${esc(d ? d.bot.name : 'COOLBREEZE.')}</span>
    ${running ? `<span style="display: flex; align-items: center; gap: 6px; background: var(--posBg); color: var(--pos); padding: 3px 9px; border-radius: 0px; font-weight: 600; flex: none"><span style="width: 6px; height: 6px; border-radius: 50%; background: var(--pos)"></span>LIVE</span>` : ''}
    ${d && d.halted ? `<span style="display: flex; align-items: center; gap: 6px; background: var(--negBg); color: var(--neg); padding: 3px 9px; border-radius: 0px; font-weight: 700; flex: none">HALTED</span>` : ''}
    ${S.syncFailed ? `<span style="display: flex; align-items: center; gap: 6px; background: var(--amberBg); color: var(--amber); padding: 3px 9px; border-radius: 0px; font-weight: 700; flex: none">⚠ NO FEED</span>` : ''}
    <span style="color: var(--muted); flex: none">loop <span style="color: var(--text2)">${esc(loopAge)}</span></span>
    <span style="color: var(--muted); flex: none" class="rail-wide">uptime <span style="color: var(--text2)">${esc(uptime)}</span></span>
    <span style="color: var(--muted); flex: none">trades today <span style="color: var(--text2)">${esc(tradesToday)}</span></span>
    <span style="flex: 1"></span>
    <span style="color: var(--muted); flex: none" class="rail-wide">${esc(clock)}</span>
    <span title="${esc(eggTitle)}" style="flex: none; font-size: 11px; color: var(--muted); cursor: help; opacity: 0.85">${EGGS[pal] || '◆'}</span>
    <div style="display: flex; gap: 1px; background: var(--border); border-radius: 2px; padding: 1px; flex: none">
      <button data-on="${on(() => setTheme(pal + '-light'))}" style="${btnMono()}font-size: 10px; padding: 3px 9px; border-radius: 0px; border: none; cursor: pointer; background: ${mode === 'light' ? TH.card : 'transparent'}; color: ${mode === 'light' ? TH.text : TH.dim}">☀</button>
      <button data-on="${on(() => setTheme(pal + '-dark'))}" style="${btnMono()}font-size: 10px; padding: 3px 9px; border-radius: 0px; border: none; cursor: pointer; background: ${mode === 'dark' ? TH.card : 'transparent'}; color: ${mode === 'dark' ? TH.text : TH.dim}">☾</button>
    </div>
    <button data-on="${on(() => setState({ chatOpen: !S.chatOpen }))}" style="${btnMono()}font-size: 10px; font-weight: 600; background: var(--accentBg); border: 1px solid var(--accentEdge); color: var(--accent); padding: 4px 12px; border-radius: 2px; cursor: pointer; flex: none">${S.chatOpen ? 'Ask ×' : 'Ask'}</button>
    <button data-on="${on(() => setState({ palette: true, query: '' }))}" class="hov-accent" style="${btnMono()}font-size: 10px; background: var(--card); border: 1px solid var(--hard); color: var(--dim); padding: 4px 10px; border-radius: 2px; cursor: pointer; flex: none">⌘K</button>
    <button data-on="${on(toggleHalt)}" class="hov-neg" style="${btnMono()}font-size: 10px; font-weight: 600; background: var(--card); border: 1px solid var(--hard); color: var(--dim); padding: 4px 12px; border-radius: 2px; cursor: pointer; flex: none">${d && d.halted ? 'RESUME' : 'HALT'}</button>
  </div>`;
}

function renderHaltBanner() {
  const d = D();
  if (!d || !d.halted) return '';
  return `
  <div style="display: flex; align-items: center; gap: 14px; padding: 11px 22px; background: var(--negBg); border-bottom: 1px solid var(--negEdge)">
    <span style="font-size: 11px; font-weight: 700; letter-spacing: 0.06em; color: var(--neg)">TRADING HALTED</span>
    <span style="font-family: 'Instrument Sans', sans-serif; font-size: 13px; color: var(--negText)">${esc(d.haltReason || 'Stopped — no new orders will be placed.')} Positions untouched; stops still enforced.</span>
    <span style="flex: 1"></span>
    <button data-on="${on(toggleHalt)}" style="${btnMono()}font-size: 10.5px; font-weight: 700; background: var(--neg); color: var(--onAccent); border: none; padding: 5px 14px; border-radius: 2px; cursor: pointer">Resume</button>
  </div>`;
}

function renderNav() {
  const tabs = [['deck', 'Deck'], ['analytics', 'Analytics'], ['journal', 'Journal'], ['risk', 'Risk']];
  return `
  <div style="display: flex; align-items: center; gap: 2px; padding: 0 14px; background: var(--rail); border-bottom: 1px solid var(--border)">
    ${tabs.map(([k, label]) => `
      <button data-on="${on(() => setState({ tab: k }))}" style="${btnMono()}background: none; border: none; border-bottom: 2px solid ${S.tab === k ? C.blue : 'transparent'}; padding: 11px 16px; font-size: 11px; letter-spacing: 0.09em; text-transform: uppercase; color: ${S.tab === k ? C.text : C.dim}; cursor: pointer">${label}</button>`).join('')}
    <span style="flex: 1"></span>
    <button data-on="${on(() => setState({ tab: 'config' }))}" title="Loadout" style="${btnMono()}background: none; border: none; border-bottom: 2px solid ${S.tab === 'config' ? C.blue : 'transparent'}; padding: 10px 12px; font-size: 13px; color: ${S.tab === 'config' ? C.blue : C.dim}; cursor: pointer">⚙</button>
  </div>`;
}

/* ---------------- render: Deck page ---------------- */
function renderDeck() {
  const d = D();
  const p = params();
  const TH = THEMES[S.themeKey];
  const ch = headerChart(S.range, 640, 140);
  const deployed = positions().reduce((a, x) => a + x.size, 0);
  const unreal = unrealised();
  const BOOK = book();
  const es = equitySeries();
  const holds = ledger().map(t => hrsOf(t.held)).sort((a, b) => a - b);
  const avgHold = holds.length ? holds.reduce((a, b) => a + b, 0) / holds.length : 0;
  const medHold = holds.length ? holds[Math.floor(holds.length / 2)] : 0;
  const wins = ledger().filter(t => t.pnl > 0).length;
  const stale = isStale();
  const valColor = stale ? 'var(--textStale, var(--dim))' : 'var(--text)';

  const byTier = t => positions().filter(x => x.tier === t).reduce((a, x) => a + x.size, 0);
  const allocRows = [
    { label: 'USDC cash', amt: cash(), color: C.blue },
    { label: 'T1 Macro', amt: byTier(1), color: TIERS[1].color },
    { label: 'T2 DeFi', amt: byTier(2), color: TIERS[2].color },
    { label: 'T3 Emerging', amt: byTier(3), color: TIERS[3].color },
    { label: 'T4 Meme', amt: byTier(4), color: TIERS[4].color },
    { label: 'T5 Range', amt: byTier(5), color: TIERS[5].color },
  ].filter(r => r.amt > 0);
  const allocTotal = allocRows.reduce((a, r) => a + r.amt, 0) || 1;

  const miniStats = [
    { k: 'Open positions', v: String(positions().length), c: C.text, sub: 'across ' + new Set(positions().map(x => x.tier)).size + ' tiers' },
    { k: 'Deployed', v: '$' + Math.round(deployed), c: C.text, sub: (deployed / BOOK * 100).toFixed(0) + '% of book' },
    { k: 'Unrealised', v: pnlFmt(unreal), c: unreal >= 0 ? C.green : C.red, sub: 'on open positions' },
    { k: 'Win rate', v: ledger().length ? Math.round(wins / ledger().length * 100) + '%' : '—', c: C.green, sub: wins + ' of ' + ledger().length + ' closed' },
    { k: 'Max drawdown', v: '−' + Math.abs(es.maxDD).toFixed(1) + '%', c: C.amber, sub: 'halt at −' + p.drawdown + '%' },
    { k: 'Avg hold', v: avgHold ? avgHold.toFixed(1) + 'h' : '—', c: C.text, sub: 'median ' + medHold.toFixed(1) + 'h' },
  ];

  const tierCards = d.tierStates.map(x => {
    const T = TIERS[x.t];
    const onF = S.tierFilter === x.t;
    const stat = tierStat(x.t);
    const pnlStr = (stat.net >= 0 ? '+$' : '−$') + Math.abs(stat.net).toFixed(2);
    const dirBg = x.dir === 'REDUCE' || x.dir === 'EXIT' ? C.redBg : x.dir === 'ACCUMULATE' ? C.greenBg : T.bg;
    const dirFg = x.dir === 'REDUCE' || x.dir === 'EXIT' ? C.red : x.dir === 'ACCUMULATE' ? C.green : T.fg;
    return `
    <div data-on="${on(() => setState({ tierFilter: onF ? null : x.t }))}" class="hov-rail-bg" style="background: ${onF ? C.blueBg : C.panel}; border: 1px solid ${onF ? C.blueBorder : C.border}; border-left: 2px solid ${T.color}; border-radius: 2px; padding: 12px 14px; display: flex; flex-direction: column; gap: 10px; cursor: pointer">
      <div style="display: flex; align-items: center; gap: 8px">
        <span style="font-size: 9px; font-weight: 700; letter-spacing: 0.05em; color: ${T.color}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 14px">${T.tag}</span>
        <span style="flex: 1"></span>
        <span style="font-size: 9px; color: var(--muted)">${esc(x.age)}</span>
      </div>
      <div style="display: flex; align-items: baseline; gap: 8px">
        <span style="font-size: 17px; font-weight: 600">${esc(x.asset)}</span>
        <span style="font-size: 9.5px; font-weight: 700; letter-spacing: 0.06em; padding: 2px 7px; border-radius: 0px; background: ${dirBg}; color: ${dirFg}">${esc(x.dir)}</span>
      </div>
      <div style="display: flex; align-items: center; gap: 8px">
        <div style="flex: 1; height: 3px; background: var(--line); border-radius: 0px; overflow: hidden"><div style="height: 100%; width: ${x.conf}%; background: ${T.color}"></div></div>
        <span style="font-size: 9.5px; color: var(--dim); font-variant-numeric: tabular-nums">${x.conf}%</span>
      </div>
      <div style="display: flex; align-items: center; gap: 8px; font-size: 9.5px; color: var(--muted)">
        <span>P&amp;L <span style="color: ${pnlStr.startsWith('−') ? C.red : C.green}; font-variant-numeric: tabular-nums">${pnlStr}</span></span>
        <span style="flex: 1"></span>
        <button data-on="${on(e => { e.stopPropagation(); queueResearch(x.t); })}" class="hov-accent" style="${btnMono()}font-size: 9.5px; border: 1px solid var(--hard); background: var(--card); border-radius: 0px; padding: 2px 8px; color: var(--dim); cursor: pointer">Run</button>
      </div>
    </div>`;
  }).join('');

  const filtered = S.tierFilter ? d.journal.filter(j => j.tier === S.tierFilter) : d.journal;

  return `
  <div data-screen-label="Deck" style="display: flex; flex-direction: column; cursor: ${TH.cursor}">
    <div style="display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr); gap: 1px; background: var(--border)">
      <div style="background: var(--card); padding: 20px 22px; display: flex; flex-direction: column; gap: 14px">
        <div style="display: flex; align-items: flex-end; gap: 10px 28px; flex-wrap: wrap">
          <div style="display: flex; flex-direction: column; gap: 3px; flex: none">
            <div style="font-size: 9px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--muted)">Portfolio value</div>
            <div style="display: flex; align-items: baseline; gap: 9px">
              <div style="font-size: 40px; font-weight: 600; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; line-height: 1; color: ${valColor}">${money2(BOOK)}</div>
              ${staleChip()}
            </div>
          </div>
          <div style="display: flex; flex-direction: column; gap: 4px; flex: none; white-space: nowrap">
            <div style="font-size: 16px; font-weight: 600; color: var(--pos); font-variant-numeric: tabular-nums; line-height: 1.1">+$${(BOOK - seed()).toFixed(2)} <span style="font-size: 13px">+${((BOOK - seed()) / seed() * 100).toFixed(2)}%</span></div>
            <div style="font-size: 10px; color: var(--muted)">since inception · ${esc(d.seedLabel)}</div>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 5px; flex-wrap: wrap">
          ${['24H', '7D', '30D', 'ALL'].map(r => `
            <button data-on="${on(() => setState({ range: r }))}" style="${btnMono()}font-size: 9.5px; padding: 4px 10px; border: 1px solid ${S.range === r ? C.blueBorder : C.border}; background: ${S.range === r ? C.blueBg : C.card}; color: ${S.range === r ? C.blue : C.dim}; border-radius: 0px; cursor: pointer; flex: none">${r}</button>`).join('')}
        </div>
        <svg viewBox="0 0 640 140" style="width: 100%; height: 140px; display: block">
          <line x1="0" y1="10" x2="640" y2="10" style="stroke: var(--line)"></line>
          <line x1="0" y1="62" x2="640" y2="62" style="stroke: var(--line)"></line>
          <line x1="0" y1="114" x2="640" y2="114" style="stroke: var(--line)"></line>
          <path d="${ch.area}" opacity="0.09" style="fill: var(--posLine)"></path>
          <polyline points="${ch.line}" fill="none" stroke-width="1.9" style="stroke: var(--posLine)"></polyline>
          <circle cx="${ch.lastX}" cy="${ch.lastY}" r="3.5" style="fill: var(--pos)"></circle>
        </svg>
      </div>

      <div style="background: var(--card); padding: 20px 22px; display: flex; flex-direction: column; gap: 14px">
        <div style="font-size: 9px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--muted)">Allocation &amp; exposure</div>
        <div style="display: flex; height: 10px; border-radius: 0px; overflow: hidden; gap: 1px">
          ${allocRows.map(a => `<div style="width: ${(a.amt / allocTotal * 100).toFixed(0)}%; background: ${a.color}"></div>`).join('')}
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px 24px">
          ${allocRows.map(a => `
          <div style="display: flex; align-items: center; gap: 8px; font-size: 11px">
            <span style="width: 7px; height: 7px; border-radius: 0px; background: ${a.color}"></span>
            <span style="color: var(--dim)">${a.label}</span>
            <span style="flex: 1"></span>
            <span style="font-variant-numeric: tabular-nums; color: var(--text2)">$${a.amt.toFixed(0)}</span>
            <span style="color: var(--muted); width: 34px; text-align: right">${(a.amt / allocTotal * 100).toFixed(0)}%</span>
          </div>`).join('')}
        </div>
        <div style="height: 1px; background: var(--line)"></div>
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px 14px">
          ${miniStats.map(s => `
          <div style="display: flex; flex-direction: column; gap: 4px">
            <div style="font-size: 9px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted)">${s.k}</div>
            <div style="font-size: 17px; font-weight: 600; font-variant-numeric: tabular-nums; color: ${s.c}">${s.v}</div>
            <div style="font-size: 9.5px; color: var(--muted)">${s.sub}</div>
          </div>`).join('')}
        </div>
      </div>
    </div>

    <div style="border-top: 1px solid var(--border); padding: 16px 22px 0; display: flex; align-items: center; gap: 10px">
      <span style="font-size: 9px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--muted)">Tier spine</span>
      <span style="flex: 1; height: 1px; background: var(--line)"></span>
      <span style="font-size: 9.5px; color: var(--muted)">${S.tierFilter ? 'journal filtered to ' + TIERS[S.tierFilter].short : 'click a tier to filter the journal'}</span>
      ${S.tierFilter ? `<button data-on="${on(() => setState({ tierFilter: null }))}" style="${btnMono()}font-size: 9.5px; background: none; border: 1px solid var(--hard); color: var(--dim); padding: 2px 8px; border-radius: 0px; cursor: pointer">clear ×</button>` : ''}
    </div>
    <div style="display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; padding: 12px 22px 20px">
      ${tierCards}
    </div>

    <div style="display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); gap: 1px; background: var(--border); border-top: 1px solid var(--border)">
      ${renderPositionsPanel()}
      <div style="background: var(--card); padding: 18px 22px; display: flex; flex-direction: column; gap: 12px">
        <div style="display: flex; align-items: center; gap: 10px">
          <span style="font-size: 9px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--muted)">Agent journal</span>
          <span style="flex: 1"></span>
          <button data-on="${on(() => setState({ tab: 'journal' }))}" style="${btnMono()}font-size: 9.5px; background: none; border: none; color: var(--accent); cursor: pointer">All →</button>
        </div>
        ${filtered.slice(0, 3).map(j => renderJournalPreviewCard(j)).join('')}
      </div>
    </div>
  </div>`;
}

/* ---------------- render: positions + journal cards ---------------- */
function renderPositionsPanel() {
  const rows = positions().map(x => {
    const T = TIERS[x.tier];
    const pnl = posPnl(x);
    const isOpen = S.openPos === x.id;
    const details = [
      { k: 'P&L', v: (pnl >= 0 ? '+$' : '−$') + Math.abs(pnl).toFixed(2) + '  ' + (pnl >= 0 ? '+' : '−') + Math.abs(pnl / x.size * 100).toFixed(1) + '%', c: pnl >= 0 ? C.green : C.red, w: 600 },
      { k: 'Entry', v: px(x.entry), c: C.text2, w: 500 },
      { k: 'Stop', v: '$' + x.sl, c: C.red, w: 500 },
      { k: 'Target', v: '$' + x.tp, c: C.green, w: 500 },
      { k: 'To stop', v: Math.abs((x.mark - x.sl) / x.mark * 100).toFixed(1) + '%', c: C.text2, w: 500 },
      { k: 'Opened', v: x.opened, c: C.text2, w: 500 },
    ];
    return `
    <div style="display: flex; flex-direction: column; border-bottom: 1px solid var(--line)">
      <div data-on="${on(() => setState({ openPos: isOpen ? null : x.id }))}" style="display: grid; grid-template-columns: 1.6fr 0.9fr 0.9fr 0.5fr; gap: 0 12px; align-items: center; font-size: 12px; padding: 10px 0; cursor: pointer">
        <div style="display: flex; align-items: center; gap: 8px; min-width: 0">
          <span style="font-size: 8.5px; font-weight: 700; padding: 1px 5px; background: ${T.bg}; color: ${T.fg}; flex: none">${T.short}</span>
          <span style="font-weight: 600">${esc(x.asset)}</span>
          <span style="font-size: 10px; color: ${pnl >= 0 ? C.green : C.red}; flex: none">${pnl >= 0 ? '▲' : '▼'}</span>
        </div>
        <div style="text-align: right; font-variant-numeric: tabular-nums">$${x.size}</div>
        <div style="text-align: right; font-variant-numeric: tabular-nums; color: var(--dim)">${px(x.mark)}</div>
        <div style="text-align: right"><span style="font-size: 9.5px; color: var(--muted)">${isOpen ? '▾' : '▸'}</span></div>
      </div>
      ${isOpen ? `
      <div style="display: flex; flex-direction: column; gap: 10px; padding: 2px 0 14px">
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(94px, 1fr)); gap: 10px 16px">
          ${details.map(dd => `
          <div style="display: flex; flex-direction: column; gap: 2px">
            <span style="font-size: 9px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted)">${dd.k}</span>
            <span style="font-size: 12px; font-variant-numeric: tabular-nums; font-weight: ${dd.w}; color: ${dd.c}">${dd.v}</span>
          </div>`).join('')}
        </div>
        <div style="display: flex; align-items: center; gap: 12px">
          <span style="font-family: 'Instrument Sans', sans-serif; font-size: 11.5px; color: var(--dim)">Opened by ${x.source} · tranche ${esc(x.tranche)}.</span>
          <span style="flex: 1"></span>
          <button data-on="${on(e => { e.stopPropagation(); closePos(x.id); })}" style="${btnMono()}font-size: 9.5px; font-weight: 600; border: 1px solid var(--negEdge); background: var(--negBg); color: var(--neg); border-radius: 2px; padding: 5px 13px; cursor: pointer">Close at market</button>
        </div>
      </div>` : ''}
    </div>`;
  }).join('');

  const closedRows = !S.showClosed ? '' : `
    <div style="display: flex; flex-direction: column; gap: 8px; padding-top: 6px">
      <div style="font-size: 9px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--muted)">Closed</div>
      ${ledger().slice().reverse().map(t => `
      <div style="display: flex; align-items: center; gap: 12px; font-size: 11px; padding: 6px 0; border-bottom: 1px solid var(--line)">
        <span style="font-size: 8.5px; font-weight: 700; padding: 1px 5px; border-radius: 0px; background: ${TIERS[t.tier].bg}; color: ${TIERS[t.tier].fg}">${TIERS[t.tier].short}</span>
        <span style="font-weight: 600; width: 68px">${esc(t.sym)}</span>
        <span style="color: var(--dim); font-variant-numeric: tabular-nums">${t.date}/26</span>
        <span style="color: var(--muted)">${esc(t.by)}</span>
        <span style="flex: 1"></span>
        <span style="font-variant-numeric: tabular-nums; font-weight: 600; color: ${t.pnl >= 0 ? C.green : C.red}">${(t.pnl >= 0 ? '+$' : '−$') + Math.abs(t.pnl).toFixed(2)}</span>
      </div>`).join('')}
    </div>`;

  return `
  <div style="background: var(--card); padding: 18px 22px; display: flex; flex-direction: column; gap: 12px">
    <div style="display: flex; align-items: center; gap: 10px">
      <span style="font-size: 9px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--muted)">Open positions</span>
      <span style="flex: 1"></span>
      <button data-on="${on(() => setState({ showClosed: !S.showClosed }))}" style="${btnMono()}font-size: 9.5px; white-space: nowrap; color: var(--dim); background: none; border: 1px solid var(--hard); border-radius: 2px; padding: 3px 9px; cursor: pointer">${S.showClosed ? 'Closed ▾' : 'Closed ▸'}</button>
    </div>
    <div style="display: grid; grid-template-columns: 1.6fr 0.9fr 0.9fr 0.5fr; gap: 0 12px; font-size: 9px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); padding-bottom: 7px; border-bottom: 1px solid var(--border)">
      <div>Position</div><div style="text-align: right">Size</div><div style="text-align: right">Mark</div><div></div>
    </div>
    ${rows}
    ${closedRows}
  </div>`;
}

function renderJournalPreviewCard(j) {
  const t = TIERS[j.tier];
  const acted = j.action !== 'HELD';
  const isOpen = !!S.expanded[j.id];
  const actBg = acted ? (j.action.startsWith('SOLD') ? C.redBg : C.greenBg) : C.panel;
  const actFg = acted ? (j.action.startsWith('SOLD') ? C.red : C.green) : C.dim;
  const dateShort = j.date.slice(0, j.date.lastIndexOf('/'));
  return `
  <div style="border: 1px solid var(--border); border-radius: 2px; background: var(--rail); padding: 12px 13px; display: flex; flex-direction: column; gap: 9px">
    <div style="display: flex; align-items: center; gap: 7px">
      <span style="font-size: 8.5px; font-weight: 700; padding: 1px 5px; border-radius: 0px; background: ${t.bg}; color: ${t.fg}">${t.short}</span>
      <span style="font-size: 12px; font-weight: 600">${esc(j.asset)}</span>
      <span style="font-size: 9px; font-weight: 700; padding: 1px 6px; border-radius: 0px; background: ${actBg}; color: ${actFg}">${esc(j.action)}</span>
      <span style="flex: 1"></span>
      <span style="font-size: 9px; color: var(--muted); font-variant-numeric: tabular-nums">${dateShort} · ${j.time}</span>
    </div>
    <div style="font-family: 'Instrument Sans', sans-serif; font-size: 13px; line-height: 1.5; color: var(--text15); text-wrap: pretty">${esc(j.headline)}</div>
    <div style="display: flex; align-items: center; gap: 10px; font-size: 9.5px; color: var(--muted)">
      <button data-on="${on(() => { S.expanded = Object.assign({}, S.expanded, { [j.id]: !S.expanded[j.id] }); render(); })}" style="${btnMono()}font-size: 9.5px; background: none; border: none; color: var(--accent); cursor: pointer; padding: 0">${isOpen ? 'Hide reasoning ▴' : 'Signal, plan and risk ▾'}</button>
      <span style="flex: 1"></span>
      <span>rate</span>
      ${rateBtns(j.id).map(r => `<button data-on="${r.setId}" style="${btnMono()}font-size: 10px; background: ${r.bg}; border: 1px solid ${r.border}; color: ${r.color}; border-radius: 0px; padding: 1px 6px; cursor: pointer">${r.glyph}</button>`).join('')}
    </div>
    ${isOpen ? `
    <div style="display: grid; grid-template-columns: 54px 1fr; gap: 6px 12px; padding-top: 4px; border-top: 1px solid var(--border); font-size: 11.5px">
      <span style="color: var(--muted); font-size: 9px; letter-spacing: 0.1em; text-transform: uppercase; padding-top: 2px">Signal</span>
      <span style="font-family: 'Instrument Sans', sans-serif; color: var(--bodyText); line-height: 1.5">${esc(j.signal)}</span>
      <span style="color: var(--muted); font-size: 9px; letter-spacing: 0.1em; text-transform: uppercase; padding-top: 2px">Plan</span>
      <span style="font-family: 'Instrument Sans', sans-serif; color: var(--bodyText); line-height: 1.5">${esc(j.plan)}</span>
      <span style="color: var(--muted); font-size: 9px; letter-spacing: 0.1em; text-transform: uppercase; padding-top: 2px">Risk</span>
      <span style="font-family: 'Instrument Sans', sans-serif; color: var(--bodyText); line-height: 1.5">${esc(j.risk)}</span>
    </div>` : ''}
  </div>`;
}

/* ---------------- render: Journal page (with Reporting module) ---------------- */
function renderJournal() {
  const d = D();
  const filtered = S.tierFilter ? d.journal.filter(j => j.tier === S.tierFilter) : d.journal;
  const k = infoOf('journal');
  const journalHint = S.tierFilter
    ? 'Filtered to ' + TIERS[S.tierFilter].long + ' · ' + filtered.length + ' entries. Click a card to open its reasoning.'
    : 'One card per decision. Click a card for signal, plan and risk.';

  const chips = [{ k: null, label: 'All' }].concat([1, 2, 3, 4, 5].map(t => ({ k: t, label: TIERS[t].short }))).map(c => {
    const onC = S.tierFilter === c.k;
    return `<button data-on="${on(() => setState({ tierFilter: c.k }))}" style="${btnMono()}font-size: 10px; padding: 5px 11px; border-radius: 0px; border: 1px solid ${onC ? C.blueBorder : C.border}; background: ${onC ? C.blueBg : C.card}; color: ${onC ? C.blue : C.dim}; cursor: pointer">${c.label}</button>`;
  }).join('');

  const triggers = [
    { key: 'analyst', label: 'Run analyst', title: 'Re-run the analyst across every tier' },
  ].concat([1, 2, 3, 4, 5].map(t => ({ key: String(t), label: 'Run T' + t, title: TIERS[t].long + ' research cycle' })))
    .map(t => `<button data-on="${on(() => queueResearch(t.key))}" title="${esc(t.title)}" class="hov-hard press" style="${btnMono()}font-size: 10.5px; letter-spacing: 0.04em; color: ${t.key === 'analyst' ? C.text2 : C.dim}; background: var(--rail); border: 1px solid ${t.key === 'analyst' ? C.hard : C.border}; border-radius: 2px; padding: 6px 11px; cursor: pointer; box-shadow: 0 2px 0 var(--border)">${t.label}</button>`).join('');

  const reports = d.reports.map(r => `
    <div style="display: flex; align-items: center; gap: 10px; border: 1px solid var(--border); background: var(--rail); border-radius: 2px; padding: 7px 10px">
      <span style="${btnMono()}font-size: 10.5px; color: var(--text2); flex: none">${esc(r.date)}</span>
      <span style="font-family: 'Instrument Sans', sans-serif; font-size: 11.5px; color: var(--dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap">${esc(r.summary)}</span>
      <span style="flex: 1"></span>
      <span style="font-size: 10.5px; font-weight: 600; font-variant-numeric: tabular-nums; color: ${r.net >= 0 ? C.green : C.red}; flex: none">${(r.net >= 0 ? '+$' : '−$') + Math.abs(r.net).toFixed(0)}</span>
      <button data-on="${on(() => toast('report', r.date + ' report opened in a new pane', C.blue, C.blueBorder))}" class="hov-accent-color" style="${btnMono()}font-size: 10px; color: var(--muted); background: none; border: none; cursor: pointer; flex: none">open ▸</button>
    </div>`).join('');

  const cards = filtered.map(j => renderJournalCard(j)).join('');

  return `
  <div data-screen-label="Journal" style="padding: 26px 30px 40px; display: flex; flex-direction: column; gap: 18px">
    <div style="display: flex; align-items: flex-end; gap: 16px">
      <div style="display: flex; flex-direction: column; gap: 5px">
        <div style="font-family: 'Instrument Sans', sans-serif; font-size: 22px; font-weight: 600">Journal</div>
        <div style="position: relative; display: inline-flex; align-items: center">
          ${infoDot(k)}
          ${k.open ? `<span style="position: absolute; left: 0; top: 22px; z-index: 40; width: 290px; background: var(--card); border: 1px solid var(--hard); border-radius: 2px; box-shadow: 0 10px 28px rgba(20,23,29,0.18); padding: 10px 12px; font-family: 'Instrument Sans', sans-serif; font-size: 12px; line-height: 1.5; color: var(--text2); text-wrap: pretty">${esc(journalHint)}</span>` : ''}
        </div>
      </div>
      <span style="flex: 1"></span>
      <div style="display: flex; gap: 5px">${chips}</div>
    </div>

    <div style="border: 1px solid var(--border); border-radius: 3px; background: var(--card); padding: 15px 18px 17px; display: flex; flex-direction: column; gap: 14px; min-width: 0">
      <div style="display: flex; align-items: baseline; gap: 9px">
        <span style="font-size: 9.5px; letter-spacing: 0.15em; text-transform: uppercase; color: var(--text2)">Reporting</span>
        <span style="flex: 1"></span>
        <span style="font-size: 10px; color: var(--muted)">runs immediately · not staged</span>
      </div>
      <div style="display: flex; flex-direction: column; gap: 8px">
        <div style="display: flex; align-items: baseline; gap: 7px">
          <span style="font-size: 9.5px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--text2)">Research triggers</span>
          <span style="font-family: 'Instrument Sans', sans-serif; font-size: 11.5px; color: var(--muted)">force a cycle now</span>
        </div>
        <div style="display: flex; flex-wrap: wrap; gap: 7px">${triggers}</div>
      </div>
      <div style="display: flex; flex-direction: column; gap: 8px">
        <div style="display: flex; align-items: baseline; gap: 7px">
          <span style="font-size: 9.5px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--text2)">Reports</span>
          <span style="font-family: 'Instrument Sans', sans-serif; font-size: 11.5px; color: var(--muted)">daily digest 07:00 · weekly review Sunday</span>
          <span style="flex: 1"></span>
          <button data-on="${on(() => { api('/api/ui/report/generate', {}).then(r => toast('running', r.message, C.blue, C.blueBorder)).catch(() => {}); })}" class="hov-accent-bg" style="${btnMono()}font-size: 10.5px; color: var(--accent); background: var(--card); border: 1px solid var(--accentEdge); border-radius: 2px; padding: 5px 11px; cursor: pointer">Generate today’s report</button>
        </div>
        ${reports}
      </div>
    </div>

    <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(268px, 1fr)); gap: 12px; align-items: start">
      ${cards}
    </div>
  </div>`;
}

function renderJournalCard(j) {
  const t = TIERS[j.tier];
  const acted = j.action !== 'HELD';
  const selected = S.journalSel === j.id;
  const rawOpen = !!S.expanded[j.id];
  const actBg = acted ? (j.action.startsWith('SOLD') ? C.redBg : C.greenBg) : C.panel;
  const actFg = acted ? (j.action.startsWith('SOLD') ? C.red : C.green) : C.dim;
  const selectId = on(() => setState({ journalSel: S.journalSel === j.id ? null : j.id }));
  return `
  <div style="grid-column: auto; border: 1px solid ${selected ? C.blue : C.border}; border-radius: 3px; background: var(--card); box-shadow: ${selected ? '0 6px 20px rgba(0,0,0,0.10)' : 'none'}; display: flex; flex-direction: column; overflow: clip; transition: border-color 120ms ease">
    <div data-on="${selectId}" style="display: flex; flex-direction: column; gap: 10px; padding: 13px 15px 12px; cursor: pointer; border-left: 2px solid ${t.fg}">
      <div style="display: flex; align-items: center; gap: 8px">
        <span style="font-size: 9px; font-weight: 700; letter-spacing: 0.06em; padding: 2px 6px; background: ${t.bg}; color: ${t.fg}">${t.short}</span>
        <span style="font-size: 14px; font-weight: 600">${esc(j.asset)}</span>
        <span style="flex: 1"></span>
        <span style="font-size: 10px; color: var(--muted); font-variant-numeric: tabular-nums">${j.date} · ${j.time}</span>
      </div>
      <div style="display: flex; align-items: center; gap: 8px">
        <span style="font-size: 10px; font-weight: 700; letter-spacing: 0.05em; padding: 2px 8px; background: ${actBg}; color: ${actFg}">${esc(j.action)}</span>
        <span style="font-size: 10.5px; color: var(--muted)">${j.conf}% confident</span>
      </div>
      <div style="font-family: 'Instrument Sans', sans-serif; font-size: 13.5px; line-height: 1.5; color: var(--text); text-wrap: pretty; display: -webkit-box; -webkit-line-clamp: ${selected ? 99 : 3}; -webkit-box-orient: vertical; overflow: hidden">${esc(j.headline)}</div>
      <div style="display: flex; align-items: center; gap: 10px; padding-top: 1px">
        <span style="${btnMono()}font-size: 10.5px; color: var(--accent)">${selected ? 'Reasoning ▴' : 'Drill down →'}</span>
        <span style="flex: 1"></span>
        ${rateBtns(j.id).map(r => `<button data-on="${r.setId}" style="${btnMono()}font-size: 10px; background: ${r.bg}; border: 1px solid ${r.border}; color: ${r.color}; padding: 1px 7px; cursor: pointer">${r.glyph}</button>`).join('')}
      </div>
    </div>
    ${selected ? `
    <div style="border-top: 1px solid var(--line); background: var(--rail); padding: 14px 16px 15px; display: flex; flex-direction: column; gap: 12px">
      <div style="display: flex; flex-direction: column; gap: 11px">
        ${[['Signal', j.signal], ['Plan', j.plan], ['Risk', j.risk]].map(([kk, vv]) => `
        <div style="display: flex; flex-direction: column; gap: 4px">
          <span style="color: var(--muted); font-size: 9px; letter-spacing: 0.12em; text-transform: uppercase">${kk}</span>
          <span style="font-family: 'Instrument Sans', sans-serif; font-size: 13px; color: var(--bodyText); line-height: 1.55">${esc(vv)}</span>
        </div>`).join('')}
      </div>
      <div style="display: flex; align-items: center; gap: 14px">
        <button data-on="${on(() => { S.expanded = Object.assign({}, S.expanded, { [j.id]: !S.expanded[j.id] }); render(); })}" style="${btnMono()}font-size: 10.5px; background: none; border: none; color: var(--accent); cursor: pointer; padding: 0">${rawOpen ? 'Hide raw reasoning ▴' : 'Read the raw reasoning ▾'}</button>
        <button data-on="${selectId}" style="${btnMono()}font-size: 10.5px; background: none; border: none; color: var(--muted); cursor: pointer; padding: 0">Close ▴</button>
      </div>
      ${rawOpen ? `<div style="${btnMono()}font-size: 11px; line-height: 1.7; color: var(--bodyText); background: var(--card); border: 1px solid var(--line); border-left: 2px solid var(--accent); padding: 12px 14px; white-space: pre-wrap">${esc(j.raw)}</div>` : ''}
    </div>` : ''}
  </div>`;
}

/* ---------------- render: Risk page ---------------- */
function renderRisk() {
  const d = D();
  const p = params();
  const k = infoOf('risk');
  const kc = infoOf('checks');
  const kh = infoOf('halt');
  const first = d.riskLog[0] || { dd: '—', day: '—', consec: '—' };
  const ddNow = parseFloat(first.dd) || 0;
  const dayNow = parseFloat(first.day) || 0;
  const consecNow = parseInt(first.consec, 10) || 0;
  const gauges = [
    { key: 'g0', k: 'Drawdown', v: first.dd === '—' ? '—' : first.dd, w: Math.max(2, ddNow / p.drawdown * 100) + '%', c: ddNow / p.drawdown > 0.7 ? C.amber : C.green, sub: 'halts at −' + p.drawdown + '%', help: 'Percentage below the book’s running high-water mark, not below the seed. Crossing the configured limit halts trading immediately.' },
    { key: 'g1', k: 'Daily loss', v: first.day === '—' ? '—' : first.day, w: Math.max(2, dayNow / p.dailyLoss * 100) + '%', c: dayNow / p.dailyLoss > 0.7 ? C.amber : C.green, sub: 'halts at −' + p.dailyLoss + '%', help: 'Realised plus unrealised loss since 00:00 UTC, measured against the book value at day open.' },
    { key: 'g2', k: 'Consecutive losses', v: String(first.consec), w: Math.max(2, consecNow / p.consec * 100).toFixed(0) + '%', c: consecNow / p.consec > 0.7 ? C.amber : C.green, sub: 'halts at ' + p.consec, help: 'Losing closes in a row across every tier. One win resets the count to zero.' },
  ].map((g, i) => {
    const gi = infoOf('gauge' + i);
    return `
    <div style="border: 1px solid var(--border); border-radius: 2px; padding: 15px 16px; display: flex; flex-direction: column; gap: 10px">
      <div style="display: flex; align-items: center; gap: 7px">
        <span style="font-size: 9.5px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--muted)">${g.k}</span>
        <span style="flex: 1"></span>
        <span style="font-size: 18px; font-weight: 600; font-variant-numeric: tabular-nums; color: ${g.c}">${g.v}</span>
      </div>
      <div style="height: 7px; background: var(--line); overflow: hidden; box-shadow: inset 0 1px 2px rgba(0,0,0,0.12)"><div style="height: 100%; width: ${g.w}; background: ${g.c}; box-shadow: ${glow(g.c, true)}; transition: width 200ms ease"></div></div>
      <div style="display: flex; align-items: center; gap: 8px; position: relative">
        ${infoDot(gi)}
        <span style="flex: 1"></span>
        <span style="font-size: 10px; color: var(--muted); font-variant-numeric: tabular-nums">${g.sub}</span>
        ${gi.open ? `<span style="position: absolute; left: 0; bottom: 22px; z-index: 40; width: 250px; background: var(--card); border: 1px solid var(--hard); border-radius: 2px; box-shadow: 0 10px 28px rgba(20,23,29,0.18); padding: 10px 12px; font-family: 'Instrument Sans', sans-serif; font-size: 12px; line-height: 1.5; color: var(--text2); text-wrap: pretty">${esc(g.help)}</span>` : ''}
      </div>
    </div>`;
  }).join('');

  const log = d.riskLog.map(r => `
    <div style="display: grid; grid-template-columns: 0.8fr 1fr 1fr 1fr 1fr 1fr 0.8fr; gap: 0 12px; font-size: 11px; padding: 7px 0; border-bottom: 1px solid var(--line); font-variant-numeric: tabular-nums">
      <div style="color: var(--dim)">${esc(r.time)}</div>
      <div style="text-align: right">${esc(r.value)}</div>
      <div style="text-align: right; color: var(--text2)">${esc(r.dd)}</div>
      <div style="text-align: right; color: var(--text2)">${esc(r.day)}</div>
      <div style="text-align: right">${esc(r.consec)}</div>
      <div style="text-align: right">${esc(r.trades)}</div>
      <div style="text-align: right; color: ${r.status === 'ok' ? C.green : C.red}">${esc(r.status)}</div>
    </div>`).join('');

  return `
  <div data-screen-label="Risk" style="padding: 26px 30px 40px; display: flex; flex-direction: column; gap: 24px">
    <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap">
      <div style="font-family: 'Instrument Sans', sans-serif; font-size: 22px; font-weight: 600">Risk monitor</div>
      <span style="position: relative; display: inline-flex; align-items: center">
        ${infoDot(k)}
        ${k.open ? `<span style="position: absolute; left: 0; top: 22px; z-index: 40; width: 300px; background: var(--card); border: 1px solid var(--hard); border-radius: 2px; box-shadow: 0 10px 28px rgba(20,23,29,0.18); padding: 10px 12px; font-family: 'Instrument Sans', sans-serif; font-size: 12px; line-height: 1.5; color: var(--text2); text-wrap: pretty">The monitor runs every 60 seconds against the live book. A breach halts new trading only — open positions keep their stops and targets.</span>` : ''}
      </span>
      <span style="flex: 1"></span>
      <button data-on="${on(() => setState({ appendix: true }))}" class="hov-accent-bg" style="${btnMono()}font-size: 10.5px; color: var(--accent); background: none; border: 1px solid var(--accentEdge); border-radius: 2px; padding: 5px 11px; cursor: pointer">Player’s guide →</button>
    </div>
    <div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; max-width: 900px">${gauges}</div>
    <div style="display: flex; flex-direction: column; gap: 10px; max-width: 1000px">
      <div style="display: flex; align-items: center; gap: 10px">
        <span style="font-size: 9px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--muted)">Recent checks</span>
        <span style="position: relative; display: inline-flex; align-items: center">
          ${infoDot(kc)}
          ${kc.open ? `<span style="position: absolute; left: 0; top: 22px; z-index: 40; width: 320px; background: var(--card); border: 1px solid var(--hard); border-radius: 2px; box-shadow: 0 10px 28px rgba(20,23,29,0.18); padding: 10px 12px; font-family: 'Instrument Sans', sans-serif; font-size: 12px; line-height: 1.5; color: var(--text2); text-wrap: pretty">The last six monitor passes. Portfolio is book value at check time; drawdown and daily are measured against the high-water mark and the day open.</span>` : ''}
        </span>
      </div>
      <div style="display: grid; grid-template-columns: 0.8fr 1fr 1fr 1fr 1fr 1fr 0.8fr; gap: 0 12px; font-size: 9px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); padding-bottom: 7px; border-bottom: 1px solid var(--border)">
        <div>Time</div><div style="text-align: right">Portfolio</div><div style="text-align: right">Drawdown</div><div style="text-align: right">Daily</div><div style="text-align: right">Consec L</div><div style="text-align: right">Trades 24h</div><div style="text-align: right">Status</div>
      </div>
      ${log}
    </div>
    <div style="display: flex; flex-direction: column; gap: 13px; border: 1px solid var(--negEdge); border-radius: 2px; padding: 16px 18px; max-width: 1000px">
      <div style="display: flex; align-items: center; gap: 10px">
        <span style="font-size: 9.5px; letter-spacing: 0.15em; text-transform: uppercase; color: var(--neg)">Halt controls</span>
        <span style="flex: 1"></span>
        <span style="font-size: 10.5px; font-weight: 600; color: ${d.halted ? C.red : C.green}; background: ${d.halted ? C.redBg : C.greenBg}; padding: 3px 10px; border-radius: 0px">${d.halted ? 'HALTED' : 'RUNNING'}</span>
      </div>
      <div style="display: flex; align-items: center; gap: 12px">
        <button data-on="${on(toggleHalt)}" style="${btnMono()}font-size: 11px; color: var(--neg); background: var(--card); border: 1px solid var(--negEdge); border-radius: 2px; padding: 7px 15px; cursor: pointer">${d.halted ? 'RESUME' : 'HALT'}</button>
        <button data-on="${on(() => doHalt('halt-hour'))}" style="${btnMono()}font-size: 11px; color: var(--amber); background: var(--card); border: 1px solid var(--amberEdge); border-radius: 2px; padding: 7px 15px; cursor: pointer">Halt for 1 hour</button>
        <span style="flex: 1"></span>
        <span style="position: relative; display: inline-flex; align-items: center">
          ${infoDot(kh)}
          ${kh.open ? `<span style="position: absolute; right: 0; bottom: 22px; z-index: 40; width: 300px; background: var(--card); border: 1px solid var(--hard); border-radius: 2px; box-shadow: 0 10px 28px rgba(20,23,29,0.18); padding: 10px 12px; font-family: 'Instrument Sans', sans-serif; font-size: 12px; line-height: 1.5; color: var(--text2); text-wrap: pretty">Auto-halts at −${p.drawdown}% drawdown, ${p.dailyLoss}% daily loss, or ${p.consec} losses in a row. Thresholds live in Loadout. Clearing a halt requires typing CLEAR.</span>` : ''}
        </span>
      </div>
    </div>
  </div>`;
}

/* ---------------- render: Analytics page ---------------- */
function computeAnalytics() {
  const s = S;
  const d = D();
  const LEDGER = ledger();
  const SEED = seed();
  const TOTAL_DAYS = d.totalDays;
  const sel = s.aSel;
  const onT = t => sel.length === 0 || sel.indexOf(t) >= 0;
  const shown = sel.length ? sel : [1, 2, 3, 4, 5];
  const TC = t => TIERS[t].color;
  const OPEN = positions().map(p => ({ tier: p.tier, sym: p.asset, size: p.size, entry: p.entry, mark: p.mark }));

  const realisedV = realised();
  const unreal = OPEN.reduce((a, p) => a + (p.mark - p.entry) / p.entry * p.size, 0);
  const bookV = SEED + realisedV + unreal;
  const deployed = OPEN.reduce((a, p) => a + p.size, 0);
  const cashV = bookV - deployed;
  const wins = LEDGER.filter(t => t.pnl > 0).length;
  const gross = LEDGER.reduce((a, t) => a + Math.max(0, t.pnl), 0);
  const loss = LEDGER.reduce((a, t) => a + Math.max(0, -t.pnl), 0);
  const pf = loss > 0 ? gross / loss : Infinity;

  const { equity, dd, maxDD } = equitySeries();

  const spanDays = { '7D': 7, '30D': 30, '90D': TOTAL_DAYS, 'ALL': TOTAL_DAYS }[s.aRange];
  const from = Math.max(0, TOTAL_DAYS - spanDays);
  const eqR = equity.filter(p => p.d >= from);
  const ddR = dd.filter(p => p.d >= from);
  const inRange = LEDGER.filter(t => t.day >= from);
  const xd = dv => ((dv - from) / Math.max(1, TOTAL_DAYS - from)) * CW;
  const pts = arr => arr.map(p => p.x.toFixed(1) + ',' + p.y.toFixed(1)).join(' ');
  const hit = (ci, x, y, label, sub, color) => ({
    onId: on(() => showTip({ i: ci, label, sub, l: (x / CW * 100).toFixed(2) + '%', t: (y / 150 * 100).toFixed(2) + '%', c: color })),
    offId: on(() => hideTip()),
  });
  const lg = (label, color, val, valC, op) => ({ label, color, val: val == null ? '' : val, valC: valC || C.text2, op: op == null ? 1 : op });
  const plot = { cap: '', hitRects: [], hitLines: [], hitDots: [], hasPlot: true, hasCols: false, hasBars: false, hasStack: false, stack: [], hasLegend: false, cols: [], bars: [], legend: [], colCount: 1 };

  const evals = eqR.map(p => p.v);
  const evLo = Math.min.apply(null, evals), evHi = Math.max.apply(null, evals);
  const seedInView = SEED >= evLo && SEED <= evHi;
  const lo = (seedInView ? Math.min(evLo, SEED) : evLo) * 0.999;
  const hi = Math.max.apply(null, evals) * 1.002;
  const ey = v => CPB - ((v - lo) / (hi - lo)) * (CPB - CPT);
  const epts = eqR.map(p => ({ x: xd(p.d), y: ey(p.v) }));
  const cEquity = { ...plot,
    title: 'Book equity · ' + dstr(from) + '→' + dstr(TOTAL_DAYS), val: '$' + bookV.toFixed(0), valC: C.text,
    grid: [CPT + 20, (CPT + CPB) / 2, CPB - 20],
    areas: [{ d: 'M' + epts.map(p => p.x.toFixed(1) + ' ' + p.y.toFixed(1)).join(' L') + ' L' + CW + ' ' + CPB + ' L0 ' + CPB + ' Z', fill: C.green, op: 0.09 }],
    lines: [
      { pts: pts(epts), stroke: C.green, w: 2, dash: '', op: 1 },
      { pts: '0,' + ey(SEED).toFixed(1) + ' ' + CW + ',' + ey(SEED).toFixed(1), stroke: C.hard, w: 1, dash: '3 4', op: seedInView ? 1 : 0 },
    ],
    rects: [],
    dots: inRange.filter(t => onT(t.tier)).map(t => {
      const i = eqR.findIndex(p => p.d === t.day);
      return { x: xd(t.day).toFixed(1), y: ey(eqR[i < 0 ? 0 : i].v).toFixed(1), r: (2.4 + Math.min(3.4, Math.abs(t.pnl) / 4)).toFixed(1), fill: t.pnl >= 0 ? C.green : C.red, op: 0.75 };
    }),
    hitDots: inRange.filter(t => onT(t.tier)).map(t => {
      const i = eqR.findIndex(p => p.d === t.day);
      const y = ey(eqR[i < 0 ? 0 : i].v);
      return Object.assign({ x: xd(t.day).toFixed(1), y: y.toFixed(1) },
        hit(0, xd(t.day), y, t.sym + ' ' + aSigned(t.pnl), 'T' + t.tier + ' · ' + t.date + ' · ' + t.by, t.pnl >= 0 ? C.green : C.red));
    }),
    cap: dstr(from) + ' → ' + dstr(TOTAL_DAYS),
    note: (seedInView ? 'Dashed line is the ' + aMoney(SEED) + ' seed. ' : 'Seed ' + aMoney(SEED) + ' sits below this range. ') + 'Dots are closed trades, sized by P&L' + (sel.length ? ', picked tiers only.' : '.'),
  };

  const maxDDr = Math.min.apply(null, ddR.map(x => x.pct));
  const floorV = Math.min(maxDDr * 1.4 - 0.4, -2);
  const dy = v => CPT + ((v - 1) / (floorV - 1)) * (CPB - CPT);
  const dpts = ddR.map(p => ({ x: xd(p.d), y: dy(p.pct) }));
  const cDraw = { ...plot,
    title: 'Drawdown · halt −' + params().drawdown + '%', val: '−' + Math.abs(maxDDr).toFixed(1) + '%', valC: C.amber,
    grid: [], areas: [{ d: 'M' + dpts.map(p => p.x.toFixed(1) + ' ' + p.y.toFixed(1)).join(' L') + ' L' + CW + ' ' + dy(0).toFixed(1) + ' L0 ' + dy(0).toFixed(1) + ' Z', fill: C.red, op: 0.1 }],
    lines: [
      { pts: pts(dpts), stroke: C.red, w: 2, dash: '', op: 1 },
      { pts: '0,' + dy(0).toFixed(1) + ' ' + CW + ',' + dy(0).toFixed(1), stroke: C.hard, w: 1, dash: '', op: 1 },
    ],
    rects: [], dots: [],
    cap: dstr(from) + ' → ' + dstr(TOTAL_DAYS),
    note: 'How far below its own peak the book has fallen, inside the selected range. All-time worst is −' + Math.abs(maxDD).toFixed(1) + '%.',
  };

  const tierSeries = shown.map(t => {
    let a = 0;
    const series = [{ d: from, v: 0 }];
    inRange.filter(x => x.tier === t).forEach(x => { a += x.pnl; series.push({ d: x.day, v: a }); });
    series.push({ d: TOTAL_DAYS, v: a });
    return { t, series, end: a };
  });
  const allV = tierSeries.reduce((acc, x) => acc.concat(x.series.map(p => p.v)), [0]);
  const cLo = Math.min.apply(null, allV), cHi = Math.max.apply(null, allV);
  const cy = v => CPB - ((v - cLo) / Math.max(0.001, cHi - cLo)) * (CPB - CPT);
  const cTiers = { ...plot,
    title: sel.length ? 'Tier P&L · compared' : 'Cumulative P&L by tier',
    val: aSigned(tierSeries.reduce((a, x) => a + x.end, 0)), valC: tierSeries.reduce((a, x) => a + x.end, 0) >= 0 ? C.green : C.red,
    grid: [], areas: [], rects: [], dots: [],
    lines: tierSeries.map(x => ({
      pts: x.series.map(p => xd(p.d).toFixed(1) + ',' + cy(p.v).toFixed(1)).join(' '),
      stroke: TC(x.t), w: sel.length ? 2.2 : 1.6, dash: '', op: 0.95,
    })).concat([{ pts: '0,' + cy(0).toFixed(1) + ' ' + CW + ',' + cy(0).toFixed(1), stroke: C.hard, w: 1, dash: '2 3', op: 1 }]),
    cap: dstr(from) + ' → ' + dstr(TOTAL_DAYS),
    hitLines: tierSeries.map(x => {
      const last = x.series[x.series.length - 1];
      return Object.assign({ pts: x.series.map(p => xd(p.d).toFixed(1) + ',' + cy(p.v).toFixed(1)).join(' ') },
        hit(2, xd(last.d) - 40, cy(last.v), TIERS[x.t].long, 'net ' + aSigned(x.end) + ' in range · ' + inRange.filter(y => y.tier === x.t).length + ' trades', TC(x.t)));
    }),
    hasLegend: true,
    legend: tierSeries.map(x => lg('T' + x.t, TC(x.t), aSigned(x.end), x.end >= 0 ? C.green : C.red)),
    note: 'Running realised P&L per tier, from zero at the start of the range.',
  };

  const weeks = [];
  for (let w = Math.floor(from / 7); w * 7 <= TOTAL_DAYS; w++) {
    const inW = inRange.filter(t => t.day >= w * 7 && t.day < (w + 1) * 7);
    if (!inW.length) continue;
    const tiers = {};
    inW.forEach(t => { tiers[t.tier] = (tiers[t.tier] || 0) + t.pnl; });
    weeks.push({ label: dstr(Math.max(from, w * 7)), tiers, total: inW.filter(t => onT(t.tier)).reduce((a, t) => a + t.pnl, 0) });
  }
  const zero = 74;
  const span = Math.max.apply(null, weeks.map(w => Math.max(
    [1, 2, 3, 4, 5].filter(t => onT(t) && w.tiers[t] > 0).reduce((a, t) => a + w.tiers[t], 0),
    -[1, 2, 3, 4, 5].filter(t => onT(t) && w.tiers[t] < 0).reduce((a, t) => a + w.tiers[t], 0)))) || 1;
  const unit = 56 / span;
  const bw = weeks.length ? CW / weeks.length * 0.56 : 10;
  const gapW = weeks.length ? (CW - weeks.length * bw) / (weeks.length + 1) : 0;
  const wRects = [];
  weeks.forEach((wk, i) => {
    const bx = gapW + i * (bw + gapW);
    let up = zero, dn = zero;
    [1, 2, 3, 4, 5].filter(t => wk.tiers[t]).forEach(t => {
      const v = wk.tiers[t], h = Math.abs(v) * unit;
      if (!onT(t)) return;
      let yy;
      if (v >= 0) { up -= h; yy = up; } else { yy = dn; dn += h; }
      wRects.push({ x: bx.toFixed(1), y: yy.toFixed(1), w: bw.toFixed(1), h: Math.max(1, h).toFixed(1), fill: TC(t), op: 0.7 });
    });
  });
  const selWeekly = weeks.reduce((a, w) => a + w.total, 0);
  const cWeek = { ...plot,
    title: 'Weekly P&L', val: aSigned(selWeekly), valC: selWeekly >= 0 ? C.green : C.red,
    grid: [zero - 56, zero + 28], areas: [], dots: [], rects: wRects,
    lines: [{ pts: '0,' + zero + ' ' + CW + ',' + zero, stroke: C.hard, w: 1.4, dash: '', op: 1 }],
    hasCols: true, colCount: weeks.length || 1,
    cols: weeks.map(wk => ({ label: wk.label, v: aSigned(wk.total), c: wk.total >= 0 ? C.green : C.red })),
    hitRects: weeks.map((wk, i) => Object.assign(
      { x: (gapW + i * (bw + gapW) - gapW / 2).toFixed(1), y: 0, w: (bw + gapW).toFixed(1), h: 150 },
      hit(3, gapW + i * (bw + gapW) + bw / 2, zero - 40, 'Week of ' + wk.label + ' · ' + aSigned(wk.total),
        [1, 2, 3, 4, 5].filter(t => wk.tiers[t] && onT(t)).map(t => 'T' + t + ' ' + aSigned(wk.tiers[t])).join(' · ') || 'no trades', wk.total >= 0 ? C.green : C.red))),
    cap: 'scale ±' + aMoney(span),
    note: sel.length ? 'Each bar stacks the picked tiers for that week.' : 'Each bar stacks all five tiers for that week.',
  };

  const buckets = [{ label: 'Cash', color: C.hard, amt: cashV, tier: null }]
    .concat(OPEN.slice().sort((a, b) => a.tier - b.tier).map(p => ({ label: 'T' + p.tier + ' ' + p.sym, color: TC(p.tier), amt: p.size, tier: p.tier })));
  const bTot = buckets.reduce((a, b) => a + b.amt, 0) || 1;
  let aAcc = 0;
  const aSegs = buckets.map(b => {
    const wPct = b.amt / bTot * 100;
    const mid = aAcc + wPct / 2;
    aAcc += wPct;
    return {
      w: wPct.toFixed(2) + '%', color: b.color,
      op: b.tier === null || onT(b.tier) ? 0.8 : 0.16,
      title: b.label + ' · $' + b.amt.toFixed(0),
      glowV: b.tier === null || onT(b.tier) ? glow(b.color, false) : 'none',
      onId: on(() => showTip({ i: 4, label: b.label + ' · $' + b.amt.toFixed(0), sub: wPct.toFixed(1) + '% of the book', l: mid.toFixed(2) + '%', t: '0%', c: b.color })),
      offId: on(() => hideTip()),
    };
  });
  const selDeployed = OPEN.filter(p => onT(p.tier)).reduce((a, p) => a + p.size, 0);
  const cAlloc = { ...plot,
    title: 'Allocation now', val: (selDeployed / bTot * 100).toFixed(0) + '% deployed', valC: C.text,
    hasPlot: false, hasStack: true, stack: aSegs,
    hasLegend: true,
    legend: buckets.map(b => lg(b.label, b.color, (b.amt / bTot * 100).toFixed(0) + '%',
      b.tier === null || onT(b.tier) ? C.text2 : C.muted, b.tier === null || onT(b.tier) ? 1 : 0.45)),
    cap: 'cash ' + (cashV / bTot * 100).toFixed(0) + '% · ' + OPEN.length + ' open',
    note: 'The book right now — cash plus every open position. Tiers you have not picked are dimmed.',
  };

  const regimeNames = ['trending bull', 'ranging', 'volatile'];
  const scope = LEDGER.filter(t => onT(t.tier));
  const rBars = regimeNames.map(name => {
    const ts = scope.filter(t => t.regime === name);
    const pct = ts.length ? Math.round(ts.filter(t => t.pnl > 0).length / ts.length * 100) : 0;
    const col = pct >= 60 ? C.green : pct >= 45 ? C.amber : C.red;
    return {
      label: name, v: ts.length ? pct + '%' : '—', sub: ts.length ? ts.length + ' trades' : 'no trades',
      w: (ts.length ? pct : 0) + '%', c: ts.length ? col : C.muted,
      glowV: ts.length ? glow(col, true) : 'none',
    };
  });
  const scWins = scope.filter(t => t.pnl > 0).length;
  const cRegime = { ...plot,
    title: 'Win rate by regime', val: scope.length ? Math.round(scWins / scope.length * 100) + '%' : '—', valC: C.text,
    hasPlot: false, hasBars: true, bars: rBars,
    cap: scope.length + ' trades',
    note: 'Win rate split by the market regime the agent recorded at entry' + (sel.length ? ', picked tiers only.' : '.'),
  };

  const stat = t => {
    const ts = LEDGER.filter(x => x.tier === t);
    const w = ts.filter(x => x.pnl > 0), l = ts.filter(x => x.pnl <= 0);
    const g = w.reduce((a, x) => a + x.pnl, 0), b = -l.reduce((a, x) => a + x.pnl, 0);
    const bys = {};
    ts.forEach(x => { bys[x.by] = (bys[x.by] || 0) + 1; });
    const topBy = Object.keys(bys).sort((a, b2) => bys[b2] - bys[a])[0] || '—';
    const openP = OPEN.filter(p => p.tier === t);
    const regBest = regimeNames.map(n => {
      const r = ts.filter(x => x.regime === n);
      return { n, pct: r.length ? Math.round(r.filter(x => x.pnl > 0).length / r.length * 100) : -1, k: r.length };
    }).sort((a, b2) => b2.pct - a.pct)[0];
    return {
      t, n: ts.length, net: ts.reduce((a, x) => a + x.pnl, 0),
      wr: ts.length ? Math.round(w.length / ts.length * 100) : 0, w: w.length, l: l.length,
      avgW: w.length ? g / w.length : 0, avgL: l.length ? b / l.length : 0,
      pf: b > 0 ? g / b : Infinity, topBy,
      best: ts.slice().sort((a, b2) => b2.pnl - a.pnl)[0], worst: ts.slice().sort((a, b2) => a.pnl - b2.pnl)[0],
      hold: ts.length ? ts.reduce((a, x) => a + hrsOf(x.held), 0) / ts.length : 0,
      openSize: openP.reduce((a, p) => a + p.size, 0), openSym: openP.map(p => p.sym).join(', ') || 'none',
      regBest,
    };
  };
  const stats = shown.map(stat);
  const wide = shown.length <= 3;
  const lng = t => wide ? t : '';
  const tint = i => TIERS[shown[i]].bg;
  const cellOf = (v, sub, c, w) => ({ v, sub: sub || '', c: c || C.text, w: w || 500 });
  const rows = [
    { k: 'Net realised', cells: stats.map(x => cellOf(aSigned(x.net), x.n + ' trades', x.net >= 0 ? C.green : C.red, 600)) },
    { k: 'Win rate', cells: stats.map(x => cellOf(x.wr + '%', x.w + 'W / ' + x.l + 'L')) },
    { k: 'Profit factor', cells: stats.map(x => cellOf(x.pf === Infinity ? '∞' : x.pf.toFixed(2), lng('gross win ÷ gross loss'), x.pf >= 1 ? C.green : C.red)) },
    { k: 'Avg win / loss', cells: stats.map(x => cellOf(aMoney(x.avgW) + ' / ' + aMoney(x.avgL), lng(x.avgW > x.avgL ? 'wins run bigger' : 'losses run bigger'))) },
    { k: 'Best · worst', cells: stats.map(x => cellOf(x.best ? aSigned(x.best.pnl) + ' · ' + aSigned(x.worst.pnl) : '—', lng(x.best ? x.best.sym + ' · ' + x.worst.sym : ''))) },
    { k: 'Avg hold', cells: stats.map(x => cellOf(x.hold.toFixed(1) + 'h', lng('mostly ' + x.topBy))) },
    { k: 'Best regime', cells: stats.map(x => cellOf(x.regBest.pct < 0 ? '—' : x.regBest.pct + '%', x.regBest.n + ' · ' + x.regBest.k + ' tr')) },
    { k: 'Open now', cells: stats.map(x => cellOf(x.openSize ? '$' + x.openSize : '—', x.openSym, x.openSize ? C.text : C.muted)) },
  ].map(row => ({ k: row.k, cells: row.cells.map((c2, i) => Object.assign({}, c2, { bg: tint(i) })) }));
  const worstT = stats.slice().sort((a, b) => a.net - b.net)[0];
  const bestT = stats.slice().sort((a, b) => b.net - a.net)[0];
  const aVerdict = sel.length === 1
    ? { tag: 'T' + stats[0].t + ' ' + (stats[0].net >= 0 ? 'carries' : 'drags'), bg: stats[0].net >= 0 ? C.greenBg : C.redBg, fg: stats[0].net >= 0 ? C.green : C.red,
        detail: stats[0].n + ' trades at ' + stats[0].wr + '% win, net ' + aSigned(stats[0].net) + (stats[0].net >= 0 ? ' — sized correctly.' : ' — raise its confidence gate in Loadout.') }
    : { tag: 'T' + bestT.t + ' > T' + worstT.t, bg: C.blueBg, fg: C.blue,
        detail: 'T' + bestT.t + ' returns ' + aSigned(bestT.net) + ' on ' + bestT.n + ' trades; T' + worstT.t + ' gives back ' + aSigned(worstT.net) + ' on ' + worstT.n + '. Gap is ' + aMoney(bestT.net - worstT.net) + '.' };

  const scoped = LEDGER.filter(t => onT(t.tier));
  const filtered = s.aFilter === 'All' ? scoped : s.aFilter === 'Wins' ? scoped.filter(t => t.pnl > 0) : scoped.filter(t => t.pnl < 0);
  const scopedNet = scoped.reduce((a, t) => a + t.pnl, 0);

  return {
    kpis: [
      { k: 'Book value', v: money2(bookV), c: C.text, sub: OPEN.length + ' open positions' },
      { k: 'Realised P&L', v: aSigned(realisedV), c: realisedV >= 0 ? C.green : C.red, sub: LEDGER.length + ' closed trades' },
      { k: 'Win rate', v: LEDGER.length ? Math.round(wins / LEDGER.length * 100) + '%' : '—', c: C.text, sub: wins + 'W / ' + (LEDGER.length - wins) + 'L' },
      { k: 'Profit factor', v: pf === Infinity ? '∞' : pf.toFixed(2), c: pf >= 1 ? C.green : C.red, sub: 'gross ' + aMoney(gross) + ' ÷ ' + aMoney(loss) },
      { k: 'Max drawdown', v: '−' + Math.abs(maxDD).toFixed(1) + '%', c: C.amber, sub: 'worst so far' },
    ],
    sel, shown, stats, rows, aVerdict, filtered, scopedNet,
    charts: [cEquity, cDraw, cTiers, cWeek, cAlloc, cRegime],
  };
}

function renderAnalytics() {
  const A = computeAnalytics();
  const s = S;
  const sel = A.sel;
  const TC = t => TIERS[t].color;

  const kpis = A.kpis.map(k => `
    <div style="background: var(--card); padding: 15px 18px; display: flex; flex-direction: column; gap: 4px">
      <span style="font-size: 9px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--muted)">${k.k}</span>
      <span style="font-size: 23px; font-weight: 600; font-variant-numeric: tabular-nums; color: ${k.c}">${k.v}</span>
      <span style="font-size: 9.5px; color: var(--dim)">${k.sub}</span>
    </div>`).join('');

  const chipDefs = [{ k: null, label: 'All tiers' }].concat([1, 2, 3, 4, 5].map(t => ({ k: t, label: TIERS[t].long })));
  const chips = chipDefs.map(c => {
    const active = c.k === null ? sel.length === 0 : sel.indexOf(c.k) >= 0;
    return `
    <button data-on="${on(() => pickTier(c.k))}" style="${btnMono()}font-size: 10.5px; display: flex; align-items: center; gap: 7px; padding: 5px 11px; border-radius: 2px; white-space: nowrap; border: 1px solid ${active ? (c.k === null ? C.blueBorder : TC(c.k)) : C.border}; background: ${active ? (c.k === null ? C.blueBg : TIERS[c.k].bg) : 'transparent'}; color: ${active ? (c.k === null ? C.blue : TIERS[c.k].fg) : C.dim}; font-weight: ${active ? 600 : 400}; opacity: ${c.k !== null && !active && sel.length >= 3 ? 0.55 : 1}; cursor: pointer; transition: all 120ms ease">
      <span style="width: 8px; height: 8px; background: ${c.k === null ? C.hard : TC(c.k)}; flex: none"></span>${c.label}
    </button>`;
  }).join('');
  const kp = infoOf('picker');
  const pickerHint = sel.length === 0 ? 'Every chart shows the whole book. Pick up to three tiers to drill in or compare.'
    : sel.length === 1 ? 'Charts and trades scoped to ' + TIERS[sel[0]].long + '. Pick another to compare.'
    : 'Comparing ' + sel.map(t => 'T' + t).join(' vs ') + ' · click a chip to drop it.';

  const rangeBtns = ['7D', '30D', '90D', 'ALL'].map(r => `
    <button data-on="${on(() => setState({ aRange: r }))}" style="${btnMono()}font-size: 10px; padding: 5px 10px; border-radius: 2px; border: 1px solid ${s.aRange === r ? C.blueBorder : C.border}; background: ${s.aRange === r ? C.blueBg : 'transparent'}; color: ${s.aRange === r ? C.blue : C.dim}; font-weight: ${s.aRange === r ? 600 : 400}; cursor: pointer">${r}</button>`).join('');

  const chartCards = A.charts.map((c, i) => {
    const ki = infoOf('chart' + i);
    const hasTip = !!(s.tip && s.tip.i === i);
    const tip = hasTip ? s.tip : null;
    const tipHtml = t => hasTip ? `
      <div style="position: absolute; left: ${tip.l}; top: ${t === 'stack' ? '0' : tip.t}; transform: translate(-50%, ${t === 'stack' ? '-108%' : '-128%'}); z-index: 25; pointer-events: none; background: var(--card); border: 1px solid var(--hard); border-radius: 2px; box-shadow: 0 6px 18px rgba(20,23,29,0.18); padding: 6px 9px; display: flex; flex-direction: column; gap: 1px; white-space: nowrap">
        <span style="font-size: 11px; font-weight: 600; color: ${tip.c}">${esc(tip.label)}</span>
        <span style="font-size: 10px; color: var(--dim)">${esc(tip.sub)}</span>
      </div>` : '';
    return `
    <div style="background: var(--card); padding: 16px 22px 14px; display: flex; flex-direction: column; gap: 11px; min-width: 0; position: relative">
      <div style="display: flex; align-items: baseline; gap: 8px">
        <span style="font-size: 9px; letter-spacing: 0.13em; text-transform: uppercase; color: var(--muted)">${esc(c.title)}</span>
        <span style="flex: 1"></span>
        <span style="font-size: 15px; font-weight: 600; font-variant-numeric: tabular-nums; color: ${c.valC}">${c.val}</span>
      </div>
      ${c.hasPlot ? `
      <div style="display: flex; flex-direction: column; gap: 6px; position: relative">
        <svg viewBox="0 0 400 150" style="width: 100%; height: auto; aspect-ratio: 400 / 150; display: block">
          ${c.grid.map(g => `<line x1="0" y1="${g}" x2="400" y2="${g}" style="stroke: var(--line)"></line>`).join('')}
          ${c.areas.map(a => `<path d="${a.d}" fill="${a.fill}" opacity="${a.op}"></path>`).join('')}
          ${c.rects.map(r => `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="${r.fill}" opacity="${r.op}"></rect>`).join('')}
          ${c.lines.map(l => `<polyline points="${l.pts}" fill="none" stroke="${l.stroke}" stroke-width="${l.w}" stroke-dasharray="${l.dash}" opacity="${l.op}" stroke-linejoin="round"></polyline>`).join('')}
          ${c.dots.map(dd => `<circle cx="${dd.x}" cy="${dd.y}" r="${dd.r}" fill="${dd.fill}" opacity="${dd.op}"></circle>`).join('')}
          ${c.hitRects.map(h => `<rect x="${h.x}" y="${h.y}" width="${h.w}" height="${h.h}" fill="transparent" style="cursor: crosshair" data-enter="${h.onId}" data-leave="${h.offId}"></rect>`).join('')}
          ${c.hitLines.map(h => `<polyline points="${h.pts}" fill="none" stroke="transparent" stroke-width="14" style="cursor: crosshair" data-enter="${h.onId}" data-leave="${h.offId}"></polyline>`).join('')}
          ${c.hitDots.map(h => `<circle cx="${h.x}" cy="${h.y}" r="9" fill="transparent" style="cursor: crosshair" data-enter="${h.onId}" data-leave="${h.offId}"></circle>`).join('')}
        </svg>
        ${tipHtml('plot')}
        ${c.hasCols ? `
        <div style="display: grid; grid-template-columns: repeat(${c.colCount}, minmax(0, 1fr)); gap: 4px">
          ${c.cols.map(col => `
          <div style="display: flex; flex-direction: column; align-items: center; gap: 1px">
            <span style="font-size: 10.5px; font-weight: 600; font-variant-numeric: tabular-nums; color: ${col.c}">${col.v}</span>
            <span style="font-size: 9px; color: var(--muted); font-variant-numeric: tabular-nums">${col.label}</span>
          </div>`).join('')}
        </div>` : ''}
      </div>` : ''}
      ${c.hasStack ? `
      <div style="display: flex; gap: 2px; height: 46px; padding: 2px 0; position: relative">
        ${c.stack.map(sg => `<div data-enter="${sg.onId}" data-leave="${sg.offId}" title="${esc(sg.title)}" style="width: ${sg.w}; background: ${sg.color}; opacity: ${sg.op}; box-shadow: ${sg.glowV}; cursor: crosshair; transition: opacity 120ms ease"></div>`).join('')}
        ${tipHtml('stack')}
      </div>` : ''}
      ${c.hasBars ? `
      <div style="display: flex; flex-direction: column; gap: 11px; padding: 2px 0 4px">
        ${c.bars.map(b => `
        <div style="display: flex; flex-direction: column; gap: 5px">
          <div style="display: flex; align-items: baseline; gap: 10px">
            <span style="font-family: 'Instrument Sans', sans-serif; font-size: 12.5px; color: var(--text2)">${b.label}</span>
            <span style="flex: 1"></span>
            <span style="font-size: 12.5px; font-weight: 600; font-variant-numeric: tabular-nums; color: ${b.c}">${b.v}</span>
            <span style="font-size: 10px; color: var(--muted); font-variant-numeric: tabular-nums">${b.sub}</span>
          </div>
          <div style="height: 9px; background: var(--line); overflow: clip; box-shadow: inset 0 1px 2px rgba(0,0,0,0.12)">
            <div style="height: 100%; width: ${b.w}; background: ${b.c}; opacity: 0.82; box-shadow: ${b.glowV}; transition: width 200ms ease"></div>
          </div>
        </div>`).join('')}
      </div>` : ''}
      ${c.hasLegend ? `
      <div style="display: flex; flex-wrap: wrap; gap: 5px 6px">
        ${c.legend.map(l => `
        <span style="display: inline-flex; align-items: center; gap: 6px; font-size: 10.5px; white-space: nowrap; border: 1px solid var(--border); border-radius: 2px; padding: 2px 7px; opacity: ${l.op}">
          <span style="width: 8px; height: 8px; background: ${l.color}; flex: none"></span>
          <span style="color: var(--dim)">${l.label}</span>
          <span style="font-weight: 600; font-variant-numeric: tabular-nums; color: ${l.valC}">${l.val}</span>
        </span>`).join('')}
      </div>` : ''}
      <div style="display: flex; align-items: center; gap: 8px; margin-top: auto; padding-top: 2px">
        ${infoDot(ki)}
        <span style="flex: 1"></span>
        <span style="font-size: 9.5px; color: var(--muted); font-variant-numeric: tabular-nums">${esc(c.cap)}</span>
      </div>
      ${ki.open ? `<div style="position: absolute; left: 18px; bottom: 34px; z-index: 30; width: 260px; background: var(--card); border: 1px solid var(--hard); border-radius: 2px; box-shadow: 0 10px 28px rgba(20,23,29,0.18); padding: 10px 12px; font-family: 'Instrument Sans', sans-serif; font-size: 12px; line-height: 1.5; color: var(--text2); text-wrap: pretty">${esc(c.note)}</div>` : ''}
    </div>`;
  }).join('');

  const compareCols = '104px repeat(' + A.shown.length + ', minmax(0, 1fr))';
  const kcm = infoOf('compare');
  const compareTitle = sel.length > 1 ? 'Tier comparison' : sel.length === 1 ? TIERS[sel[0]].long : 'Tier scorecard';
  const compareSub = sel.length ? 'Whole history, not the selected range.' : 'All five tiers side by side — pick chips above to narrow it down.';
  const heads = A.stats.map(x => `
    <div style="display: flex; align-items: center; gap: 8px; padding: 7px 10px; background: ${TIERS[x.t].bg}; border-bottom: 2px solid ${TC(x.t)}">
      <span style="width: 9px; height: 9px; background: ${TC(x.t)}; flex: none"></span>
      <span style="font-size: 12px; font-weight: 700; color: ${TIERS[x.t].fg}">T${x.t}</span>
      <span style="font-family: 'Instrument Sans', sans-serif; font-size: 11.5px; color: ${TIERS[x.t].fg}; opacity: 0.72; overflow: hidden; text-overflow: ellipsis; white-space: nowrap">${TIERS[x.t].long.split('· ')[1] || ''}</span>
    </div>`).join('');
  const compareRows = A.rows.map(r => `
    <div style="display: grid; grid-template-columns: ${compareCols}; gap: 0 6px; align-items: stretch">
      <div style="font-size: 9.5px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); display: flex; align-items: center; padding: 9px 0; border-bottom: 1px solid var(--line)">${r.k}</div>
      ${r.cells.map(cc => `
      <div style="display: flex; align-items: center; gap: 9px; min-width: 0; padding: 9px 10px; background: ${cc.bg}">
        <span style="font-size: 13px; font-variant-numeric: tabular-nums; white-space: nowrap; font-weight: ${cc.w}; color: ${cc.c}">${cc.v}</span>
        <span style="font-family: 'Instrument Sans', sans-serif; font-size: 11.5px; color: var(--dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap">${cc.sub}</span>
      </div>`).join('')}
    </div>`).join('');

  const filterBtns = ['All', 'Wins', 'Losses'].map(fl => `
    <button data-on="${on(() => setState({ aFilter: fl }))}" style="${btnMono()}font-size: 10px; padding: 5px 11px; border-radius: 2px; border: 1px solid ${s.aFilter === fl ? C.blueBorder : C.border}; background: ${s.aFilter === fl ? C.blueBg : 'transparent'}; color: ${s.aFilter === fl ? C.blue : C.dim}; cursor: pointer">${fl}</button>`).join('');

  const tradeRows = A.filtered.slice().reverse().map(t => `
    <div style="display: grid; grid-template-columns: 88px 1.05fr 0.85fr 0.85fr 0.62fr 0.78fr 0.66fr 0.95fr; gap: 0 12px; align-items: center; font-size: 11.5px; padding: 11px 0; border-bottom: 1px solid var(--line)">
      <div style="color: var(--dim); font-variant-numeric: tabular-nums">${t.date}/26</div>
      <div style="display: flex; align-items: center; gap: 7px">
        <span style="font-size: 8px; font-weight: 700; padding: 1px 5px; background: ${TIERS[t.tier].bg}; color: ${TIERS[t.tier].fg}">T${t.tier}</span>
        <span style="font-weight: 600">${esc(t.sym)}</span>
      </div>
      <div style="text-align: right; font-variant-numeric: tabular-nums; color: var(--dim)">${aPx(t.entry)}</div>
      <div style="text-align: right; font-variant-numeric: tabular-nums; color: var(--dim)">${aPx(t.exit)}</div>
      <div style="text-align: right; font-variant-numeric: tabular-nums; color: var(--dim)">${esc(t.held)}</div>
      <div style="text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; color: ${t.pnl >= 0 ? C.green : C.red}">${t.pnl >= 0 ? '▲' : '▼'} ${aMoney(t.pnl)}</div>
      <div style="text-align: right; font-variant-numeric: tabular-nums; color: ${t.pnl >= 0 ? C.green : C.red}; opacity: 0.82">${(t.pnl >= 0 ? '+' : '−') + Math.abs(t.pnl / t.size * 100).toFixed(1)}%</div>
      <div style="font-family: 'Instrument Sans', sans-serif; font-size: 12px; color: var(--dim)">${esc(t.by)}</div>
    </div>`).join('');

  return `
  <div data-screen-label="Analytics" style="display: flex; flex-direction: column">
    <div style="display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 1px; background: var(--border); border-bottom: 1px solid var(--border)">${kpis}</div>
    <div style="display: flex; align-items: center; flex-wrap: wrap; gap: 10px 14px; padding: 11px 20px; background: var(--rail); border-bottom: 1px solid var(--border)">
      <span style="font-size: 9px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--muted)">Tier picker</span>
      <div style="display: flex; gap: 4px">${chips}</div>
      <span style="position: relative; display: inline-flex; align-items: center">
        ${infoDot(kp)}
        ${kp.open ? `<span style="position: absolute; left: 0; top: 22px; z-index: 40; width: 280px; background: var(--card); border: 1px solid var(--hard); border-radius: 2px; box-shadow: 0 10px 28px rgba(20,23,29,0.18); padding: 10px 12px; font-family: 'Instrument Sans', sans-serif; font-size: 12px; line-height: 1.5; color: var(--text2); text-wrap: pretty">${esc(pickerHint)}</span>` : ''}
      </span>
      <span style="flex: 1"></span>
      <div style="display: flex; gap: 4px">${rangeBtns}</div>
    </div>
    <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1px; background: var(--border); border-bottom: 1px solid var(--border)">${chartCards}</div>
    <div style="padding: 18px 20px 20px; display: flex; flex-direction: column; gap: 12px; border-bottom: 1px solid var(--border)">
      <div style="display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap">
        <span style="font-size: 9px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--muted)">${compareTitle}</span>
        <span style="position: relative; display: inline-flex; align-items: center">
          ${infoDot(kcm)}
          ${kcm.open ? `<span style="position: absolute; left: 0; top: 22px; z-index: 40; width: 280px; background: var(--card); border: 1px solid var(--hard); border-radius: 2px; box-shadow: 0 10px 28px rgba(20,23,29,0.18); padding: 10px 12px; font-family: 'Instrument Sans', sans-serif; font-size: 12px; line-height: 1.5; color: var(--text2); text-wrap: pretty">${compareSub}</span>` : ''}
        </span>
      </div>
      <div style="display: grid; grid-template-columns: ${compareCols}; gap: 0 6px; align-items: end"><div></div>${heads}</div>
      ${compareRows}
      <div style="display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; font-family: 'Instrument Sans', sans-serif; font-size: 13px; line-height: 1.6; color: var(--dim); padding-top: 2px">
        <span style="background: ${A.aVerdict.bg}; color: ${A.aVerdict.fg}; font-weight: 600; padding: 2px 7px; border-radius: 2px; ${btnMono()}font-size: 11px">${A.aVerdict.tag}</span>
        <span>${A.aVerdict.detail}</span>
      </div>
    </div>
    <div style="padding: 18px 20px 26px; display: flex; flex-direction: column; gap: 10px">
      <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap">
        <span style="font-size: 9px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--muted)">Closed trades</span>
        <span style="font-size: 10.5px; color: var(--dim)">${A.filtered.length} trades · net ${aSigned(A.scopedNet)}${sel.length ? ' · ' + sel.map(t => 'T' + t).join(', ') : ' · all tiers'}</span>
        <span style="flex: 1"></span>
        <div style="display: flex; gap: 4px">${filterBtns}</div>
      </div>
      <div style="display: grid; grid-template-columns: 88px 1.05fr 0.85fr 0.85fr 0.62fr 0.78fr 0.66fr 0.95fr; gap: 0 12px; font-size: 9px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); padding-bottom: 8px; border-bottom: 1px solid var(--border)">
        <div>Closed</div><div>Position</div><div style="text-align: right">Entry</div><div style="text-align: right">Exit</div><div style="text-align: right">Held</div><div style="text-align: right">P&amp;L</div><div style="text-align: right">%</div><div>Closed by</div>
      </div>
      ${tradeRows}
    </div>
  </div>`;
}

/* ---------------- render: Config (Loadout) page ---------------- */
function renderConfig() {
  const d = D();
  const s = S;
  const pal = S.themeKey.split('-')[0];
  const mode = THEMES[S.themeKey].mode;
  const stagedN = Object.keys(s.staged).length;
  const hasStaged = stagedN > 0;

  const presets = PRESETS.map(p => {
    const active = Object.keys(p.values).every(k => (s.staged[k] != null ? s.staged[k] : appliedParams()[k]) === p.values[k]);
    const loadId = on(() => {
      const staged2 = Object.assign({}, S.staged);
      Object.keys(p.values).forEach(k => {
        if (p.values[k] === appliedParams()[k]) delete staged2[k]; else staged2[k] = p.values[k];
      });
      S.staged = staged2;
      render();
      toast('staged', p.name + ' loadout staged — review and apply', C.blue, C.blueBorder);
    });
    return `
    <button data-on="${loadId}" class="hov-hard press" style="text-align: left; ${btnMono()}display: flex; align-items: center; gap: 12px; background: ${active ? C.blueBg : C.panel}; border: 1px solid ${active ? C.blueBorder : C.border}; border-left: 3px solid ${active ? C.blue : C.muted}; border-radius: 2px; padding: 10px 12px; cursor: pointer; box-shadow: 0 2px 0 var(--border)">
      <div style="display: flex; flex-direction: column; gap: 3px; min-width: 0; flex: 1">
        <span style="font-size: 11.5px; font-weight: 700; letter-spacing: 0.08em; color: ${active ? C.blue : C.text}">${p.name}</span>
        <span style="font-family: 'Instrument Sans', sans-serif; font-size: 11.5px; color: var(--dim); line-height: 1.4">${p.desc}</span>
      </div>
      <span style="font-size: 9.5px; letter-spacing: 0.1em; color: ${active ? C.blue : C.muted}; flex: none">${active ? 'ACTIVE' : 'LOAD ▸'}</span>
    </button>`;
  }).join('');

  const groups = PARAM_DEFS.map((g, gi) => {
    const rowsHtml = g.rows.map(r => {
      const staged = s.staged[r.key] != null;
      const value = staged ? s.staged[r.key] : appliedParams()[r.key];
      const filled = Math.max(1, Math.round((value - r.min) / (r.max - r.min) * PIPS));
      const applied = Math.max(1, Math.round((appliedParams()[r.key] - r.min) / (r.max - r.min) * PIPS));
      const pips = Array.from({ length: PIPS }, (_, i) => {
        const lit = i < filled;
        const tone = staged ? C.amber : C.blue;
        return `<div data-on="${on(() => stage(r.key, pipValue(r, i)))}" style="flex: 1; height: 16px; background: ${lit ? tone : C.line}; border-bottom: 2px solid ${staged && i === applied - 1 ? C.amber : 'transparent'}; box-shadow: ${lit ? glow(tone, i === filled - 1) : 'none'}; cursor: pointer; transition: background 90ms linear, box-shadow 140ms ease"></div>`;
      }).join('');
      return `
      <div style="display: flex; flex-direction: column; gap: 7px; position: relative; border: ${g.wide ? '1px solid ' + C.border : 'none'}; border-radius: 2px; padding: ${g.wide ? '11px 13px 12px' : '0'}">
        <div style="display: flex; align-items: baseline; gap: 7px">
          <span style="font-family: 'Instrument Sans', sans-serif; font-size: 12.5px; color: var(--text2)">${r.label}</span>
          <span data-enter="${on(() => queueHelp(r.key))}" data-leave="${on(cancelHelp)}" style="font-size: 9px; font-weight: 700; width: 14px; height: 14px; border-radius: 50%; border: 1px solid var(--hard); color: var(--muted); display: inline-flex; align-items: center; justify-content: center; cursor: help; flex: none">i</span>
          <span style="flex: 1"></span>
          <span style="font-size: 12.5px; font-weight: 700; font-variant-numeric: tabular-nums; letter-spacing: 0.04em; color: ${staged ? C.blue : C.text}; background: var(--rail); border: 1px solid var(--border); border-radius: 2px; padding: 2px 8px; min-width: 62px; text-align: right; box-shadow: inset 0 1px 2px rgba(0,0,0,0.08), ${glow(staged ? C.amber : C.blue, false)}">${fmtVal(r.fmt, value)}</span>
        </div>
        <div style="display: flex; align-items: center; gap: 9px">
          <button data-on="${on(() => nudge(r, -1))}" class="hov-accent press" style="${btnMono()}font-size: 13px; font-weight: 700; line-height: 1; width: 22px; height: 22px; border-radius: 50%; border: 1px solid var(--hard); background: var(--card); color: ${staged ? C.blue : C.dim}; cursor: pointer; flex: none; box-shadow: 0 2px 0 var(--border)">−</button>
          <div style="flex: 1; display: flex; gap: 2px; min-width: 0; padding: 3px; border: 1px solid var(--border); border-radius: 2px; background: var(--rail); box-shadow: inset 0 1px 3px rgba(0,0,0,0.10)">${pips}</div>
          <button data-on="${on(() => nudge(r, 1))}" class="hov-accent press" style="${btnMono()}font-size: 13px; font-weight: 700; line-height: 1; width: 22px; height: 22px; border-radius: 50%; border: 1px solid var(--hard); background: var(--card); color: ${staged ? C.blue : C.dim}; cursor: pointer; flex: none; box-shadow: 0 2px 0 var(--border)">+</button>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 9.5px; color: var(--muted)"><span>${fmtVal(r.fmt, r.min)}</span><span>${fmtVal(r.fmt, r.max)}</span></div>
        ${s.helpKey === r.key ? `<div style="position: absolute; left: 0; top: -8px; transform: translateY(-100%); z-index: 20; width: 290px; background: var(--card); border: 1px solid var(--hard); border-radius: 2px; box-shadow: 0 10px 28px rgba(20,23,29,0.16); padding: 10px 12px; font-family: 'Instrument Sans', sans-serif; font-size: 12px; line-height: 1.5; color: var(--text2); text-wrap: pretty">${esc(r.help)}</div>` : ''}
      </div>`;
    }).join('');
    return `
    <div style="grid-column: ${g.wide ? '1 / -1' : 'auto'}; background: var(--card); padding: 16px 20px 18px; display: flex; flex-direction: column; gap: 15px; min-width: 0">
      <div style="display: flex; align-items: baseline; gap: 9px">
        <span style="${btnMono()}font-size: 10px; font-weight: 700; color: var(--muted)">0${gi + 2}</span>
        <span style="font-size: 9.5px; letter-spacing: 0.15em; text-transform: uppercase; white-space: nowrap; color: var(--text2)">${g.group}</span>
        <span style="flex: 1"></span>
        <span style="font-size: 10px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap">${g.note}</span>
      </div>
      <div style="display: grid; grid-template-columns: ${g.wide ? 'repeat(auto-fit, minmax(300px, 1fr))' : '1fr'}; gap: 15px 22px">${rowsHtml}</div>
    </div>`;
  }).join('');

  const themeTiles = PALETTES.map(k => {
    const t = THEMES[k + '-' + mode];
    const active = pal === k;
    return `
    <button data-on="${on(() => setTheme(k + '-' + mode))}" class="hov-hard press" style="display: flex; flex-direction: column; gap: 7px; align-items: stretch; background: ${active ? C.blueBg : C.panel}; border: 1px solid ${active ? C.blue : C.border}; border-radius: 2px; padding: 8px; cursor: pointer; box-shadow: 0 2px 0 var(--border)">
      <div style="display: flex; gap: 2px; height: 16px">
        ${[t.accent, t.pos, t.amber, t.neg].map(c => `<div style="flex: 1; background: ${c}"></div>`).join('')}
      </div>
      <span style="${btnMono()}font-size: 9.5px; letter-spacing: 0.06em; color: ${active ? C.blue : C.dim}; text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap">${t.name}</span>
    </button>`;
  }).join('');

  const modeTiles = [['light', '☀ LIGHT'], ['dark', '☾ DARK']].map(([m, label]) => `
    <button data-on="${on(() => setTheme(pal + '-' + m))}" class="press" style="flex: 1; ${btnMono()}font-size: 10.5px; letter-spacing: 0.08em; padding: 7px 0; border-radius: 2px; border: 1px solid ${mode === m ? C.blue : C.border}; background: ${mode === m ? C.blueBg : C.panel}; color: ${mode === m ? C.blue : C.dim}; cursor: pointer; box-shadow: 0 2px 0 var(--border)">${label}</button>`).join('');

  const assetGroups = [2, 3, 4, 5].map(t => {
    const rows = (d.assets[t] || []).map(sym => `
      <div style="display: flex; align-items: center; gap: 8px; border: 1px solid var(--border); background: var(--rail); border-radius: 2px; padding: 5px 7px 5px 9px">
        <span style="font-size: 11.5px; font-weight: 600">${esc(sym)}</span>
        <span style="font-size: 10px; color: var(--muted)">${d.directives[sym] ? d.directives[sym].dir.toLowerCase() : 'watch'}</span>
        <button data-on="${on(() => rosterOp('remove', t, sym))}" class="hov-neg" style="${btnMono()}font-size: 10px; background: none; border: none; color: var(--muted); cursor: pointer; padding: 0 2px">×</button>
      </div>`).join('');
    return `
    <div style="display: flex; flex-direction: column; gap: 9px; border: 1px solid var(--border); border-top: 2px solid ${TIERS[t].color}; border-radius: 2px; padding: 11px 12px 12px">
      <div style="display: flex; align-items: center; gap: 9px">
        <span style="font-size: 9.5px; font-weight: 700; letter-spacing: 0.1em; color: ${TIERS[t].color}">${TIERS[t].tag}</span>
        <span style="flex: 1"></span>
        <span style="font-size: 10px; color: var(--muted)">${(d.assets[t] || []).length + ((d.assets[t] || []).length === 1 ? ' asset' : ' assets')}</span>
      </div>
      <div style="display: flex; flex-wrap: wrap; gap: 6px">
        ${rows}
        <div style="display: flex; align-items: center; gap: 6px; border: 1px dashed var(--hard); border-radius: 2px; padding: 4px 8px">
          <input type="text" placeholder="+ SLOT" value="${esc(S.drafts[t] || '')}" data-input="${on((e, el) => { S.drafts[t] = el.value.toUpperCase(); })}" style="font-size: 11px; width: 66px; border: none; outline: none; background: none; color: var(--text); text-transform: uppercase">
          <button data-on="${on(() => { const v = (S.drafts[t] || '').trim().toUpperCase(); if (!v) return; S.drafts[t] = ''; rosterOp('add', t, v); })}" style="${btnMono()}font-size: 10px; background: none; border: none; color: var(--accent); cursor: pointer">add</button>
        </div>
      </div>
    </div>`;
  }).join('');

  const rosterCount = [2, 3, 4, 5].reduce((a, t) => a + (d.assets[t] || []).length, 0);

  const diffs = Object.keys(s.staged).map(k => {
    const def = PARAM_DEFS.flatMap(g => g.rows).find(r => r.key === k);
    if (!def) return '';
    return `
    <span style="display: inline-flex; align-items: center; gap: 6px; font-size: 11px; background: var(--card); border: 1px solid var(--accentEdge); border-radius: 2px; padding: 3px 8px">
      <span style="color: var(--bodyText); white-space: nowrap">${def.label}</span>
      <span style="color: var(--muted); text-decoration: line-through; font-variant-numeric: tabular-nums">${fmtVal(def.fmt, appliedParams()[k])}</span>
      <span style="color: var(--muted)">→</span>
      <span style="font-weight: 600; font-variant-numeric: tabular-nums; color: var(--accent)">${fmtVal(def.fmt, s.staged[k])}</span>
    </span>`;
  }).join('');

  return `
  <div data-screen-label="Config" style="display: flex; flex-direction: column; padding-bottom: 30px">
    <div style="display: flex; align-items: flex-end; gap: 16px; flex-wrap: wrap; padding: 26px 30px 16px">
      <div style="display: flex; flex-direction: column; gap: 5px">
        <div style="font-family: 'Instrument Sans', sans-serif; font-size: 22px; font-weight: 600">Loadout</div>
        <div style="font-family: 'Instrument Sans', sans-serif; font-size: 13px; color: var(--dim)">Eight modules. Edits are staged — nothing reaches the agent until you apply.</div>
      </div>
      <span style="flex: 1"></span>
      <div style="display: flex; align-items: center; gap: 10px">
        <button data-on="${on(() => setState({ appendix: true }))}" class="hov-accent-bg" style="${btnMono()}font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; white-space: nowrap; color: var(--accent); background: var(--card); border: 1px solid var(--accentEdge); border-radius: 2px; padding: 5px 11px; cursor: pointer">Player’s guide</button>
        <span style="${btnMono()}font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; white-space: nowrap; padding: 5px 10px; border-radius: 2px; background: ${hasStaged ? C.amberBg : C.greenBg}; color: ${hasStaged ? C.amber : C.green}; border: 1px solid ${hasStaged ? C.amberEdge : C.greenBorder}">${hasStaged ? stagedN + ' UNSAVED' : 'ALL SYNCED'}</span>
        ${hasStaged ? `
        <div style="display: flex; align-items: center; gap: 8px">
          <button data-on="${on(() => setState({ staged: {} }))}" class="hov-text" style="${btnMono()}font-size: 11px; color: var(--dim); background: var(--card); border: 1px solid var(--hard); border-radius: 2px; padding: 7px 14px; cursor: pointer">Discard</button>
          <button data-on="${on(applyParamsNow)}" style="${btnMono()}font-size: 11px; font-weight: 700; letter-spacing: 0.06em; white-space: nowrap; color: var(--onAccent); background: var(--accent); border: 1px solid var(--accent); border-radius: 2px; padding: 7px 16px; cursor: pointer">APPLY ${stagedN}${stagedN === 1 ? ' CHANGE' : ' CHANGES'}</button>
        </div>` : ''}
      </div>
    </div>
    ${hasStaged ? `
    <div style="margin: 0 30px 16px; display: flex; flex-wrap: wrap; align-items: center; gap: 8px 10px; background: var(--accentBg); border: 1px solid var(--accentEdge); border-radius: 2px; padding: 10px 13px">
      <span style="font-size: 9px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--accent); flex: none">Staged</span>
      ${diffs}
    </div>` : ''}
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); gap: 1px; background: var(--border); border-top: 1px solid var(--border); border-bottom: 1px solid var(--border)">
      <div style="background: var(--card); padding: 16px 20px 18px; display: flex; flex-direction: column; gap: 13px; min-width: 0">
        <div style="display: flex; align-items: baseline; gap: 9px">
          <span style="${btnMono()}font-size: 10px; font-weight: 700; color: var(--muted)">01</span>
          <span style="font-size: 9.5px; letter-spacing: 0.15em; text-transform: uppercase; color: var(--text2)">Difficulty</span>
          <span style="flex: 1"></span>
          <span style="font-size: 10px; color: var(--muted)">stages a whole set</span>
        </div>
        ${presets}
      </div>
      ${groups}
      <div style="background: var(--card); padding: 16px 20px 18px; display: flex; flex-direction: column; gap: 13px; min-width: 0">
        <div style="display: flex; align-items: baseline; gap: 9px">
          <span style="${btnMono()}font-size: 10px; font-weight: 700; color: var(--muted)">07</span>
          <span style="font-size: 9.5px; letter-spacing: 0.15em; text-transform: uppercase; color: var(--text2)">Cabinet</span>
          <span style="flex: 1"></span>
          <span style="font-size: 10px; color: var(--muted)">applies instantly</span>
        </div>
        <div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 7px">${themeTiles}</div>
        <div style="display: flex; align-items: center; gap: 8px; padding-top: 2px">${modeTiles}</div>
        <div style="font-family: 'Instrument Sans', sans-serif; font-size: 11.5px; color: var(--dim); line-height: 1.45; text-wrap: pretty">${CABINET_NOTES[pal] || ''}</div>
      </div>
      <div style="grid-column: 1 / -1; background: var(--card); padding: 16px 20px 20px; display: flex; flex-direction: column; gap: 14px">
        <div style="display: flex; align-items: baseline; gap: 9px">
          <span style="${btnMono()}font-size: 10px; font-weight: 700; color: var(--muted)">08</span>
          <span style="font-size: 9.5px; letter-spacing: 0.15em; text-transform: uppercase; color: var(--text2)">Roster</span>
          <span style="flex: 1"></span>
          <span style="font-size: 10px; color: var(--muted)">${rosterCount} assets across four tiers · live on the next research cycle</span>
        </div>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 14px">${assetGroups}</div>
      </div>
    </div>
  </div>`;
}

/* ---------------- render: trade dock + overlays ---------------- */
function renderDock() {
  const d = D();
  const dark = S.themeKey.endsWith('dark');
  const asset = S.dockPair.split('/')[0];
  const a = parseFloat(S.dockAmount);
  const price = d.prices[asset];
  const dockLine = !S.dockOpen ? S.dockPair + ' · review step before anything executes'
    : !a ? 'enter an amount · review step before anything executes'
    : '≈ ' + (a / price).toFixed(price < 10 ? 2 : 4) + ' ' + asset + ' · ' + (a / book() * 100).toFixed(1) + '% of book';
  return `
  <div style="position: sticky; bottom: 0; z-index: 36; border-top: 1px solid var(--hard); border-radius: 0 0 9px 9px; background: var(--rail); box-shadow: 0 -6px 18px ${dark ? 'rgba(0,0,0,0.45)' : 'rgba(20,23,29,0.08)'}; padding: 10px 22px; display: flex; align-items: center; gap: 12px">
    <button data-on="${on(() => setState({ dockOpen: !S.dockOpen }))}" title="${S.dockOpen ? 'Collapse the manual trade controls' : 'Open the manual trade controls'}" class="hov-text" style="${btnMono()}font-size: 10px; display: flex; align-items: center; gap: 7px; color: var(--dim); background: var(--card); border: 1px solid var(--hard); border-radius: 2px; padding: 5px 9px; cursor: pointer; flex: none">
      <span style="font-size: 9px">${S.dockOpen ? '▾' : '▸'}</span>
      <span style="letter-spacing: 0.14em; text-transform: uppercase">Manual</span>
    </button>
    ${S.dockOpen ? `
    <select data-change="${on((e, el) => { S.dockPair = el.value; render(); })}" style="font-size: 11px; color: var(--text); background: var(--card); border: 1px solid var(--hard); border-radius: 2px; padding: 5px 8px; cursor: pointer">
      ${Object.keys(d.prices).map(k => `<option value="${k}/USDC" ${S.dockPair === k + '/USDC' ? 'selected' : ''}>${k}/USDC</option>`).join('')}
    </select>
    <input type="number" min="1" placeholder="$ amount" value="${esc(S.dockAmount)}" data-input="${on((e, el) => { S.dockAmount = el.value; const line = document.getElementById('dockLine'); if (line) { const av = parseFloat(el.value); line.textContent = !av ? 'enter an amount · review step before anything executes' : '≈ ' + (av / price).toFixed(price < 10 ? 2 : 4) + ' ' + asset + ' · ' + (av / book() * 100).toFixed(1) + '% of book'; } })}" style="font-size: 11px; color: var(--text); background: var(--card); border: 1px solid var(--hard); border-radius: 2px; padding: 5px 9px; width: 92px; outline: none">` : ''}
    <span id="dockLine" style="font-size: 9.5px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap">${dockLine}</span>
    <span style="flex: 1"></span>
    <button data-on="${on(() => openTrade('BUY'))}" class="hov-pos-bg" style="${btnMono()}font-size: 10.5px; font-weight: 700; color: var(--pos); background: var(--card); border: 1px solid var(--posEdge); border-radius: 2px; padding: 6px 16px; cursor: pointer">▲ BUY</button>
    <button data-on="${on(() => openTrade('SELL'))}" class="hov-neg-bg" style="${btnMono()}font-size: 10.5px; font-weight: 700; color: var(--neg); background: var(--card); border: 1px solid var(--negEdge); border-radius: 2px; padding: 6px 16px; cursor: pointer">▼ SELL</button>
  </div>`;
}

function renderToasts() {
  return `
  <div style="position: fixed; right: 20px; bottom: 66px; display: flex; flex-direction: column; gap: 8px; z-index: 40; align-items: flex-end">
    ${S.toasts.map(t => `
    <div style="background: var(--card); border: 1px solid ${t.border}; border-left: 3px solid ${t.accent}; border-radius: 2px; box-shadow: 0 10px 28px rgba(20,23,29,0.14); padding: 10px 14px; display: flex; align-items: center; gap: 10px">
      <span style="font-size: 11.5px; color: ${t.accent}; font-weight: 600">${esc(t.tag)}</span>
      <span style="font-family: 'Instrument Sans', sans-serif; font-size: 12.5px; color: var(--text15)">${esc(t.text)}</span>
    </div>`).join('')}
  </div>`;
}

function renderAppendix() {
  if (!S.appendix) return '';
  const sections = APPENDIX.map(sec => {
    const rows = sec.tierRows
      ? sec.tierRows.map(r => ({ term: TIERS[r.t].long, def: r.def, c: TIERS[r.t].fg }))
      : sec.rows.map(r => ({ term: r.term, def: r.def, c: C.text }));
    return `
    <div style="display: flex; flex-direction: column; gap: 11px">
      <div style="display: flex; align-items: baseline; gap: 10px; padding-bottom: 7px; border-bottom: 1px solid var(--border)">
        <span style="font-size: 9px; letter-spacing: 0.15em; text-transform: uppercase; color: var(--muted)">${sec.group}</span>
        <span style="font-family: 'Instrument Sans', sans-serif; font-size: 12px; color: var(--dim)">${sec.note}</span>
      </div>
      ${rows.map(row => `
      <div style="display: grid; grid-template-columns: 168px 1fr; gap: 4px 18px; align-items: baseline">
        <span style="font-size: 11.5px; font-weight: 600; color: ${row.c}">${row.term}</span>
        <span style="font-family: 'Instrument Sans', sans-serif; font-size: 12.5px; line-height: 1.55; color: var(--bodyText); text-wrap: pretty">${row.def}</span>
      </div>`).join('')}
    </div>`;
  }).join('');
  return `
  <div style="position: fixed; inset: 0; background: rgba(12,15,20,0.42); z-index: 60; display: flex; align-items: flex-start; justify-content: center; padding: 40px 20px; overflow: auto">
    <div style="width: 100%; max-width: 880px; background: var(--card); border: 1px solid var(--hard); border-radius: 4px; box-shadow: 0 24px 60px rgba(12,15,20,0.3); display: flex; flex-direction: column">
      <div style="display: flex; align-items: center; gap: 12px; padding: 16px 22px; background: var(--rail); border-bottom: 1px solid var(--border); border-radius: 3px 3px 0 0">
        <span style="font-family: 'Instrument Sans', sans-serif; font-size: 17px; font-weight: 600">Player’s guide — terms &amp; data</span>
        <span style="flex: 1"></span>
        <button data-on="${on(() => setState({ appendix: false }))}" class="hov-text" style="${btnMono()}font-size: 11px; color: var(--dim); background: var(--card); border: 1px solid var(--hard); border-radius: 2px; padding: 5px 11px; cursor: pointer">Close ✕</button>
      </div>
      <div style="padding: 20px 22px 26px; display: flex; flex-direction: column; gap: 22px">${sections}</div>
    </div>
  </div>`;
}

function renderChat() {
  if (!S.chatOpen) return '';
  const msgs = S.messages.map(m => `
    <div style="display: flex; flex-direction: column; gap: 6px; align-items: ${m.from === 'me' ? 'flex-end' : 'flex-start'}">
      <span style="font-size: 9px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted)">${m.from === 'me' ? 'You' : 'Agent'}</span>
      <div style="max-width: 86%; background: ${m.from === 'me' ? C.blueBg : C.panel}; border: 1px solid ${m.from === 'me' ? C.blueBorder : C.border}; border-radius: 3px; padding: 11px 13px; font-family: 'Instrument Sans', sans-serif; font-size: 13.5px; line-height: 1.55; color: var(--text); text-wrap: pretty">${esc(m.text)}</div>
      ${m.action ? `<button data-on="${on(() => runChatAction(m.action))}" class="hov-accent-bg" style="${btnMono()}font-size: 10.5px; font-weight: 600; background: var(--card); border: 1px solid var(--accentEdge); color: var(--accent); border-radius: 2px; padding: 6px 12px; cursor: pointer">${esc(m.action.label)} →</button>` : ''}
    </div>`).join('');
  const suggestions = ['Why did you buy AERO?', 'How am I doing?', 'Anything at risk?', 'Sell $80 of MORPHO'].map(t => `
    <button data-on="${on(() => { S.chatInput = t; sendChat(); })}" class="hov-accent" style="${btnMono()}font-size: 10px; background: var(--rail); border: 1px solid var(--border); color: var(--dim); border-radius: 12px; padding: 5px 11px; cursor: pointer">${t}</button>`).join('');
  return `
  <div style="position: fixed; top: 0; right: 0; bottom: 0; width: 400px; background: var(--card); border-left: 1px solid var(--hard); box-shadow: -18px 0 44px rgba(20,23,29,0.10); z-index: 50; display: flex; flex-direction: column">
    <div style="padding: 14px 18px; border-bottom: 1px solid var(--line); display: flex; align-items: center; gap: 10px">
      <span style="font-size: 9.5px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--muted)">Ask the agent</span>
      <span style="display: flex; align-items: center; gap: 5px; font-size: 10px; color: var(--pos)"><span style="width: 5px; height: 5px; border-radius: 50%; background: var(--pos)"></span>reading live state</span>
      <span style="flex: 1"></span>
      <button data-on="${on(() => setState({ chatOpen: false }))}" style="${btnMono()}font-size: 13px; background: none; border: none; color: var(--muted); cursor: pointer">×</button>
    </div>
    <div id="chatScroll" style="flex: 1; overflow-y: auto; padding: 18px; display: flex; flex-direction: column; gap: 14px">
      ${msgs}
      ${S.thinking ? `
      <div style="display: flex; align-items: center; gap: 7px; font-size: 11px; color: var(--muted)">
        <span style="width: 5px; height: 5px; border-radius: 50%; background: var(--muted)"></span>
        <span>reading positions, indicators and the last four cycles…</span>
      </div>` : ''}
    </div>
    <div style="padding: 12px 18px 8px; display: flex; flex-wrap: wrap; gap: 6px; border-top: 1px solid var(--line)">${suggestions}</div>
    <div style="padding: 8px 18px 18px; display: flex; align-items: flex-end; gap: 9px">
      <input id="chatInput" type="text" value="${esc(S.chatInput)}" data-input="${on((e, el) => { S.chatInput = el.value; })}" data-key="${on(e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); } })}" placeholder="Ask about a decision, or tell me what to do…" style="flex: 1; font-family: 'Instrument Sans', sans-serif; font-size: 13px; background: var(--card); border: 1px solid var(--hard); border-radius: 2px; padding: 10px 12px; color: var(--text); outline: none">
      <button data-on="${on(sendChat)}" style="${btnMono()}font-size: 11px; font-weight: 600; background: var(--accent); border: none; color: var(--onAccent); border-radius: 2px; padding: 10px 14px; cursor: pointer">Send</button>
    </div>
    <div style="padding: 0 18px 14px; font-size: 9.5px; color: var(--muted)">Anything that moves money still goes through the hold-to-confirm review.</div>
  </div>`;
}

function paletteResults() {
  const q = S.query.trim().toLowerCase();
  const go = tab => () => setState({ tab, palette: false });
  const d = D();
  const all = [
    { icon: '■', iconC: C.red, label: d && d.halted ? 'Resume trading' : 'Halt trading now', hint: 'immediate', action: () => { S.palette = false; toggleHalt(); } },
    { icon: '◷', iconC: C.amber, label: 'Halt for 1 hour', hint: 'auto-resume', action: () => { S.palette = false; doHalt('halt-hour'); } },
    { icon: '▲', iconC: C.green, label: 'Buy ' + S.dockPair, hint: 'opens review', action: () => { S.palette = false; openTrade('BUY'); } },
    { icon: '▼', iconC: C.red, label: 'Sell ' + S.dockPair, hint: 'opens review', action: () => { S.palette = false; openTrade('SELL'); } },
    ...positions().map(p => ({ icon: '✕', iconC: C.red, label: 'Close ' + p.asset, hint: pnlFmt(posPnl(p)), action: () => { S.palette = false; render(); closePos(p.id); } })),
    ...[1, 2, 3, 4, 5].map(t => ({ icon: '↻', iconC: C.blue, label: 'Re-research tier ' + t, hint: TIERS[t].short, action: () => { S.palette = false; render(); queueResearch(t); } })),
    { icon: '◧', iconC: C.muted, label: 'Go to Analytics', hint: 'view', action: go('analytics') },
    { icon: '◧', iconC: C.muted, label: 'Go to Journal', hint: 'view', action: go('journal') },
    { icon: '◧', iconC: C.muted, label: 'Go to Risk', hint: 'view', action: go('risk') },
    { icon: '⚙', iconC: C.muted, label: 'Go to Config', hint: 'params & assets', action: go('config') },
    { icon: '✎', iconC: C.blue, label: 'Ask the agent…', hint: 'chat', action: () => setState({ palette: false, chatOpen: true }) },
  ];
  return q ? all.filter(c => c.label.toLowerCase().includes(q)) : all;
}

function renderPalette() {
  if (!S.palette) return '';
  const results = paletteResults().slice(0, 7);
  return `
  <div data-on="${on(() => setState({ palette: false }))}" style="position: fixed; inset: 0; background: rgba(20,23,29,0.28); z-index: 60; display: flex; align-items: flex-start; justify-content: center; padding-top: 12vh">
    <div data-on="${on(e => e.stopPropagation())}" style="width: 480px; background: var(--card); border: 1px solid var(--hard); border-radius: 4px; box-shadow: 0 28px 70px rgba(20,23,29,0.28); overflow: hidden">
      <div style="padding: 13px 16px; border-bottom: 1px solid var(--line); display: flex; align-items: center; gap: 10px">
        <span style="color: var(--muted); font-size: 13px">›</span>
        <input id="paletteInput" type="text" value="${esc(S.query)}" data-input="${on((e, el) => { S.query = el.value; render(); })}" placeholder="Type a command…" style="flex: 1; font-size: 13px; border: none; outline: none; background: none; color: var(--text)">
      </div>
      ${results.map((c, i) => `
      <div data-on="${on(() => c.action())}" style="display: flex; align-items: center; gap: 12px; padding: 10px 16px; background: ${i === 0 ? C.panel : C.card}; cursor: pointer">
        <span style="width: 16px; text-align: center; color: ${c.iconC}; font-size: 11px">${c.icon}</span>
        <span style="font-size: 12.5px; color: var(--text15)">${esc(c.label)}</span>
        <span style="flex: 1"></span>
        <span style="font-size: 9.5px; color: var(--muted)">${esc(c.hint)}</span>
      </div>`).join('')}
      <div style="padding: 9px 16px; border-top: 1px solid var(--line); display: flex; gap: 14px; font-size: 9.5px; color: var(--muted)">
        <span>↵ run first result</span><span>esc close</span>
      </div>
    </div>
  </div>`;
}

function renderTradeModal() {
  const t = S.trade;
  if (!t) return '';
  const d = D();
  const p = params();
  const asset = t.pair.split('/')[0];
  const price = d.prices[asset];
  const dir = d.directives[asset];
  const conflict = t.side === 'BUY' && dir && (dir.dir === 'REDUCE' || dir.dir === 'EXIT' || dir.dir === 'HOLD');
  const after = cash() - (t.side === 'BUY' ? t.amount : -t.amount);
  const sideC = t.side === 'BUY' ? C.green : C.red;
  const rows = [
    { k: 'Est. fill', v: (t.amount / price).toFixed(price < 10 ? 2 : 4) + ' ' + asset, c: C.text2 },
    { k: 'Slippage cap', v: '0.5%', c: C.text2 },
    { k: 'Cash after', v: '$' + after.toFixed(0) + ' (' + (after / book() * 100).toFixed(0) + '%)', c: after < 200 ? C.amber : C.text2 },
    { k: 'Trades today', v: d.tradesToday + ' of ' + p.maxTrades, c: C.text2 },
    { k: 'Drawdown headroom', v: (p.drawdown - 2.1).toFixed(1) + '% to halt', c: C.amber },
  ];
  return `
  <div data-on="${on(() => setState({ trade: null, hold: 0 }))}" style="position: fixed; inset: 0; background: rgba(20,23,29,0.28); z-index: 70; display: flex; align-items: center; justify-content: center">
    <div data-on="${on(e => e.stopPropagation())}" style="width: 470px; background: var(--card); border: 1px solid var(--hard); border-radius: 4px; box-shadow: 0 28px 70px rgba(20,23,29,0.28); overflow: hidden">
      <div style="padding: 15px 18px; border-bottom: 1px solid var(--line); display: flex; align-items: center; gap: 10px">
        <span style="font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--dim)">Review before it executes</span>
        <span style="flex: 1"></span>
        <button data-on="${on(() => setState({ trade: null, hold: 0 }))}" style="${btnMono()}font-size: 11px; background: none; border: none; color: var(--muted); cursor: pointer">esc</button>
      </div>
      <div style="padding: 20px 18px; display: flex; flex-direction: column; gap: 18px">
        <div style="display: flex; align-items: baseline; gap: 10px">
          <span style="font-size: 12px; font-weight: 700; letter-spacing: 0.06em; color: ${sideC}">${t.side}</span>
          <span style="font-size: 22px; font-weight: 600">${esc(t.pair)}</span>
          <span style="flex: 1"></span>
          <span style="font-size: 12px; color: var(--dim); font-variant-numeric: tabular-nums">$${price.toLocaleString('en-US', { minimumFractionDigits: price < 10 ? 4 : 2, maximumFractionDigits: price < 10 ? 4 : 2 })}</span>
        </div>
        <div style="display: flex; flex-direction: column; gap: 9px">
          <div style="display: flex; align-items: baseline; gap: 8px">
            <span style="font-size: 9.5px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted)">Size</span>
            <span style="flex: 1"></span>
            <span style="font-size: 18px; font-weight: 600; font-variant-numeric: tabular-nums">$${t.amount}</span>
            <span style="font-size: 10.5px; color: var(--dim)">${(t.amount / book() * 100).toFixed(1)}% of book</span>
          </div>
          <input type="range" min="10" max="350" step="5" value="${t.amount}" data-input="${on((e, el) => { S.trade = Object.assign({}, S.trade, { amount: parseFloat(el.value) }); render(); })}" style="width: 100%; accent-color: var(--accent)">
          <div style="display: flex; justify-content: space-between; font-size: 9.5px; color: var(--muted)"><span>$10</span><span style="color: var(--neg)">risk cap $220</span><span>$350</span></div>
        </div>
        <div style="display: flex; flex-direction: column; gap: 8px; background: var(--rail); border: 1px solid var(--border); border-radius: 2px; padding: 13px 14px">
          ${rows.map(r => `
          <div style="display: flex; align-items: center; gap: 10px; font-size: 11.5px">
            <span style="color: var(--dim)">${r.k}</span>
            <span style="flex: 1"></span>
            <span style="color: ${r.c}; font-variant-numeric: tabular-nums">${r.v}</span>
          </div>`).join('')}
        </div>
        ${conflict ? `
        <div style="display: flex; align-items: center; gap: 10px; background: var(--amberBg2); border: 1px solid var(--amberEdge); border-radius: 2px; padding: 10px 12px">
          <span style="color: var(--amber2); font-size: 12px; font-weight: 700">!</span>
          <span style="font-family: 'Instrument Sans', sans-serif; font-size: 12px; line-height: 1.5; color: var(--warnText)">This goes against ${TIERS[dir.tier].short}’s current ${dir.dir} directive on ${asset}.</span>
        </div>` : ''}
        <div style="display: flex; flex-direction: column; gap: 7px">
          <div data-down="${on(startHold)}" data-up="${on(endHold)}" data-leave="${on(endHold)}" style="border: 1px solid ${t.side === 'BUY' ? C.greenBorder : C.redBorder}; border-radius: 2px; padding: 11px; text-align: center; position: relative; overflow: hidden; cursor: pointer; user-select: none">
            <div id="holdFill" style="position: absolute; left: 0; top: 0; bottom: 0; width: ${(S.hold * 100).toFixed(0)}%; background: ${t.side === 'BUY' ? C.greenBg : C.redBg}"></div>
            <span style="position: relative; font-size: 12px; font-weight: 700; letter-spacing: 0.06em; color: ${sideC}">HOLD TO CONFIRM ${t.side}</span>
          </div>
          <div style="text-align: center; font-size: 9.5px; color: var(--muted)">no accidental fills — press and hold</div>
        </div>
      </div>
    </div>
  </div>`;
}

function renderClearModal() {
  if (!S.clearPrompt) return '';
  return `
  <div data-on="${on(() => setState({ clearPrompt: false, clearText: '' }))}" style="position: fixed; inset: 0; background: rgba(20,23,29,0.28); z-index: 70; display: flex; align-items: center; justify-content: center">
    <div data-on="${on(e => e.stopPropagation())}" style="width: 420px; background: var(--card); border: 1px solid var(--negEdge); border-radius: 4px; box-shadow: 0 28px 70px rgba(20,23,29,0.28); overflow: hidden">
      <div style="padding: 15px 18px; border-bottom: 1px solid var(--line); display: flex; align-items: center; gap: 10px">
        <span style="font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--neg)">Clear the halt</span>
        <span style="flex: 1"></span>
        <button data-on="${on(() => setState({ clearPrompt: false, clearText: '' }))}" style="${btnMono()}font-size: 11px; background: none; border: none; color: var(--muted); cursor: pointer">esc</button>
      </div>
      <div style="padding: 18px; display: flex; flex-direction: column; gap: 12px">
        <span style="font-family: 'Instrument Sans', sans-serif; font-size: 13px; line-height: 1.55; color: var(--bodyText)">The agent resumes placing orders on its next cycle. Positions were untouched while halted and stops stayed enforced. Type <b>CLEAR</b> to confirm — a halt never clears from a bare click.</span>
        <div style="display: flex; gap: 9px">
          <input id="clearInput" type="text" value="${esc(S.clearText)}" data-input="${on((e, el) => { S.clearText = el.value; const b = document.getElementById('clearBtn'); if (b) b.style.opacity = el.value.trim().toUpperCase() === 'CLEAR' ? '1' : '0.45'; })}" data-key="${on(e => { if (e.key === 'Enter') doResume(); })}" placeholder="CLEAR" autocomplete="off" style="flex: 1; ${btnMono()}font-size: 13px; letter-spacing: 0.2em; text-transform: uppercase; background: var(--card); border: 1px solid var(--hard); border-radius: 2px; padding: 9px 12px; color: var(--text); outline: none">
          <button id="clearBtn" data-on="${on(doResume)}" style="${btnMono()}font-size: 11px; font-weight: 700; background: var(--neg); color: var(--onAccent); border: none; border-radius: 2px; padding: 9px 16px; cursor: pointer; opacity: ${S.clearText.trim().toUpperCase() === 'CLEAR' ? 1 : 0.45}">RESUME</button>
        </div>
      </div>
    </div>
  </div>`;
}

/* ---------------- root render + boot ---------------- */
function themeVars() {
  const t = THEMES[S.themeKey];
  const keys = ['ground', 'dot', 'card', 'rail', 'border', 'line', 'hard', 'cardEdge', 'text', 'text2', 'text15', 'dim', 'muted', 'bodyText', 'onAccent', 'textStale', 'pos', 'posBg', 'posEdge', 'posLine', 'neg', 'negBg', 'negEdge', 'negText', 'negFaint', 'amber', 'amberBg', 'amberBg2', 'amberEdge', 'amber2', 'warnText', 'accent', 'accentBg', 'accentEdge', 'accent2', 'violet'];
  return keys.filter(k => t[k]).map(k => '--' + k + ': ' + t[k]).join('; ');
}

function renderConnecting() {
  return `
  <div style="min-height: calc(100vh - 36px); background: var(--card); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; color: var(--text); border: 1px solid var(--cardEdge); border-radius: 10px">
    <span style="font-size: 13px; font-weight: 700; letter-spacing: 0.12em">COOLBREEZE.</span>
    <span style="font-size: 24px; font-variant-numeric: tabular-nums; color: var(--muted)">— — —</span>
    <span style="font-family: 'Instrument Sans', sans-serif; font-size: 12px; color: var(--dim)">${S.syncFailed ? 'no feed — retrying every 30s; em-dashes mean the value was never received' : 'connecting to the agent…'}</span>
  </div>`;
}

function render() {
  EV = {};
  evSeq = 0;
  const root = document.getElementById('root');
  const focused = document.activeElement && document.activeElement.id ? document.activeElement.id : null;
  const chatScroll = document.getElementById('chatScroll');
  const chatAtBottom = chatScroll ? chatScroll.scrollTop + chatScroll.clientHeight >= chatScroll.scrollHeight - 40 : true;

  let page = '';
  if (D()) {
    page = S.tab === 'deck' ? renderDeck()
      : S.tab === 'analytics' ? renderAnalytics()
      : S.tab === 'journal' ? renderJournal()
      : S.tab === 'risk' ? renderRisk()
      : renderConfig();
  }

  root.innerHTML = `
  <div style="${themeVars()}; min-height: 100vh; padding: 18px; background-color: var(--ground); background-image: radial-gradient(var(--dot) 1px, transparent 1px); background-size: 14px 14px">
    ${D() ? `
    <div style="min-height: calc(100vh - 36px); background: var(--card); display: flex; flex-direction: column; color: var(--text); border: 1px solid var(--cardEdge); border-radius: 10px; box-shadow: 0 1px 2px rgba(20,23,29,0.04), 0 16px 44px rgba(20,23,29,0.09)">
      ${renderRail()}
      ${renderHaltBanner()}
      ${renderNav()}
      ${page}
      <div style="flex: 1"></div>
      ${renderDock()}
    </div>` : renderConnecting()}
    ${renderToasts()}
    ${renderAppendix()}
    ${renderChat()}
    ${renderPalette()}
    ${renderTradeModal()}
    ${renderClearModal()}
  </div>`;

  if (focused) {
    const el = document.getElementById(focused);
    if (el) { el.focus(); try { el.setSelectionRange(el.value.length, el.value.length); } catch (e) {} }
  }
  const cs = document.getElementById('chatScroll');
  if (cs && chatAtBottom) cs.scrollTop = cs.scrollHeight;
  if (S.palette) {
    const pi = document.getElementById('paletteInput');
    if (pi && document.activeElement !== pi) pi.focus();
  }
  if (S.clearPrompt) {
    const ci = document.getElementById('clearInput');
    if (ci && document.activeElement !== ci) ci.focus();
  }
}

/* delegated events */
delegate('click', 'data-on', 'click');
delegate('enter', 'data-enter', 'mouseover');
delegate('leave', 'data-leave', 'mouseout');
delegate('input', 'data-input', 'input');
delegate('change', 'data-change', 'change');
delegate('key', 'data-key', 'keydown');
delegate('down', 'data-down', 'mousedown');
delegate('up', 'data-up', 'mouseup');

window.addEventListener('keydown', e => {
  const k = (e.key || '').toLowerCase();
  if ((e.metaKey || e.ctrlKey) && k === 'k') {
    e.preventDefault();
    setState({ palette: !S.palette, query: '' });
    const inp = document.getElementById('paletteInput');
    if (inp) inp.focus();
  } else if (e.key === 'Escape') {
    setState({ palette: false, trade: null, hold: 0, clearPrompt: false });
  } else if (e.key === 'Enter' && S.palette) {
    const target = document.activeElement && document.activeElement.id === 'paletteInput';
    if (target) { const r = paletteResults()[0]; if (r) r.action(); }
  }
});

/* live ticks: loop age + staleness, no full re-render churn */
setInterval(() => {
  if (!D()) return;
  // re-render only when the staleness boundary flips, otherwise leave the DOM alone
  const wasStale = S._wasStale || false;
  const nowStale = isStale();
  if (wasStale !== nowStale) { S._wasStale = nowStale; render(); }
}, 10000);

sync();
setInterval(() => sync(), 30000);

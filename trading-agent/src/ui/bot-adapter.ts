/**
 * Bot adapter contract for the Coolbreeze interface.
 *
 * The UI server is bot-agnostic: anything that implements BotAdapter can be
 * mounted (Coolbreeze today, other bots later). The front-end computes all
 * derived analytics client-side from these raw shapes, so an adapter only has
 * to surface plain state — no aggregation logic lives server-side.
 *
 * DemoAdapter below serves the dataset from the design deck so the interface
 * runs standalone. The live upgrade swaps DemoAdapter for a LiveAdapter that
 * reads the real ledger/params files (see UPGRADE-PLAN.md); the API contract
 * and front-end do not change.
 */

export interface Position {
  id: string;
  tier: number;
  asset: string;
  entry: number;
  mark: number;
  size: number;        // USD notional at entry
  opened: string;      // display date
  sl: number;
  tp: number;
  source: 'agent' | 'manual';
  tranche: string;
}

export interface LedgerTrade {
  day: number;         // day index from seed date (drives chart x-axis)
  date: string;        // display date M/D
  tier: number;
  sym: string;
  entry: number;
  exit: number;
  pnl: number;         // realised USD
  size: number;        // USD notional
  held: string;        // '4h 10m'
  by: string;          // exit reason
  regime: 'trending bull' | 'ranging' | 'volatile';
}

export interface JournalEntry {
  id: string;
  date: string;
  time: string;
  tier: number;
  asset: string;
  action: string;      // 'BOUGHT $60' | 'SOLD $78' | 'HELD'
  conf: number;        // 0-100
  trade: boolean;
  headline: string;
  signal: string;
  plan: string;
  risk: string;
  raw: string;
}

export interface RiskCheck {
  time: string;
  value: string;
  dd: string;
  day: string;
  consec: string;
  trades: string;
  status: string;
}

export interface DailyReport { date: string; summary: string; net: number; }

export interface BotSnapshot {
  bot: { id: string; name: string };
  running: boolean;
  halted: boolean;
  haltReason: string | null;
  loopAgeS: number;
  uptime: string;
  clock: string;
  tradesToday: number;
  seed: number;
  seedLabel: string;
  mtm: number[];               // daily mark-to-market offsets for the equity curve
  totalDays: number;
  day0: string;                // ISO date of day 0
  prices: Record<string, number>;
  directives: Record<string, { tier: number; dir: string }>;
  tierStates: { t: number; asset: string; dir: string; conf: number; age: string }[];
  positions: Position[];
  ledger: LedgerTrade[];
  journal: JournalEntry[];
  params: Record<string, number>;
  assets: Record<number, string[]>;
  riskLog: RiskCheck[];
  reports: DailyReport[];
  equityRanges: Record<string, number[]>;   // deck header sparkline per range
  research: { t: number; ran: boolean; note?: string }[]; // degraded-state surface
  nextCycle: string;
}

export interface ChatReply {
  text: string;
  action: { label: string; kind: string; side?: string; pair?: string; amount?: number } | null;
}

export interface BotAdapter {
  id: string;
  name: string;
  snapshot(): BotSnapshot;
  halt(kind: 'halt' | 'halt-hour'): void;
  /** Resume requires the typed confirmation word. Returns false if it does not match. */
  resume(confirm: string): boolean;
  applyParams(changes: Record<string, number>): number;
  closePosition(id: string): { ok: boolean; asset?: string; pnl?: number };
  /** Manual trade — the UI has already run the hold-to-confirm review. */
  trade(side: 'BUY' | 'SELL', pair: string, amount: number): { ok: boolean; message: string };
  queueResearch(target: string): string;
  rosterAdd(tier: number, symbol: string): void;
  rosterRemove(tier: number, symbol: string): void;
  chat(text: string): ChatReply;
  generateReport(): string;
}

/* ------------------------------------------------------------------ */
/* Demo adapter — dataset ported from the design deck                  */
/* ------------------------------------------------------------------ */

const LEDGER: LedgerTrade[] = [
  { day: 3,  date: '7/03', tier: 2, sym: 'AERO',   entry: 0.712,  exit: 0.744,  pnl: 3.4,  size: 76,  held: '4h 10m', by: 'take profit',   regime: 'ranging' },
  { day: 5,  date: '7/05', tier: 1, sym: 'ETH',    entry: 3040,   exit: 2998,   pnl: -1.9, size: 152, held: '8h 30m', by: 'rebalance',     regime: 'trending bull' },
  { day: 6,  date: '7/06', tier: 3, sym: 'MORPHO', entry: 2.18,   exit: 2.26,   pnl: 2.2,  size: 64,  held: '2h 05m', by: 'take profit',   regime: 'volatile' },
  { day: 9,  date: '7/09', tier: 2, sym: 'AERO',   entry: 0.735,  exit: 0.781,  pnl: 4.8,  size: 78,  held: '6h 20m', by: 'take profit',   regime: 'trending bull' },
  { day: 11, date: '7/11', tier: 4, sym: 'BRETT',  entry: 0.0704, exit: 0.0668, pnl: -2.9, size: 58,  held: '1h 40m', by: 'stop loss',     regime: 'volatile' },
  { day: 12, date: '7/12', tier: 3, sym: 'RENDER', entry: 6.12,   exit: 5.83,   pnl: -3.2, size: 68,  held: '3h 15m', by: 'stop loss',     regime: 'volatile' },
  { day: 15, date: '7/15', tier: 2, sym: 'UNI',    entry: 6.94,   exit: 7.36,   pnl: 5.1,  size: 84,  held: '9h 45m', by: 'take profit',   regime: 'trending bull' },
  { day: 16, date: '7/16', tier: 1, sym: 'ETH',    entry: 3115,   exit: 3188,   pnl: 3.7,  size: 158, held: '7h 10m', by: 'rebalance',     regime: 'trending bull' },
  { day: 18, date: '7/18', tier: 4, sym: 'BRETT',  entry: 0.0689, exit: 0.0771, pnl: 6.9,  size: 58,  held: '5h 30m', by: 'momentum exit', regime: 'trending bull' },
  { day: 19, date: '7/19', tier: 3, sym: 'MORPHO', entry: 2.06,   exit: 1.97,   pnl: -2.8, size: 66,  held: '4h 50m', by: 'stop loss',     regime: 'ranging' },
  { day: 22, date: '7/22', tier: 2, sym: 'AERO',   entry: 0.768,  exit: 0.822,  pnl: 5.5,  size: 80,  held: '5h 05m', by: 'take profit',   regime: 'ranging' },
  { day: 24, date: '7/24', tier: 5, sym: 'UNI',    entry: 7.18,   exit: 7.44,   pnl: 2.4,  size: 66,  held: '12h 20m', by: 'range top',    regime: 'ranging' },
  { day: 26, date: '7/26', tier: 4, sym: 'DEGEN',  entry: 0.0081, exit: 0.0074, pnl: -3.6, size: 52,  held: '1h 15m', by: 'stop loss',     regime: 'volatile' },
  { day: 28, date: '7/28', tier: 2, sym: 'AERO',   entry: 0.792,  exit: 0.861,  pnl: 9.8,  size: 112, held: '3h 40m', by: 'take profit',   regime: 'trending bull' },
  { day: 31, date: '7/31', tier: 1, sym: 'ETH',    entry: 3180,   exit: 3352,   pnl: 11.4, size: 200, held: '9h 05m', by: 'rebalance',     regime: 'trending bull' },
  { day: 34, date: '8/03', tier: 3, sym: 'MORPHO', entry: 2.11,   exit: 1.93,   pnl: -8.2, size: 96,  held: '5h 10m', by: 'stop loss',     regime: 'volatile' },
  { day: 36, date: '8/05', tier: 5, sym: 'UNI',    entry: 7.42,   exit: 7.78,   pnl: 3.1,  size: 64,  held: '11h 05m', by: 'range top',    regime: 'ranging' },
  { day: 38, date: '8/07', tier: 3, sym: 'RENDER', entry: 5.94,   exit: 5.61,   pnl: -4.9, size: 88,  held: '1h 15m', by: 'stop loss',     regime: 'volatile' },
  { day: 40, date: '8/09', tier: 2, sym: 'AERO',   entry: 0.847,  exit: 0.906,  pnl: 7.6,  size: 108, held: '6h 55m', by: 'take profit',   regime: 'trending bull' },
  { day: 42, date: '8/11', tier: 4, sym: 'BRETT',  entry: 0.0812, exit: 0.0899, pnl: 14.2, size: 78,  held: '6h 30m', by: 'momentum exit', regime: 'trending bull' },
];

const MTM = [0, 3, 6, 4, 9, 12, 10, 15, 19, 17, 22, 26, 24, 29, 33, 31, 36, 40, 38, 34,
  28, 19, 8, -4, -17, -29, -38, -44, -47, -45, -39, -31, -22, -14, -7, -2, 8, 16, 24, 28, 24, 18];

const JOURNAL: JournalEntry[] = [
  {
    id: 'j1', date: '8/11/26', tier: 2, asset: 'AERO', action: 'BOUGHT $60', time: '13:42', conf: 78, trade: true,
    headline: 'Fee revenue is up 31% week over week while the price has gone nowhere. I am paying for that divergence.',
    signal: 'RSI 41, price mid-range, 7d volume +18%. Emissions cut lands next epoch.',
    plan: 'Third tranche only if it holds $0.88 through the next two cycles. Target $1.02.',
    risk: 'Stop at $0.83 (−9%). Position capped at 12% of book; currently 11.2%.',
    raw: 'Tier 2 research cycle 14.\nFee revenue $2.41M (7d) vs $1.84M prior — +31%.\nPrice flat at $0.91 over same window; fee/mcap ratio now top decile of tracked DEXes.\nEmissions schedule: −18% at next epoch (Aug 2), historically supportive.\nConfidence 0.78 (prev 0.64). Directive ACCUMULATE held.\nAction: BUY $60 (tranche 2 of 3), stop $0.83, target $1.02.',
  },
  {
    id: 'j2', date: '8/11/26', tier: 3, asset: 'MORPHO', action: 'HELD', time: '11:20', conf: 61, trade: false,
    headline: 'The thesis still stands, but TVL growth has stalled for two cycles. Not adding here.',
    signal: 'TVL flat at $1.4B, borrow demand soft, RSI 47.',
    plan: 'Re-check next cycle. Cut if TVL prints a third flat read.',
    risk: 'Down 6.7% on a $96 position. Stop unchanged at $1.78.',
    raw: 'Tier 3 research cycle 9.\nTVL $1.402B vs $1.398B prior — flat second consecutive read.\nBorrow utilisation 61% (−3pts). RSI 47, no momentum signal.\nConfidence 0.61 (prev 0.74) — below T3 minimum 0.65, so no add permitted.\nDirective REDUCE. Action: HOLD, no order.',
  },
  {
    id: 'j3', date: '8/11/26', tier: 4, asset: 'BRETT', action: 'SOLD $78', time: '09:05', conf: 44, trade: true,
    headline: 'Momentum rolled over on the 4h and social volume halved — taking the +10.7% off the table.',
    signal: '4h return −3.1%, social mentions −52% d/d, RSI dropped from 71 to 58.',
    plan: 'No re-entry until a fresh higher low forms on the 4h.',
    risk: 'Realised +$8.36. Tier 4 exposure back to zero.',
    raw: 'Tier 4 research cycle 22.\n4h return −3.1% after +18% run. Social mention count 4,120 → 1,980.\nMomentum exit rule triggered (2 consecutive negative 4h closes with volume decay).\nConfidence 0.44. Directive EXIT.\nAction: SELL $78 — realised +$8.36 (+10.7%).',
  },
  {
    id: 'j4', date: '8/10/26', tier: 1, asset: 'ETH', action: 'HELD', time: '07:48', conf: 52, trade: false,
    headline: 'Sleeve is inside its rebalance deadband, so I am leaving it alone.',
    signal: 'Target weight 17%, actual 16.7%. Deviation inside the 5% deadband.',
    plan: 'Rebalance only when deviation exceeds the band, smoothed 40% per cycle.',
    risk: 'No change to exposure. Macro sleeve capital $400.',
    raw: 'Tier 1 macro cycle 31.\nTarget ETH weight 17.0%, actual 16.7% — deviation 0.3pts, inside 5% deadband.\nNo rebalance order generated.\nConfidence 0.52. Directive HOLD.',
  },
];

const SEED = 1200;

export class DemoAdapter implements BotAdapter {
  id = 'coolbreeze';
  name = 'COOLBREEZE.';

  private halted = false;
  private haltReason: string | null = null;
  private loopStart = Date.now();
  private started = Date.now() - 41 * 3600 * 1000;
  private tradesToday = 3;

  private prices: Record<string, number> = { ETH: 3412.6, AERO: 0.9142, MORPHO: 1.81, BRETT: 0.0899, UNI: 7.94, AAVE: 268.4, LINK: 14.22, DEGEN: 0.0071, RENDER: 5.61 };
  private directives: Record<string, { tier: number; dir: string }> = {
    ETH: { tier: 1, dir: 'HOLD' }, AERO: { tier: 2, dir: 'ACCUMULATE' }, MORPHO: { tier: 3, dir: 'REDUCE' },
    BRETT: { tier: 4, dir: 'EXIT' }, UNI: { tier: 5, dir: 'IN RANGE' }, AAVE: { tier: 2, dir: 'WATCH' },
    LINK: { tier: 2, dir: 'WATCH' }, DEGEN: { tier: 4, dir: 'WATCH' }, RENDER: { tier: 3, dir: 'WATCH' },
  };

  private positions: Position[] = [
    { id: 'p1', tier: 2, asset: 'AERO', entry: 0.847, mark: 0.9142, size: 140, opened: '8/09/26', sl: 0.83, tp: 1.02, source: 'agent', tranche: '2 of 3' },
    { id: 'p2', tier: 1, asset: 'ETH', entry: 3301, mark: 3412.6, size: 208, opened: '8/04/26', sl: 3140, tp: 3720, source: 'agent', tranche: '1 of 1' },
    { id: 'p3', tier: 3, asset: 'MORPHO', entry: 1.94, mark: 1.81, size: 96, opened: '8/06/26', sl: 1.78, tp: 2.34, source: 'manual', tranche: '1 of 2' },
    { id: 'p4', tier: 5, asset: 'UNI', entry: 7.75, mark: 7.94, size: 66, opened: '8/10/26', sl: 7.18, tp: 8.62, source: 'agent', tranche: '1 of 1' },
  ];

  private params: Record<string, number> = {
    floor: 900, dailyLoss: 8, drawdown: 20, consec: 4, maxTrades: 12,
    t2conf: 55, t3conf: 65, sleeve: 400, deadband: 5, smoothing: 40,
    entryZone: 25, exitZone: 75, tradePct: 6,
    t2stop: 12, t2tgt: 24, t3stop: 10, t3tgt: 32, t4stop: 8, t4tgt: 40,
  };

  private assets: Record<number, string[]> = { 2: ['AERO', 'AAVE', 'LINK'], 3: ['MORPHO', 'RENDER'], 4: ['BRETT', 'DEGEN'], 5: ['UNI'] };

  private posPnl(p: Position) { return (p.mark - p.entry) / p.entry * p.size; }
  private book() {
    const realised = LEDGER.reduce((a, t) => a + t.pnl, 0);
    const unreal = this.positions.reduce((a, p) => a + this.posPnl(p), 0);
    return SEED + realised + unreal;
  }

  snapshot(): BotSnapshot {
    const book = this.book();
    const upH = Math.floor((Date.now() - this.started) / 3600000);
    return {
      bot: { id: this.id, name: this.name },
      running: !this.halted,
      halted: this.halted,
      haltReason: this.haltReason,
      loopAgeS: Math.floor(((Date.now() - this.loopStart) / 1000) % 60),
      uptime: upH + 'h',
      clock: new Date().toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }),
      tradesToday: this.tradesToday,
      seed: SEED,
      seedLabel: '$1,200 seed',
      mtm: MTM,
      totalDays: 42,
      day0: '2026-06-30',
      prices: this.prices,
      directives: this.directives,
      tierStates: [
        { t: 1, asset: 'ETH', dir: 'HOLD', conf: 52, age: '18m ago' },
        { t: 2, asset: 'AERO', dir: 'ACCUMULATE', conf: 78, age: '2h ago' },
        { t: 3, asset: 'MORPHO', dir: 'REDUCE', conf: 61, age: '5h ago' },
        { t: 4, asset: 'BRETT', dir: 'EXIT', conf: 44, age: '11h ago' },
        { t: 5, asset: 'UNI', dir: 'IN RANGE', conf: 69, age: '3h ago' },
      ],
      positions: this.positions,
      ledger: LEDGER,
      journal: JOURNAL,
      params: this.params,
      assets: this.assets,
      riskLog: [
        { time: '14:05', value: '$1,265.92', dd: '0.0%', day: '0.0%', consec: '1', trades: '3', status: 'ok' },
        { time: '14:04', value: '$1,264.20', dd: '0.1%', day: '0.0%', consec: '1', trades: '3', status: 'ok' },
        { time: '14:03', value: '$1,263.02', dd: '0.2%', day: '0.1%', consec: '1', trades: '3', status: 'ok' },
        { time: '14:02', value: '$1,257.54', dd: '0.6%', day: '0.3%', consec: '1', trades: '2', status: 'ok' },
        { time: '14:01', value: '$1,249.18', dd: '1.3%', day: '0.7%', consec: '2', trades: '2', status: 'ok' },
        { time: '14:00', value: '$1,246.86', dd: '1.5%', day: '0.8%', consec: '2', trades: '2', status: 'ok' },
      ],
      reports: [
        { date: '8/29/26', summary: '6 trades · T2 carried, T4 flat', net: 41 },
        { date: '8/28/26', summary: '3 trades · one stop hit on BRETT', net: -18 },
        { date: '8/27/26', summary: '5 trades · sleeve rebalanced', net: 27 },
      ],
      equityRanges: {
        '24H': [1256, 1254, 1259, 1257, 1262, 1260, 1265, 1263, 1266, book],
        '7D': [1214, 1226, 1219, 1237, 1232, 1250, 1256, book],
        '30D': [1200, 1194, 1206, 1199, 1215, 1210, 1228, 1222, 1236, 1231, 1242, 1252, book],
        'ALL': [1200, 1188, 1204, 1196, 1213, 1205, 1224, 1218, 1233, 1226, 1240, 1249, 1258, book],
      },
      research: [1, 2, 3, 4, 5].map(t => ({ t, ran: true })),
      nextCycle: '07:00 CT',
    };
  }

  halt(kind: 'halt' | 'halt-hour') {
    this.halted = true;
    this.haltReason = kind === 'halt-hour'
      ? 'Paused for 1 hour — resumes automatically.'
      : 'Stopped by you — no new orders will be placed.';
  }

  resume(confirm: string) {
    if (confirm !== 'CLEAR') return false;
    this.halted = false;
    this.haltReason = null;
    return true;
  }

  applyParams(changes: Record<string, number>) {
    let n = 0;
    for (const k of Object.keys(changes)) {
      if (k in this.params && typeof changes[k] === 'number' && Number.isFinite(changes[k])) {
        this.params[k] = changes[k];
        n++;
      }
    }
    return n;
  }

  closePosition(id: string) {
    const p = this.positions.find(x => x.id === id);
    if (!p) return { ok: false };
    this.positions = this.positions.filter(x => x.id !== id);
    return { ok: true, asset: p.asset, pnl: this.posPnl(p) };
  }

  trade(side: 'BUY' | 'SELL', pair: string, amount: number) {
    const asset = pair.split('/')[0];
    const price = this.prices[asset];
    if (!price) return { ok: false, message: 'unknown pair ' + pair };
    const amt = Math.min(350, Math.max(10, amount));
    if (side === 'BUY') {
      const d = this.directives[asset] || { tier: 2, dir: 'WATCH' };
      this.positions = [{
        id: 'm' + Math.random().toString(36).slice(2, 6), tier: d.tier, asset,
        entry: price, mark: price, size: amt, opened: new Date().toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' }),
        sl: +(price * 0.92).toPrecision(4), tp: +(price * 1.12).toPrecision(4), source: 'manual', tranche: '1 of 1',
      }, ...this.positions];
    } else {
      this.positions = this.positions.filter(p => p.asset !== asset);
    }
    this.tradesToday++;
    return { ok: true, message: side + ' ' + pair + ' · $' + amt + ' at market' };
  }

  queueResearch(target: string) {
    return target === 'analyst'
      ? 'Analyst re-run queued across all five tiers'
      : 'Tier ' + target + ' research cycle queued';
  }

  rosterAdd(tier: number, symbol: string) {
    const list = this.assets[tier];
    if (list && !list.includes(symbol)) list.push(symbol);
  }

  rosterRemove(tier: number, symbol: string) {
    const list = this.assets[tier];
    if (list) this.assets[tier] = list.filter(s => s !== symbol);
  }

  chat(text: string): ChatReply {
    const q = text.toLowerCase();
    const deployed = this.positions.reduce((a, x) => a + x.size, 0);
    const unreal = this.positions.reduce((a, x) => a + this.posPnl(x), 0);
    const pnlFmt = (n: number) => (n >= 0 ? '+$' + Math.round(n) : '−$' + Math.abs(n).toFixed(1));
    if (/halt|stop|pause/.test(q)) return {
      text: 'I can stop placing new orders immediately. Open positions keep their stops and targets — nothing is liquidated.',
      action: { label: this.halted ? 'Resume trading' : 'Halt trading', kind: 'halt' },
    };
    if (/why|reason|thesis|explain/.test(q)) return {
      text: 'Last call was AERO at 13:42 — I bought $60 as tranche 2 of 3. Fee revenue is up 31% w/w while price stayed flat, so I am paying for that divergence with a stop at $0.83.',
      action: { label: 'Open the journal entry', kind: 'journal' },
    };
    if (/position|holding|exposure|open/.test(q)) return {
      text: this.positions.length + ' positions open, $' + deployed + ' deployed, ' + pnlFmt(unreal) + ' unrealised. Largest is ' +
        this.positions.slice().sort((a, b) => b.size - a.size)[0].asset + '. Nearest stop is 6.1% away.',
      action: null,
    };
    if (/buy|sell|trade|add/.test(q)) {
      const m = q.match(/\$?(\d+)/);
      const amt = m ? Math.min(350, Math.max(10, parseInt(m[1], 10))) : 120;
      const sym = Object.keys(this.prices).find(k => q.includes(k.toLowerCase())) || 'ETH';
      const side = /sell|reduce|trim|exit/.test(q) ? 'SELL' : 'BUY';
      return {
        text: 'I can stage that: ' + side + ' $' + amt + ' of ' + sym + '/USDC at market. You will still get the review step before anything executes.',
        action: { label: 'Review ' + side + ' $' + amt + ' ' + sym, kind: 'trade', side, pair: sym + '/USDC', amount: amt },
      };
    }
    if (/risk|drawdown|loss|safe/.test(q)) return {
      text: 'The book is at its high-water mark, so drawdown is 0.0% against a −' + this.params.drawdown + '% halt line, daily loss flat, one loss in a row. Nothing is close to a threshold.',
      action: { label: 'Open risk monitor', kind: 'risk' },
    };
    if (/perform|win|pnl|p&l|how am i|doing/.test(q)) return {
      text: 'Up $65.92 (+5.5%) since seed, 65% win rate over 20 closed trades, profit factor 2.91. T2 DeFi is carrying it; T3 is the only negative sleeve.',
      action: { label: 'Open analytics', kind: 'analytics' },
    };
    if (/param|threshold|confidence|setting|change/.test(q)) return {
      text: 'I can stage a parameter change for you to apply. T3 minimum confidence is at ' + this.params.t3conf + '% right now — raising it makes me trade emerging names less often.',
      action: { label: 'Open config', kind: 'config' },
    };
    return {
      text: 'I can explain a decision, summarise positions or risk, stage a trade, or change a parameter. Ask in plain words — for example "why did you buy AERO" or "sell $80 of MORPHO".',
      action: null,
    };
  }

  generateReport() {
    return 'Today’s report is generating — about 40 seconds';
  }
}

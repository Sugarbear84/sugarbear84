/**
 * Coolbreeze interface server.
 *
 * Serves the vanilla-JS front-end in public/ and a small JSON API driven by a
 * BotAdapter. The front-end computes all derived analytics from the raw
 * snapshot, so this server stays thin and bot-agnostic.
 *
 * Port 3001 to match the live Coolbreeze UI convention.
 */
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { BotAdapter, DemoAdapter } from './bot-adapter.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.UI_PORT || process.env.PORT || 3001);

const bots = new Map<string, BotAdapter>();
const demo = new DemoAdapter();
bots.set(demo.id, demo);

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function botFor(req: express.Request): BotAdapter | null {
  const id = String(req.query.bot || req.body?.bot || demo.id);
  return bots.get(id) || null;
}

app.get('/api/ui/bots', (_req, res) => {
  res.json([...bots.values()].map(b => ({ id: b.id, name: b.name })));
});

app.get('/api/ui/state', (req, res) => {
  const bot = botFor(req);
  if (!bot) return res.status(404).json({ error: 'unknown bot' });
  res.json(bot.snapshot());
});

app.post('/api/ui/halt', (req, res) => {
  const bot = botFor(req);
  if (!bot) return res.status(404).json({ error: 'unknown bot' });
  const { action, confirm } = req.body || {};
  if (action === 'halt' || action === 'halt-hour') {
    bot.halt(action);
    return res.json({ ok: true, halted: true });
  }
  if (action === 'resume') {
    // Clearing a halt requires the typed word — never a bare click.
    const ok = bot.resume(String(confirm || ''));
    return ok ? res.json({ ok: true, halted: false }) : res.status(400).json({ ok: false, error: 'type CLEAR to resume' });
  }
  res.status(400).json({ error: 'unknown action' });
});

app.post('/api/ui/params/apply', (req, res) => {
  const bot = botFor(req);
  if (!bot) return res.status(404).json({ error: 'unknown bot' });
  const n = bot.applyParams(req.body?.changes || {});
  res.json({ ok: true, applied: n });
});

app.post('/api/ui/positions/close', (req, res) => {
  const bot = botFor(req);
  if (!bot) return res.status(404).json({ error: 'unknown bot' });
  const r = bot.closePosition(String(req.body?.id || ''));
  r.ok ? res.json(r) : res.status(404).json(r);
});

app.post('/api/ui/trade', (req, res) => {
  const bot = botFor(req);
  if (!bot) return res.status(404).json({ error: 'unknown bot' });
  const { side, pair, amount } = req.body || {};
  if (side !== 'BUY' && side !== 'SELL') return res.status(400).json({ ok: false, message: 'bad side' });
  const r = bot.trade(side, String(pair || ''), Number(amount) || 0);
  r.ok ? res.json(r) : res.status(400).json(r);
});

app.post('/api/ui/research', (req, res) => {
  const bot = botFor(req);
  if (!bot) return res.status(404).json({ error: 'unknown bot' });
  res.json({ ok: true, message: bot.queueResearch(String(req.body?.target || 'analyst')) });
});

app.post('/api/ui/roster', (req, res) => {
  const bot = botFor(req);
  if (!bot) return res.status(404).json({ error: 'unknown bot' });
  const { op, tier, symbol } = req.body || {};
  const sym = String(symbol || '').trim().toUpperCase();
  if (!sym || !/^[A-Z0-9]{1,12}$/.test(sym)) return res.status(400).json({ ok: false, error: 'bad symbol' });
  if (op === 'add') bot.rosterAdd(Number(tier), sym);
  else if (op === 'remove') bot.rosterRemove(Number(tier), sym);
  else return res.status(400).json({ ok: false, error: 'bad op' });
  res.json({ ok: true });
});

app.post('/api/ui/chat', (req, res) => {
  const bot = botFor(req);
  if (!bot) return res.status(404).json({ error: 'unknown bot' });
  res.json(bot.chat(String(req.body?.text || '')));
});

app.post('/api/ui/report/generate', (req, res) => {
  const bot = botFor(req);
  if (!bot) return res.status(404).json({ error: 'unknown bot' });
  res.json({ ok: true, message: bot.generateReport() });
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`[ui] Coolbreeze interface on http://localhost:${PORT} (bots: ${[...bots.keys()].join(', ')})`);
});

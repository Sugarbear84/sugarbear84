// src/brain-tier1.ts
// ============================================================
// Tier 1: Blue Chip Foundation — Bi-Weekly Macro Brain
//
// Assets: ETH, BTC
// Timing: Research every 14 days (Sunday evening)
// Style:  Macro position management, NOT day trading
//
// Returns a POSITION DIRECTIVE (not a trade signal):
//   LONG   → open/maintain long position
//   NEUTRAL → hold cash, close existing if any
//   SHORT  → not used for now (paper trading only = long/flat)
//
// Stops: 10–12% | Targets: 20–30% | Max position: 8% of portfolio
// ============================================================

import Anthropic from '@anthropic-ai/sdk';
import * as fs   from 'fs';
import * as path from 'path';
import type { PricePoint, WalletTx } from './datafeed.js';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const REPORT_DIR = path.resolve('data/research-reports');
if (!fs.existsSync(REPORT_DIR)) fs.mkdirSync(REPORT_DIR, { recursive: true });

// ── Types ──────────────────────────────────────────────────────

export interface Tier1Context {
  asset: 'ETH' | 'BTC';
  currentPrice: number;
  change14d: number;       // % price change over 14 days
  change24h: number;
  high14d: number;
  low14d: number;
  volume24h: number;
  fearGreed: number;
  fearGreedLabel: string;
  priceHistory: PricePoint[];   // 14-day hourly from Alchemy
  walletHistory?: WalletTx[];
}

export interface Tier1Directive {
  asset: 'ETH' | 'BTC';
  directive: 'LONG' | 'NEUTRAL';
  positionSizePct: number;    // % of portfolio to allocate (0–8%)
  stopLossPrice: number | null;
  takeProfitPrice: number | null;
  stopLossPct: number;        // e.g. 10
  takeProfitPct: number;      // e.g. 20
  confidence: number;         // 0–1
  thesis: string;             // 1–2 sentence macro rationale
  nextResearchDate: string;   // ISO date string (14 days out)
  rawResponse?: string;
}

// ── System Prompt ─────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a macro crypto analyst and position manager for a trading agent.

Your job is NOT to pick short-term trades. You make bi-weekly position directives for ETH and BTC.

PHILOSOPHY:
- These are macro assets. Research deeply every 2 weeks, then hold patiently.
- A "LONG" directive means: open or maintain a long position, hold for 2+ weeks.
- A "NEUTRAL" directive means: stay in cash, no position.
- Do NOT chase daily price moves. Look at 14-day trends and macro context.
- If uncertain, choose NEUTRAL. Cash is a position.

POSITION SIZING RULES:
- Max 8% of portfolio per asset
- Wider stops (10–12%) to give macro trends room to develop
- Patient targets (20–30%) — let winners run

RESPONSE FORMAT:
Respond ONLY with valid JSON, no markdown, no explanation outside JSON.

{
  "directive": "LONG" | "NEUTRAL",
  "positionSizePct": 0–8,
  "stopLossPct": 8–12,
  "takeProfitPct": 15–30,
  "confidence": 0.0–1.0,
  "thesis": "One to two sentence macro rationale."
}`;

// ── Prompt builder ─────────────────────────────────────────────

function buildPrompt(ctx: Tier1Context): string {
  const histSample = ctx.priceHistory.length === 0
    ? '  No extended history available.'
    : ctx.priceHistory
        .filter((_, i) => i % 12 === 0) // every 12 hours
        .slice(-28)
        .map(h => `  ${h.time.slice(0, 13)}h: $${h.price.toFixed(2)}`)
        .join('\n');

  const walletSummary = !ctx.walletHistory || ctx.walletHistory.length === 0
    ? '  No recent transactions.'
    : ctx.walletHistory.slice(0, 3).map(tx =>
        `  ${tx.time.slice(0, 10)} | ${tx.category} | ${tx.value} ${tx.asset}`
      ).join('\n');

  return `MACRO RESEARCH — ${ctx.asset} — ${new Date().toLocaleDateString()}

CURRENT STATE:
- Price:       $${ctx.currentPrice.toFixed(2)}
- 24h change:  ${ctx.change24h >= 0 ? '+' : ''}${ctx.change24h.toFixed(2)}%
- 14d change:  ${ctx.change14d >= 0 ? '+' : ''}${ctx.change14d.toFixed(2)}%
- 14d high:    $${ctx.high14d.toFixed(2)}
- 14d low:     $${ctx.low14d.toFixed(2)}
- 24h volume:  $${(ctx.volume24h / 1e9).toFixed(2)}B

SENTIMENT:
- Fear & Greed: ${ctx.fearGreed} (${ctx.fearGreedLabel})

14-DAY PRICE HISTORY (sampled every 12 hours):
${histSample}

AGENT WALLET RECENT ACTIVITY:
${walletSummary}

Based on this 14-day context, provide your macro position directive for ${ctx.asset}.
Should we be LONG (open/hold position for next 2 weeks) or NEUTRAL (stay in cash)?`;
}

// ── Main export ───────────────────────────────────────────────

export async function getTier1Directive(ctx: Tier1Context): Promise<Tier1Directive> {
  const prompt = buildPrompt(ctx);

  const response = await client.messages.create({
    model: 'claude-opus-4-6',      // Best model for macro analysis
    max_tokens: 400,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text.trim() : '';

  const nextResearch = new Date();
  nextResearch.setDate(nextResearch.getDate() + 14);

  try {
    const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(clean);

    const stopLossPct    = Math.max(8,  Math.min(12, parsed.stopLossPct ?? 10));
    const takeProfitPct  = Math.max(15, Math.min(30, parsed.takeProfitPct ?? 20));
    const positionSizePct = Math.max(0, Math.min(8, parsed.positionSizePct ?? 0));

    const directive: Tier1Directive = {
      asset: ctx.asset,
      directive: ['LONG', 'NEUTRAL'].includes(parsed.directive) ? parsed.directive : 'NEUTRAL',
      positionSizePct,
      stopLossPrice:   parsed.directive === 'LONG' ? ctx.currentPrice * (1 - stopLossPct / 100) : null,
      takeProfitPrice: parsed.directive === 'LONG' ? ctx.currentPrice * (1 + takeProfitPct / 100) : null,
      stopLossPct,
      takeProfitPct,
      confidence: Math.max(0, Math.min(1, parsed.confidence ?? 0.5)),
      thesis: parsed.thesis ?? 'No thesis provided.',
      nextResearchDate: nextResearch.toISOString().split('T')[0],
      rawResponse: text,
    };

    // Save research report
    const reportFile = path.join(
      REPORT_DIR,
      `tier1-${ctx.asset.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.json`
    );
    fs.writeFileSync(reportFile, JSON.stringify({ ctx, directive, prompt }, null, 2));

    return directive;
  } catch (err: any) {
    console.error('⚠️  Tier 1 brain parse error:', err.message);
    return {
      asset: ctx.asset,
      directive: 'NEUTRAL',
      positionSizePct: 0,
      stopLossPrice: null,
      takeProfitPrice: null,
      stopLossPct: 10,
      takeProfitPct: 20,
      confidence: 0,
      thesis: `Parse error: ${err.message}`,
      nextResearchDate: nextResearch.toISOString().split('T')[0],
    };
  }
}

// ── Scheduling helper ─────────────────────────────────────────

const LAST_RESEARCH_FILE = path.resolve('data/tier1-last-research.json');

export function isResearchDue(): boolean {
  if (!fs.existsSync(LAST_RESEARCH_FILE)) return true;
  try {
    const data = JSON.parse(fs.readFileSync(LAST_RESEARCH_FILE, 'utf8'));
    const last = new Date(data.lastResearch);
    const daysSince = (Date.now() - last.getTime()) / (1000 * 60 * 60 * 24);
    return daysSince >= 14;
  } catch {
    return true;
  }
}

export function markResearchDone(): void {
  fs.writeFileSync(LAST_RESEARCH_FILE, JSON.stringify({
    lastResearch: new Date().toISOString(),
    nextResearch: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
  }, null, 2));
}

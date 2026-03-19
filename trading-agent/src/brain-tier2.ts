// src/brain-tier2.ts
// ============================================================
// Tier 2: DeFi Infrastructure — Tri-Weekly Research Brain
//
// Assets: UNI, AAVE, LINK
// Timing: Research on 1st, 10th, 20th of each month
// Style:  Protocol deep dive → ACCUMULATE | HOLD | REDUCE
//
// This brain is a position manager, not a trade signal generator.
// It assesses the health and momentum of DeFi infrastructure
// tokens and decides whether to add, hold, or reduce exposure.
// ============================================================

import Anthropic from '@anthropic-ai/sdk';
import * as fs   from 'fs';
import * as path from 'path';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const REPORT_DIR = path.resolve('data/research-reports');
if (!fs.existsSync(REPORT_DIR)) fs.mkdirSync(REPORT_DIR, { recursive: true });

// ── Types ──────────────────────────────────────────────────────

export type DeFiAsset = 'UNI' | 'AAVE' | 'LINK';
export type Tier2Decision = 'ACCUMULATE' | 'HOLD' | 'REDUCE';

export interface Tier2Context {
  asset: DeFiAsset;
  currentPrice: number;
  change7d: number;
  change30d: number;
  volume7dAvg: number;
  marketState: 'BULL' | 'NEUTRAL' | 'BEAR';
  fearGreed: number;
  // Protocol-specific data (from The Graph / Token Terminal when available)
  tvlUsd?: number;
  revenue7d?: number;
  activeUsers7d?: number;
  governanceProposals?: string[];  // Recent proposals
  notes?: string;                  // Any manual analyst notes
}

export interface Tier2Directive {
  asset: DeFiAsset;
  decision: Tier2Decision;
  targetAllocationPct: number;    // % of portfolio (0–6%)
  stopLossPct: number;
  takeProfitPct: number;
  confidence: number;
  rationale: string;
  nextResearchDate: string;
}

// ── System Prompt ─────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a DeFi protocol analyst managing a portfolio of infrastructure tokens.

ASSETS: UNI (Uniswap), AAVE (lending), LINK (oracles)

YOUR ROLE:
- You research each protocol every 3 weeks
- You return a position directive: ACCUMULATE, HOLD, or REDUCE
- These are infrastructure plays — multi-week to multi-month holds
- NOT short-term trades

DECISION GUIDE:
- ACCUMULATE: Strong fundamentals, positive catalysts, market supports risk-on
- HOLD:       Stable metrics, no strong reason to add or reduce
- REDUCE:     Weakening fundamentals, better opportunities elsewhere, or bear market

RISK PARAMETERS:
- Max 6% of portfolio per asset
- Stop loss: 10–12% (DeFi tokens are volatile)
- Take profit: 20–30%
- Only active in BULL or NEUTRAL markets, not BEAR

RESPONSE FORMAT — valid JSON only, no markdown:

{
  "decision": "ACCUMULATE" | "HOLD" | "REDUCE",
  "targetAllocationPct": 0–6,
  "stopLossPct": 8–12,
  "takeProfitPct": 15–30,
  "confidence": 0.0–1.0,
  "rationale": "Two to three sentence DeFi protocol rationale."
}`;

// ── Prompt builder ─────────────────────────────────────────────

function buildPrompt(ctx: Tier2Context): string {
  const protocolData = [
    ctx.tvlUsd     ? `- TVL: $${(ctx.tvlUsd / 1e9).toFixed(2)}B`            : null,
    ctx.revenue7d  ? `- 7d Revenue: $${(ctx.revenue7d / 1e3).toFixed(0)}K`  : null,
    ctx.activeUsers7d ? `- 7d Active Users: ${ctx.activeUsers7d.toLocaleString()}` : null,
  ].filter(Boolean).join('\n') || '  Protocol metrics not available (add The Graph integration).';

  const proposals = ctx.governanceProposals?.length
    ? ctx.governanceProposals.slice(0, 3).map(p => `  - ${p}`).join('\n')
    : '  No recent governance activity.';

  return `DEFI RESEARCH — ${ctx.asset} — ${new Date().toLocaleDateString()}

PRICE DATA:
- Current price: $${ctx.currentPrice.toFixed(4)}
- 7d change:     ${ctx.change7d >= 0 ? '+' : ''}${ctx.change7d.toFixed(2)}%
- 30d change:    ${ctx.change30d >= 0 ? '+' : ''}${ctx.change30d.toFixed(2)}%
- 7d avg volume: $${(ctx.volume7dAvg / 1e6).toFixed(1)}M

MACRO CONTEXT:
- Market state:  ${ctx.marketState}
- Fear & Greed:  ${ctx.fearGreed}

PROTOCOL METRICS:
${protocolData}

RECENT GOVERNANCE:
${proposals}

${ctx.notes ? `ANALYST NOTES:\n${ctx.notes}\n` : ''}
Provide your position directive for ${ctx.asset}. Should we ACCUMULATE, HOLD, or REDUCE?`;
}

// ── Main export ───────────────────────────────────────────────

export async function getTier2Directive(ctx: Tier2Context): Promise<Tier2Directive> {
  const prompt = buildPrompt(ctx);

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 350,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text.trim() : '';

  // Next research: 1st, 10th, 20th logic
  const nextDate = getNextResearchDate();

  try {
    const clean   = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed  = JSON.parse(clean);

    const directive: Tier2Directive = {
      asset: ctx.asset,
      decision: ['ACCUMULATE', 'HOLD', 'REDUCE'].includes(parsed.decision) ? parsed.decision : 'HOLD',
      targetAllocationPct: Math.max(0, Math.min(6, parsed.targetAllocationPct ?? 0)),
      stopLossPct:  Math.max(8,  Math.min(12, parsed.stopLossPct  ?? 10)),
      takeProfitPct: Math.max(15, Math.min(30, parsed.takeProfitPct ?? 25)),
      confidence: Math.max(0, Math.min(1, parsed.confidence ?? 0.5)),
      rationale: parsed.rationale ?? 'No rationale provided.',
      nextResearchDate: nextDate,
    };

    const reportFile = path.join(
      REPORT_DIR,
      `tier2-${ctx.asset.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.json`
    );
    fs.writeFileSync(reportFile, JSON.stringify({ ctx, directive, prompt }, null, 2));

    return directive;
  } catch (err: any) {
    console.error('⚠️  Tier 2 brain parse error:', err.message);
    return {
      asset: ctx.asset, decision: 'HOLD', targetAllocationPct: 0,
      stopLossPct: 10, takeProfitPct: 25, confidence: 0,
      rationale: `Parse error: ${err.message}`, nextResearchDate: nextDate,
    };
  }
}

// ── Scheduling helpers ─────────────────────────────────────────

const RESEARCH_DAYS = [1, 10, 20]; // 1st, 10th, 20th of month

export function isResearchDue(): boolean {
  const today = new Date();
  const dom   = today.getDate();
  const hour  = today.getHours();
  return RESEARCH_DAYS.includes(dom) && hour >= 20;
}

function getNextResearchDate(): string {
  const today = new Date();
  const dom   = today.getDate();
  const month = today.getMonth();
  const year  = today.getFullYear();

  const upcoming = RESEARCH_DAYS.find(d => d > dom);
  if (upcoming) {
    return new Date(year, month, upcoming).toISOString().split('T')[0];
  }
  return new Date(year, month + 1, 1).toISOString().split('T')[0];
}

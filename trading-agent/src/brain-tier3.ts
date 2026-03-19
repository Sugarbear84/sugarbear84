// src/brain-tier3.ts
// ============================================================
// Tier 3: Emerging Products — Event-Driven Brain
//
// Assets: BNKR and new Base protocols as discovered
// Timing: Triggered by events/opportunities, not schedule
// Style:  Momentum + narrative — enter early, exit decisively
//
// Only activates in BULL markets when specific signals align:
//   - Strong TVL growth (>20%/month)
//   - Positive social momentum
//   - Tier 1 (ETH) in uptrend
//
// Wider stops (12–15%) and targets (30–50%) for explosive moves.
// ============================================================

import Anthropic from '@anthropic-ai/sdk';
import * as fs   from 'fs';
import * as path from 'path';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const REPORT_DIR = path.resolve('data/research-reports');
if (!fs.existsSync(REPORT_DIR)) fs.mkdirSync(REPORT_DIR, { recursive: true });

// ── Types ──────────────────────────────────────────────────────

export type Tier3Decision = 'ENTER' | 'HOLD' | 'EXIT' | 'SKIP';

export interface Tier3Context {
  asset: string;              // e.g. 'BNKR', 'AERODROME', etc.
  currentPrice: number;
  change7d: number;
  change30d: number;
  marketState: 'BULL' | 'NEUTRAL' | 'BEAR';
  tier1Bullish: boolean;      // ETH in uptrend (required)
  fearGreed: number;
  // Emerging protocol signals
  tvlUsd?: number;
  tvlGrowth30dPct?: number;   // % growth in TVL over 30 days
  socialMomentum?: 'HIGH' | 'MEDIUM' | 'LOW';
  catalysts?: string[];       // Recent catalysts (launches, partnerships)
  notes?: string;
}

export interface Tier3Directive {
  asset: string;
  decision: Tier3Decision;
  targetAllocationPct: number;  // 0–4%
  stopLossPrice: number | null;
  takeProfitPrice: number | null;
  stopLossPct: number;
  takeProfitPct: number;
  confidence: number;
  rationale: string;
}

// ── System Prompt ─────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an early-stage DeFi protocol analyst specializing in emerging Base L2 protocols.

YOUR ROLE:
- Identify high-conviction entries into emerging protocols with strong product-market fit
- Only enter in BULL markets when ETH is trending up
- Think in terms of weeks, not days — but be ready to exit quickly on deterioration
- "Product-market fit emerging" = strong TVL growth, user adoption, positive narrative

DECISIONS:
- ENTER:  Strong conviction setup, initiate a position
- HOLD:   Already in position, thesis intact — hold
- EXIT:   Thesis broken, better risk/reward elsewhere, or market turning
- SKIP:   Not enough signal, pass this opportunity

RISK PARAMETERS:
- Max 4% of portfolio (high-risk tier)
- Stop loss: 12–15% (volatile assets need room)
- Take profit: 30–50% (let emerging narratives run)
- Min confidence to ENTER: 0.75
- ONLY active when Tier 1 (ETH) is bullish

RESPONSE FORMAT — valid JSON only:

{
  "decision": "ENTER" | "HOLD" | "EXIT" | "SKIP",
  "targetAllocationPct": 0–4,
  "stopLossPct": 10–15,
  "takeProfitPct": 25–50,
  "confidence": 0.0–1.0,
  "rationale": "Two to three sentence rationale focusing on product-market fit signals."
}`;

// ── Prompt builder ─────────────────────────────────────────────

function buildPrompt(ctx: Tier3Context): string {
  const protocolData = [
    ctx.tvlUsd        ? `- TVL: $${(ctx.tvlUsd / 1e6).toFixed(1)}M`         : null,
    ctx.tvlGrowth30dPct !== undefined
      ? `- TVL 30d growth: ${ctx.tvlGrowth30dPct >= 0 ? '+' : ''}${ctx.tvlGrowth30dPct.toFixed(1)}%` : null,
    ctx.socialMomentum ? `- Social momentum: ${ctx.socialMomentum}`          : null,
  ].filter(Boolean).join('\n') || '  Limited data — proceed with caution.';

  const catalysts = ctx.catalysts?.length
    ? ctx.catalysts.slice(0, 3).map(c => `  - ${c}`).join('\n')
    : '  No specific catalysts identified.';

  return `EMERGING PROTOCOL RESEARCH — ${ctx.asset} — ${new Date().toLocaleDateString()}

PRICE:
- Current: $${ctx.currentPrice.toFixed(4)}
- 7d:  ${ctx.change7d >= 0 ? '+' : ''}${ctx.change7d.toFixed(2)}%
- 30d: ${ctx.change30d >= 0 ? '+' : ''}${ctx.change30d.toFixed(2)}%

MACRO GATE:
- Market state:   ${ctx.marketState}
- ETH bullish:    ${ctx.tier1Bullish ? 'YES ✅' : 'NO ❌'}
- Fear & Greed:   ${ctx.fearGreed}
${!ctx.tier1Bullish ? '\n⚠️  ETH NOT BULLISH — strongly consider SKIP unless extraordinary circumstances.' : ''}

PROTOCOL SIGNALS:
${protocolData}

CATALYSTS:
${catalysts}

${ctx.notes ? `NOTES:\n${ctx.notes}\n` : ''}
Should we ENTER, HOLD, EXIT, or SKIP ${ctx.asset}?`;
}

// ── Main export ───────────────────────────────────────────────

export async function getTier3Directive(ctx: Tier3Context): Promise<Tier3Directive> {
  // Hard gate: never enter if market isn't BULL and ETH isn't bullish
  if (ctx.marketState === 'BEAR' || (ctx.marketState !== 'BULL' && !ctx.tier1Bullish)) {
    return {
      asset: ctx.asset, decision: 'SKIP', targetAllocationPct: 0,
      stopLossPrice: null, takeProfitPrice: null,
      stopLossPct: 12, takeProfitPct: 40, confidence: 0,
      rationale: 'Market not in BULL state — Tier 3 inactive.',
    };
  }

  const prompt = buildPrompt(ctx);

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 350,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text.trim() : '';

  try {
    const clean  = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(clean);

    const stopLossPct   = Math.max(10, Math.min(15, parsed.stopLossPct   ?? 12));
    const takeProfitPct = Math.max(25, Math.min(50, parsed.takeProfitPct ?? 40));

    const directive: Tier3Directive = {
      asset: ctx.asset,
      decision: ['ENTER', 'HOLD', 'EXIT', 'SKIP'].includes(parsed.decision) ? parsed.decision : 'SKIP',
      targetAllocationPct: Math.max(0, Math.min(4, parsed.targetAllocationPct ?? 0)),
      stopLossPrice:   parsed.decision === 'ENTER' ? ctx.currentPrice * (1 - stopLossPct / 100)   : null,
      takeProfitPrice: parsed.decision === 'ENTER' ? ctx.currentPrice * (1 + takeProfitPct / 100) : null,
      stopLossPct,
      takeProfitPct,
      confidence: Math.max(0, Math.min(1, parsed.confidence ?? 0.5)),
      rationale: parsed.rationale ?? 'No rationale provided.',
    };

    const reportFile = path.join(
      REPORT_DIR,
      `tier3-${ctx.asset.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.json`
    );
    fs.writeFileSync(reportFile, JSON.stringify({ ctx, directive, prompt }, null, 2));

    return directive;
  } catch (err: any) {
    console.error('⚠️  Tier 3 brain parse error:', err.message);
    return {
      asset: ctx.asset, decision: 'SKIP', targetAllocationPct: 0,
      stopLossPrice: null, takeProfitPrice: null,
      stopLossPct: 12, takeProfitPct: 40, confidence: 0,
      rationale: `Parse error: ${err.message}`,
    };
  }
}

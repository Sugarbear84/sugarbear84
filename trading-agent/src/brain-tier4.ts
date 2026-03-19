// src/brain-tier4.ts
// ============================================================
// Tier 4: The Mob — Meme Momentum Brain
//
// Assets: BRETT, TOSHI, DEGEN (Base meme coins)
// Timing: 3-minute cycles ONLY when all 5 activation criteria met
// Style:  Scanner + sniper — momentum in, trailing stop out
//
// ACTIVATION REQUIRES ALL 5:
//   1. Tier 1 bullish (ETH/BTC uptrending)
//   2. Tier 2 active (DeFi profitable)
//   3. Fear & Greed > 75 (extreme greed)
//   4. Altcoin dominance > 8% (altseason confirmed)
//   5. Meme volume spike detected
//
// Tight stops (6%), partial take-profit (15% → 50%), 24h max hold.
// Portfolio cap: 10% total. Daily loss limit: 3% → 48h cooldown.
// ============================================================

import Anthropic from '@anthropic-ai/sdk';
import * as fs   from 'fs';
import * as path from 'path';
import type { Tier4Criteria } from './router.js';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Types ──────────────────────────────────────────────────────

export type MemeAsset = 'BRETT' | 'TOSHI' | 'DEGEN';
export type Tier4Action = 'BUY' | 'HOLD' | 'SKIP';

export interface MemeCandidate {
  symbol: MemeAsset;
  price: number;
  change1h: number;
  change4h: number;
  change24h: number;
  volume1h: number;       // USD
  volumeVsAvg: number;    // e.g. 2.5 = 2.5× average volume
  socialMomentum?: 'HIGH' | 'MEDIUM' | 'LOW';
  whaleActivity?: boolean;
}

export interface Tier4Context {
  candidates: MemeCandidate[];
  criteria: Tier4Criteria;
  fearGreed: number;
  altcoinDominance: number;
  portfolioValue: number;
  currentTier4Exposure: number; // USD already in Tier 4
  openPositions: number;
}

export interface Tier4Decision {
  action: Tier4Action;
  symbol?: MemeAsset;
  amountUsd?: number;
  stopLossPct: number;
  takeProfitPct1: number;   // First target (sell 50%)
  takeProfitPct2: number;   // Final target (sell remaining)
  maxHoldHours: number;
  confidence: number;
  reasoning: string;
}

// ── Cooldown state ────────────────────────────────────────────

const COOLDOWN_FILE = path.resolve('data/tier4-cooldown.json');

export function isInCooldown(): boolean {
  if (!fs.existsSync(COOLDOWN_FILE)) return false;
  try {
    const { cooldownUntil } = JSON.parse(fs.readFileSync(COOLDOWN_FILE, 'utf8'));
    return Date.now() < new Date(cooldownUntil).getTime();
  } catch {
    return false;
  }
}

export function setCooldown(hours = 48): void {
  const until = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
  fs.writeFileSync(COOLDOWN_FILE, JSON.stringify({ cooldownUntil: until, setAt: new Date().toISOString() }));
  console.log(`🔴 Tier 4 cooldown set until ${until}`);
}

// ── System Prompt ─────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a meme coin momentum trader on Base L2.

ASSETS: BRETT, TOSHI, DEGEN — Base L2 meme coins

YOUR ROLE:
- You only trade when ALL 5 activation criteria are met (degens are active)
- You scan candidates for breakout momentum
- Fast in, fast out — 15–40% targets, 6% stops, max 24h hold

SCANNING CRITERIA (in order of importance):
1. Volume spike: 2× or more vs average → momentum building
2. Price momentum: positive 1h and 4h (trend is your friend)
3. Social momentum: HIGH = retail flowing in
4. Whale activity: big wallets accumulating = smart money signal

POSITION SIZING:
- 2–3% of portfolio per trade
- Max 10% total Tier 4 exposure
- Max 3 concurrent Tier 4 positions

RESPONSE FORMAT — valid JSON only, no markdown:

{
  "action": "BUY" | "HOLD" | "SKIP",
  "symbol": "BRETT" | "TOSHI" | "DEGEN" | null,
  "amountUsd": number | null,
  "stopLossPct": 5–8,
  "takeProfitPct1": 12–20,
  "takeProfitPct2": 25–50,
  "maxHoldHours": 4–24,
  "confidence": 0.0–1.0,
  "reasoning": "One sentence. Which candidate and why."
}

If no candidate meets the bar, return SKIP with null symbol.`;

// ── Prompt builder ─────────────────────────────────────────────

function buildPrompt(ctx: Tier4Context): string {
  const candidateLines = ctx.candidates.map(c => [
    `\n${c.symbol}:`,
    `  Price: $${c.price.toFixed(6)}`,
    `  1h: ${c.change1h >= 0 ? '+' : ''}${c.change1h.toFixed(2)}%  4h: ${c.change4h >= 0 ? '+' : ''}${c.change4h.toFixed(2)}%  24h: ${c.change24h >= 0 ? '+' : ''}${c.change24h.toFixed(2)}%`,
    `  Volume 1h: $${(c.volume1h / 1e3).toFixed(0)}K (${c.volumeVsAvg.toFixed(1)}× avg)`,
    c.socialMomentum ? `  Social: ${c.socialMomentum}` : null,
    c.whaleActivity  ? `  🐋 Whale activity detected` : null,
  ].filter(Boolean).join('\n')).join('\n');

  const maxBuy  = Math.max(0, ctx.portfolioValue * 0.10 - ctx.currentTier4Exposure);
  const perTrade = ctx.portfolioValue * 0.025;

  return `MEME SCANNER — ${new Date().toISOString().slice(0, 16)}

ACTIVATION CRITERIA: ✅ ALL MET
- T1 Bullish:    ${ctx.criteria.tier1Bullish ? '✅' : '❌'}
- T2 Active:     ${ctx.criteria.tier2Active  ? '✅' : '❌'}
- F&G > 75:      ${ctx.fearGreed} ${ctx.criteria.fearGreedAbove75 ? '✅' : '❌'}
- Alt Season:    ${ctx.altcoinDominance.toFixed(1)}% ${ctx.criteria.altcoinSeasonActive ? '✅' : '❌'}
- Meme Volume:   ${ctx.criteria.memeVolumeSpike ? '✅' : '❌'}

CANDIDATES:${candidateLines}

PORTFOLIO:
- Total value:   $${ctx.portfolioValue.toFixed(2)}
- T4 exposure:   $${ctx.currentTier4Exposure.toFixed(2)} / $${(ctx.portfolioValue * 0.10).toFixed(2)} max
- Available:     $${maxBuy.toFixed(2)}
- Per-trade size: ~$${perTrade.toFixed(2)}
- Open positions: ${ctx.openPositions}

Which candidate (if any) has the strongest breakout setup right now?`;
}

// ── Main export ───────────────────────────────────────────────

export async function getTier4Decision(ctx: Tier4Context): Promise<Tier4Decision> {
  // Hard gates
  if (!ctx.criteria.allMet) {
    return { action: 'SKIP', stopLossPct: 6, takeProfitPct1: 15, takeProfitPct2: 30, maxHoldHours: 24, confidence: 0, reasoning: 'Activation criteria not met.' };
  }
  if (isInCooldown()) {
    return { action: 'SKIP', stopLossPct: 6, takeProfitPct1: 15, takeProfitPct2: 30, maxHoldHours: 24, confidence: 0, reasoning: 'In cooldown period.' };
  }
  if (ctx.openPositions >= 3) {
    return { action: 'HOLD', stopLossPct: 6, takeProfitPct1: 15, takeProfitPct2: 30, maxHoldHours: 24, confidence: 0, reasoning: 'Max concurrent positions reached.' };
  }
  if (ctx.currentTier4Exposure >= ctx.portfolioValue * 0.10) {
    return { action: 'HOLD', stopLossPct: 6, takeProfitPct1: 15, takeProfitPct2: 30, maxHoldHours: 24, confidence: 0, reasoning: 'Max Tier 4 exposure reached (10%).' };
  }
  if (ctx.candidates.length === 0) {
    return { action: 'SKIP', stopLossPct: 6, takeProfitPct1: 15, takeProfitPct2: 30, maxHoldHours: 24, confidence: 0, reasoning: 'No candidates to evaluate.' };
  }

  const prompt = buildPrompt(ctx);

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 300,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text.trim() : '';

  try {
    const clean  = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(clean);

    const stopLossPct    = Math.max(5, Math.min(8,  parsed.stopLossPct    ?? 6));
    const takeProfitPct1 = Math.max(12, Math.min(20, parsed.takeProfitPct1 ?? 15));
    const takeProfitPct2 = Math.max(25, Math.min(50, parsed.takeProfitPct2 ?? 30));

    // Cap amount to per-trade sizing
    const maxPerTrade = ctx.portfolioValue * 0.03;
    const amountUsd   = parsed.amountUsd ? Math.min(parsed.amountUsd, maxPerTrade) : maxPerTrade * 0.8;

    return {
      action:         ['BUY', 'HOLD', 'SKIP'].includes(parsed.action) ? parsed.action : 'SKIP',
      symbol:         parsed.symbol ?? undefined,
      amountUsd:      parsed.action === 'BUY' ? amountUsd : undefined,
      stopLossPct,
      takeProfitPct1,
      takeProfitPct2,
      maxHoldHours:   Math.max(4, Math.min(24, parsed.maxHoldHours ?? 12)),
      confidence:     Math.max(0, Math.min(1, parsed.confidence ?? 0)),
      reasoning:      parsed.reasoning ?? 'No reasoning provided.',
    };
  } catch (err: any) {
    console.error('⚠️  Tier 4 brain parse error:', err.message);
    return { action: 'SKIP', stopLossPct: 6, takeProfitPct1: 15, takeProfitPct2: 30, maxHoldHours: 24, confidence: 0, reasoning: `Parse error: ${err.message}` };
  }
}

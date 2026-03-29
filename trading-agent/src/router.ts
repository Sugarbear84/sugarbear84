// src/router.ts
// ============================================================
// Market State Classifier & Capital Allocator
//
// Classifies the market as BULL / NEUTRAL / BEAR using:
//   - ETH 24h price change
//   - Fear & Greed Index (alternative.me — free, no key)
//   - BTC dominance (CoinGecko /global — free)
//
// Returns per-tier capital allocation % and Tier 4 activation
// checklist based on the 5-point criteria from the framework.
// ============================================================

import * as dotenv from 'dotenv';
dotenv.config();

import { isSprintMode } from './dashboard.js';

export type MarketState = 'BULL' | 'NEUTRAL' | 'BEAR';

export interface Allocation {
  tier1: number; // % of total portfolio
  tier2: number;
  tier3: number;
  tier4: number;
  cash: number;
}

export interface Tier4Criteria {
  tier1Bullish: boolean;        // ETH/BTC in confirmed uptrend
  tier2Active: boolean;         // DeFi tier recently profitable
  fearGreedAbove75: boolean;    // Extreme greed = retail frenzy
  altcoinSeasonActive: boolean; // Altcoins outperforming BTC
  memeVolumeSpike: boolean;     // High meme activity proxy
  allMet: boolean;              // All 5 criteria met → Tier 4 activates
}

export interface RouterResult {
  state: MarketState;
  allocation: Allocation;
  fearGreed: number;
  fearGreedLabel: string;
  btcDominance: number;
  altcoinDominance: number;
  ethChange24h: number;
  tier4Criteria: Tier4Criteria;
  timestamp: string;
}

// ── Fear & Greed Index ─────────────────────────────────────────

async function getFearGreedIndex(): Promise<{ value: number; label: string }> {
  try {
    const res = await fetch('https://api.alternative.me/fng/?limit=1');
    const data = await res.json() as {
      data: Array<{ value: string; value_classification: string }>;
    };
    return {
      value: parseInt(data.data[0].value, 10),
      label: data.data[0].value_classification,
    };
  } catch (err: any) {
    console.warn('⚠️  Fear & Greed fetch failed:', err.message);
    return { value: 50, label: 'Neutral' };
  }
}

// ── Global Market Dominance (CoinGecko /global) ────────────────

async function getGlobalMarket(): Promise<{
  btcDominance: number;
  ethDominance: number;
  altcoinDominance: number;
}> {
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/global');
    const data = await res.json() as {
      data: { market_cap_percentage: Record<string, number> };
    };
    const pct = data.data?.market_cap_percentage ?? {};
    const btc = pct.btc ?? 50;
    const eth = pct.eth ?? 15;
    return { btcDominance: btc, ethDominance: eth, altcoinDominance: 100 - btc - eth };
  } catch (err: any) {
    console.warn('⚠️  Global market data failed:', err.message);
    return { btcDominance: 50, ethDominance: 15, altcoinDominance: 35 };
  }
}

// ── Market State Scoring ───────────────────────────────────────

function classifyState(
  ethChange24h: number,
  fearGreed: number,
  btcDominance: number
): MarketState {
  let bullPts = 0;
  let bearPts = 0;

  // ETH 24h price trend
  if (ethChange24h > 3)       bullPts += 2;
  else if (ethChange24h > 0)  bullPts += 1;
  else if (ethChange24h < -3) bearPts += 2;
  else if (ethChange24h < 0)  bearPts += 1;

  // Fear & Greed sentiment
  if (fearGreed > 70)         bullPts += 2;
  else if (fearGreed > 50)    bullPts += 1;
  else if (fearGreed < 30)    bearPts += 2;
  else if (fearGreed < 45)    bearPts += 1;

  // BTC dominance (falling = altcoin season = risk-on)
  if (btcDominance < 42)      bullPts += 1;
  else if (btcDominance > 55) bearPts += 1;

  if (bullPts >= 3) return 'BULL';
  if (bearPts >= 3) return 'BEAR';
  return 'NEUTRAL';
}

// ── Capital Allocation by Market State ────────────────────────

function getAllocation(state: MarketState): Allocation {
  switch (state) {
    case 'BULL':    return { tier1: 40, tier2: 25, tier3: 15, tier4: 10, cash: 10 };
    case 'NEUTRAL': return { tier1: 60, tier2: 20, tier3: 5,  tier4: 0,  cash: 15 };
    case 'BEAR':    return { tier1: 70, tier2: 5,  tier3: 0,  tier4: 0,  cash: 25 };
  }
}

// ── Tier 4 Activation (5-point checklist) ─────────────────────

function checkTier4(
  state: MarketState,
  fearGreed: number,
  altcoinDominance: number,
  ethChange24h: number,
  tier2WasProfitable: boolean
): Tier4Criteria {
  const tier1Bullish        = state === 'BULL' && ethChange24h > 2;
  const tier2Active         = tier2WasProfitable;
  const fearGreedAbove75    = fearGreed > 75;
  const altcoinSeasonActive = altcoinDominance > 8;
  const memeVolumeSpike     = altcoinDominance > 10 && fearGreed > 70;

  const allMet = isSprintMode()
    ? (tier1Bullish && tier2Active && fearGreed > 50)
    : (tier1Bullish && tier2Active && fearGreedAbove75 && altcoinSeasonActive && memeVolumeSpike);

  return {
    tier1Bullish,
    tier2Active,
    fearGreedAbove75,
    altcoinSeasonActive,
    memeVolumeSpike,
    allMet,
  };
}

// ── Main Export ───────────────────────────────────────────────

export async function classifyMarket(
  ethChange24h: number,
  tier2WasProfitable = false
): Promise<RouterResult> {
  const [fg, global] = await Promise.all([getFearGreedIndex(), getGlobalMarket()]);

  const state     = classifyState(ethChange24h, fg.value, global.btcDominance);
  const allocation = getAllocation(state);
  const tier4Criteria = checkTier4(
    state, fg.value, global.altcoinDominance, ethChange24h, tier2WasProfitable
  );

  return {
    state,
    allocation,
    fearGreed: fg.value,
    fearGreedLabel: fg.label,
    btcDominance: global.btcDominance,
    altcoinDominance: global.altcoinDominance,
    ethChange24h,
    tier4Criteria,
    timestamp: new Date().toISOString(),
  };
}

// ── Formatting helpers ─────────────────────────────────────────

export function formatRouterSummary(r: RouterResult): string {
  const t4 = r.tier4Criteria;
  const criteria = [
    t4.tier1Bullish        ? '✅' : '❌',
    t4.tier2Active         ? '✅' : '❌',
    t4.fearGreedAbove75    ? '✅' : '❌',
    t4.altcoinSeasonActive ? '✅' : '❌',
    t4.memeVolumeSpike     ? '✅' : '❌',
  ].join(' ');

  return [
    `🌐 Market: ${r.state} | F&G: ${r.fearGreed} (${r.fearGreedLabel}) | BTC Dom: ${r.btcDominance.toFixed(1)}%`,
    `📊 Allocation → T1:${r.allocation.tier1}% T2:${r.allocation.tier2}% T3:${r.allocation.tier3}% T4:${r.allocation.tier4}% Cash:${r.allocation.cash}%`,
    `🎰 Tier 4 [T1bull T2active F&G>75 AltSzn MemeVol]: ${criteria} → ${t4.allMet ? 'ACTIVE 🟢' : 'INACTIVE 🔴'}`,
  ].join('\n');
}

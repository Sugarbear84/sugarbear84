// src/index.ts
// ============================================================
// Coolbreeze Multi-Strategy Trading Agent — Master Orchestrator
//
// Loop architecture (per framework design):
//
//   Every 5 minutes:
//     → Position monitor — check stop-loss/take-profit, NO Claude
//
//   Every 30 minutes:
//     → Market state classification (BULL/NEUTRAL/BEAR)
//     → Router logs allocation
//
//   Bi-weekly (every 14 days, Sunday evening):
//     → Tier 1 research — Claude macro directive for ETH/BTC
//
//   Tri-weekly (1st, 10th, 20th of month):
//     → Tier 2 research — Claude DeFi directive for UNI/AAVE/LINK
//
//   Every 3 minutes (ONLY when Tier 4 activation criteria all met):
//     → Tier 4 meme scan — Claude momentum decision
//
// All tiers write to paper-ledger.json (paper trading mode).
// ============================================================

import * as dotenv from 'dotenv';
dotenv.config();

import * as fs from 'fs';
import { loadWallet, getEthBalance } from './wallet.js';
import { getMarketData, recordPrice, getAlchemyPriceHistory, getAlchemyWalletHistory } from './datafeed.js';
import { loadLedger, executePaperTrade, getPortfolioSummary, recordPortfolioSnapshot } from './executor.js';
import { classifyMarket, formatRouterSummary, type RouterResult } from './router.js';
import { runMonitor }                              from './monitor.js';
import { generateWeeklySummary, appendMarketState } from './analysis.js';
import { startDashboard, setDashboardMarket } from './dashboard.js';
import { isResearchDue as tier1Due, markResearchDone } from './brain-tier1.js';
import { isResearchDue as tier2Due }                   from './brain-tier2.js';
import { getTier4Decision, isInCooldown }           from './brain-tier4.js';
import { getPriceHistory as alchemyPriceHistory }    from './research/alchemy-client.js';

// ── Config ─────────────────────────────────────────────────────

const LOG_FILE               = 'trades.log';
const MONITOR_INTERVAL_MS    = 5 * 60 * 1000;   // 5 minutes
const MARKET_STATE_INTERVAL  = 30 * 60 * 1000;  // 30 minutes
const TIER4_INTERVAL_MS      = 3 * 60 * 1000;   // 3 minutes

// ── Logging ───────────────────────────────────────────────────

function log(msg: string): void {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

// ── Shared state ──────────────────────────────────────────────

let wallet: ReturnType<typeof loadWallet>;
let lastMarketResult: RouterResult | null = null;
let tier2WasProfitable = false;         // Updated after each Tier 2 research

// ── Position Monitor (every 5 min, no Claude) ─────────────────

async function monitorLoop(): Promise<void> {
  try {
    const result = await runMonitor();
    if (result.closedCount > 0) {
      result.alerts.forEach(a => log(a));
      log(`🔍 Monitor: closed ${result.closedCount} position(s) | ${result.openCount} still open`);
    }
  } catch (err: any) {
    log(`⚠️  Monitor error: ${err.message}`);
  }
}

// ── Market State (every 30 min) ───────────────────────────────

async function updateMarketState(): Promise<void> {
  try {
    const market = await getMarketData();
    if (market.ethPrice === 0) {
      log('⚠️  Market data unavailable — skipping state update');
      return;
    }
    recordPrice(market.ethPrice);

    lastMarketResult = await classifyMarket(market.change24h, tier2WasProfitable);
    log(formatRouterSummary(lastMarketResult));
    setDashboardMarket(lastMarketResult);
    recordPortfolioSnapshot(market.ethPrice);

    appendMarketState({
      timestamp:    lastMarketResult.timestamp,
      state:        lastMarketResult.state,
      fearGreed:    lastMarketResult.fearGreed,
      btcDominance: lastMarketResult.btcDominance,
      ethChange24h: lastMarketResult.ethChange24h,
    });

    // Check if Tier 1 research is due
    if (tier1Due()) await runTier1Research(market.ethPrice, market.change24h);

    // Check if Tier 2 research is due
    if (tier2Due()) await runTier2Research(market.ethPrice);

  } catch (err: any) {
    log(`⚠️  Market state error: ${err.message}`);
  }
}

// ── Tier 1: Bi-Weekly ETH/BTC Macro Research ──────────────────

async function runTier1Research(currentEthPrice: number, change24h: number): Promise<void> {
  log('═'.repeat(60));
  log('🔬 TIER 1 RESEARCH — Bi-weekly macro directive');

  try {
    const [priceHistory, walletHistory] = await Promise.all([
      alchemyPriceHistory('ETH', 14),
      getAlchemyWalletHistory(wallet.address),
    ]);

    // Calculate 14-day change
    const oldest  = priceHistory[0]?.price ?? currentEthPrice;
    const change14d = ((currentEthPrice - oldest) / oldest) * 100;
    const prices  = priceHistory.map(p => p.price);
    const high14d = prices.length > 0 ? Math.max(...prices) : currentEthPrice;
    const low14d  = prices.length > 0 ? Math.min(...prices) : currentEthPrice;

    const { getTier1Directive } = await import('./brain-tier1.js');
    const directive = await getTier1Directive({
      asset:          'ETH',
      currentPrice:   currentEthPrice,
      change14d,
      change24h,
      high14d,
      low14d,
      volume24h:      0, // Populated by getMarketData in caller if needed
      fearGreed:      lastMarketResult?.fearGreed ?? 50,
      fearGreedLabel: lastMarketResult?.fearGreedLabel ?? 'Neutral',
      priceHistory,
      walletHistory,
    });

    log(`📋 Tier 1 ETH: ${directive.directive} | Size: ${directive.positionSizePct}% | Confidence: ${(directive.confidence * 100).toFixed(0)}%`);
    log(`   Thesis: ${directive.thesis}`);
    log(`   SL: ${directive.stopLossPrice ? '$' + directive.stopLossPrice.toFixed(2) : 'N/A'} | TP: ${directive.takeProfitPrice ? '$' + directive.takeProfitPrice.toFixed(2) : 'N/A'}`);
    log(`   Next research: ${directive.nextResearchDate}`);

    if (directive.directive === 'LONG' && directive.confidence >= 0.65) {
      const ledger  = loadLedger();
      const total   = ledger.usdBalance + ledger.ethBalance * currentEthPrice;
      const tradeUsd = total * (directive.positionSizePct / 100);

      if (ledger.usdBalance >= tradeUsd) {
        // Tag position with tier prefix for analysis
        const origTrade = executePaperTrade(
          'BUY', tradeUsd, currentEthPrice,
          directive.stopLossPrice, directive.takeProfitPrice, ledger
        );
        log(`✅ T1 ${origTrade}`);
      } else {
        log(`⚠️  T1: Insufficient USDC for $${tradeUsd.toFixed(2)} position`);
      }
    }

    markResearchDone();
    log('═'.repeat(60));
  } catch (err: any) {
    log(`❌ Tier 1 research error: ${err.message}`);
  }
}

// ── Tier 2: Tri-Weekly DeFi Research ──────────────────────────

async function runTier2Research(currentEthPrice: number): Promise<void> {
  if (lastMarketResult?.state === 'BEAR') {
    log('⏭️  Tier 2 skipped — BEAR market');
    return;
  }

  log('═'.repeat(60));
  log('🔬 TIER 2 RESEARCH — Tri-weekly DeFi directive');

  const DEFI_ASSETS: Array<'UNI' | 'AAVE' | 'LINK'> = ['UNI', 'AAVE', 'LINK'];

  const { getTier2Directive } = await import('./brain-tier2.js');

  for (const asset of DEFI_ASSETS) {
    try {
      const directive = await getTier2Directive({
        asset,
        currentPrice: 0,   // Callers should populate via CoinGecko multi-price
        change7d:     0,
        change30d:    0,
        volume7dAvg:  0,
        marketState:  lastMarketResult?.state ?? 'NEUTRAL',
        fearGreed:    lastMarketResult?.fearGreed ?? 50,
      });

      log(`📋 Tier 2 ${asset}: ${directive.decision} | Alloc: ${directive.targetAllocationPct}% | Confidence: ${(directive.confidence * 100).toFixed(0)}%`);
      log(`   ${directive.rationale}`);
      log(`   Next research: ${directive.nextResearchDate}`);

      if (directive.decision === 'ACCUMULATE' && directive.confidence >= 0.70) {
        tier2WasProfitable = true; // Marks Tier 2 as active for Tier 4 gate
      }
    } catch (err: any) {
      log(`⚠️  Tier 2 ${asset} error: ${err.message}`);
    }
  }

  log('═'.repeat(60));
}

// ── Tier 4: Meme Momentum (3-min, only when activated) ────────

async function tier4Scan(): Promise<void> {
  if (!lastMarketResult?.tier4Criteria.allMet) return;
  if (isInCooldown()) {
    log('⏸️  Tier 4 in cooldown — skipping scan');
    return;
  }

  try {
    const ledger = loadLedger();
    const total  = ledger.usdBalance + ledger.ethBalance * (lastMarketResult?.ethChange24h ?? 2000);
    const tier4Exposure = 0; // TODO: sum open Tier 4 positions from ledger

    const { getTier4Decision } = await import('./brain-tier4.js');
    const decision = await getTier4Decision({
      candidates: [], // TODO: populate from DEX screener / event logs
      criteria:   lastMarketResult!.tier4Criteria,
      fearGreed:  lastMarketResult!.fearGreed,
      altcoinDominance: lastMarketResult!.altcoinDominance,
      portfolioValue: total,
      currentTier4Exposure: tier4Exposure,
      openPositions: ledger.positions.filter(p => p.status === 'OPEN').length,
    });

    if (decision.action === 'BUY' && decision.symbol && decision.amountUsd) {
      log(`🎰 T4 BUY ${decision.symbol} $${decision.amountUsd.toFixed(2)} | ${decision.reasoning}`);
      // Paper trade execution for meme coins
      // TODO: add meme coin price fetch for actual execution
    } else {
      log(`🎰 T4 SKIP: ${decision.reasoning}`);
    }
  } catch (err: any) {
    log(`⚠️  Tier 4 scan error: ${err.message}`);
  }
}

// ── Boot Sequence ─────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║   🤖 Coolbreeze — Multi-Strategy Trading Agent       ║');
  console.log('║   4-Tier Framework | Paper Trading | Base L2         ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log('');

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('❌ ANTHROPIC_API_KEY not set in .env');
    process.exit(1);
  }
  log('✅ Anthropic API key configured');

  wallet = loadWallet();
  const ethBal = await getEthBalance(wallet);
  log(`Wallet: ${wallet.address} | ETH: ${ethBal}`);

  const ledger = loadLedger();
  log(getPortfolioSummary(ledger, 0));
  log('');
  log('Loop schedule:');
  log('  Every 5 min  → Position monitor (stop-loss/take-profit)');
  log('  Every 30 min → Market state classification');
  log('  Bi-weekly    → Tier 1 ETH/BTC macro research');
  log('  Tri-weekly   → Tier 2 DeFi infrastructure research');
  log('  Every 3 min  → Tier 4 meme scan (when all criteria met)');
  log('');

  // Run immediately on boot
  await updateMarketState();

  // ── Set up recurring intervals ─────────────────────────────

  // Position monitor — every 5 minutes
  setInterval(monitorLoop, MONITOR_INTERVAL_MS);

  // Market state + research gate — every 30 minutes
  setInterval(updateMarketState, MARKET_STATE_INTERVAL);

  // Tier 4 meme scan — every 3 minutes (gated internally)
  setInterval(tier4Scan, TIER4_INTERVAL_MS);

  startDashboard();
  log('⏰ All loops running. Press Ctrl+C to stop.\n');
}

// ── Graceful Shutdown ─────────────────────────────────────────

process.on('SIGINT', () => {
  log('\n🛑 Coolbreeze shutting down...');
  const ledger = loadLedger();
  log(getPortfolioSummary(ledger, 0));
  log('');
  log(generateWeeklySummary());
  log('\nGoodbye.\n');
  process.exit(0);
});

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

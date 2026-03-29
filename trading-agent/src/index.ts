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
import * as path from 'path';
import { loadWallet, getEthBalance } from './wallet.js';
import { getMarketData, recordPrice, getAlchemyPriceHistory, getAlchemyWalletHistory } from './datafeed.js';
import { loadLedger, executePaperTrade, getPortfolioSummary, recordPortfolioSnapshot } from './executor.js';
import { classifyMarket, formatRouterSummary, type RouterResult } from './router.js';
import { runMonitor }                              from './monitor.js';
import { generateWeeklySummary, appendMarketState } from './analysis.js';
import { startDashboard, setDashboardMarket, isAgentPaused, isSprintMode, registerTierTrigger, addResearchEntry } from './dashboard.js';
import { isResearchDue as tier1Due, markResearchDone } from './brain-tier1.js';
import { isResearchDue as tier2Due }                   from './brain-tier2.js';
import { getTier4Decision, isInCooldown }           from './brain-tier4.js';
import { getPriceHistory as alchemyPriceHistory }    from './research/alchemy-client.js';

// ── DCA state ────────────────────────────────────────────────
const DCA_STATE_FILE = path.join(process.cwd(), 'data', 'dca-state.json');
interface DcaState { [symbol: string]: { tranches: number; lastTrancheTime: string } }

function loadDcaState(): DcaState {
  try { return JSON.parse(fs.readFileSync(DCA_STATE_FILE, 'utf-8')); } catch { return {}; }
}
function saveDcaState(state: DcaState): void {
  fs.mkdirSync(path.dirname(DCA_STATE_FILE), { recursive: true });
  fs.writeFileSync(DCA_STATE_FILE, JSON.stringify(state, null, 2));
}
function canDcaTranche(symbol: string, fearGreed: number, maxTranches = 3, _maxExposurePct = 8): boolean {
  if (fearGreed >= 30) return false; // only in extreme fear
  const state = loadDcaState();
  const s = state[symbol];
  if (!s) return true;
  if (s.tranches >= maxTranches) return false;
  const cooldownHours = isSprintMode() ? 6 : 48;
  const elapsed = Date.now() - new Date(s.lastTrancheTime).getTime();
  return elapsed > cooldownHours * 60 * 60 * 1000;
}
function recordDcaTranche(symbol: string): void {
  const state = loadDcaState();
  const s = state[symbol] ?? { tranches: 0, lastTrancheTime: '' };
  s.tranches += 1;
  s.lastTrancheTime = new Date().toISOString();
  state[symbol] = s;
  saveDcaState(state);
}

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
  if (isAgentPaused()) return;
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
  if (isAgentPaused()) return;
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

    // Check if Tier 1 research is due (sprint: every 3 days)
    const tier1IsDue = isSprintMode()
      ? (() => { try { const d = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'tier1-last-research.json'), 'utf-8')); return (Date.now() - new Date(d.timestamp).getTime()) > 3 * 24 * 60 * 60 * 1000; } catch { return true; } })()
      : tier1Due();
    if (tier1IsDue) await runTier1Research(market.ethPrice, market.change24h);

    // Check if Tier 2 research is due (sprint: every 5 days)
    const tier2IsDue = isSprintMode()
      ? (() => { try { const d = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'tier2-last-research.json'), 'utf-8')); return (Date.now() - new Date(d.timestamp).getTime()) > 5 * 24 * 60 * 60 * 1000; } catch { return true; } })()
      : tier2Due();
    if (tier2IsDue) await runTier2Research(market.ethPrice);

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

    addResearchEntry({
      tier: 1, asset: 'ETH',
      directive: directive.directive,
      confidence: directive.confidence,
      thesis: directive.thesis,
      timestamp: new Date().toISOString(),
      nextResearch: directive.nextResearchDate,
      stopLoss: directive.stopLossPrice,
      takeProfit: directive.takeProfitPrice,
    });

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

    // DCA accumulation in extreme fear
    if (lastMarketResult && lastMarketResult.fearGreed < 30 &&
        ['BEAR', 'NEUTRAL'].includes(lastMarketResult.state)) {
      if (canDcaTranche('ETH', lastMarketResult.fearGreed)) {
        const ledger = loadLedger();
        const total = ledger.usdBalance + ledger.ethBalance * currentEthPrice;
        const tradeUsd = total * 0.025; // 2.5% tranche
        if (ledger.usdBalance >= tradeUsd && tradeUsd > 0) {
          const sl = currentEthPrice * 0.92;
          const tp = currentEthPrice * 1.25;
          const dcaResult = executePaperTrade('BUY', tradeUsd, currentEthPrice, sl, tp, ledger, { pair: 'ETH/USDC', tier: 1 });
          recordDcaTranche('ETH');
          log(`📉 DCA tranche: BUY ETH $${tradeUsd.toFixed(2)} @ $${currentEthPrice.toFixed(2)} (F&G: ${lastMarketResult.fearGreed}) → ${dcaResult}`);
        }
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

  // Fetch real prices + 7d/30d changes for UNI, AAVE, LINK from CoinGecko
  let defiPrices: Record<string, { price: number; change7d: number; change30d: number; vol24h: number }> = {};
  try {
    const cgRes = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=uniswap,aave,chainlink&vs_currencies=usd' +
      '&include_7d_change=true&include_30d_change=true&include_24hr_vol=true'
    );
    const cgData = await cgRes.json() as Record<string, any>;
    defiPrices = {
      UNI:  { price: cgData.uniswap?.usd ?? 0,   change7d: cgData.uniswap?.usd_7d_change ?? 0,   change30d: cgData.uniswap?.usd_30d_change ?? 0,   vol24h: cgData.uniswap?.usd_24h_vol ?? 0 },
      AAVE: { price: cgData.aave?.usd ?? 0,       change7d: cgData.aave?.usd_7d_change ?? 0,       change30d: cgData.aave?.usd_30d_change ?? 0,       vol24h: cgData.aave?.usd_24h_vol ?? 0 },
      LINK: { price: cgData.chainlink?.usd ?? 0,  change7d: cgData.chainlink?.usd_7d_change ?? 0,  change30d: cgData.chainlink?.usd_30d_change ?? 0,  vol24h: cgData.chainlink?.usd_24h_vol ?? 0 },
    };
    log(`📊 DeFi prices — UNI: $${defiPrices.UNI.price.toFixed(2)} | AAVE: $${defiPrices.AAVE.price.toFixed(2)} | LINK: $${defiPrices.LINK.price.toFixed(2)}`);
  } catch (err: any) {
    log(`⚠️  DeFi price fetch failed: ${err.message} — proceeding with zeroed prices`);
  }

  const DEFI_ASSETS: Array<'UNI' | 'AAVE' | 'LINK'> = ['UNI', 'AAVE', 'LINK'];

  const { getTier2Directive } = await import('./brain-tier2.js');

  for (const asset of DEFI_ASSETS) {
    const p = defiPrices[asset] ?? { price: 0, change7d: 0, change30d: 0, vol24h: 0 };
    try {
      const directive = await getTier2Directive({
        asset,
        currentPrice: p.price,
        change7d:     p.change7d,
        change30d:    p.change30d,
        volume7dAvg:  p.vol24h,
        marketState:  lastMarketResult?.state ?? 'NEUTRAL',
        fearGreed:    lastMarketResult?.fearGreed ?? 50,
      });

      log(`📋 Tier 2 ${asset}: ${directive.decision} | Alloc: ${directive.targetAllocationPct}% | Confidence: ${(directive.confidence * 100).toFixed(0)}%`);
      log(`   ${directive.rationale}`);
      log(`   Next research: ${directive.nextResearchDate}`);

      addResearchEntry({
        tier: 2, asset,
        directive: directive.decision,
        confidence: directive.confidence,
        thesis: directive.rationale,
        timestamp: new Date().toISOString(),
        nextResearch: directive.nextResearchDate,
      });

      if (directive.decision === 'ACCUMULATE' && directive.confidence >= 0.70) {
        tier2WasProfitable = true; // Marks Tier 2 as active for Tier 4 gate

        // Execute paper trade for T2 ACCUMULATE
        const assetPrice = defiPrices[asset]?.price ?? 0;
        if (assetPrice > 0) {
          const ledger = loadLedger();
          const total = ledger.usdBalance + ledger.ethBalance * currentEthPrice;
          const sizePct = Math.max(0, Math.min(6, directive.targetAllocationPct ?? 3));
          const tradeUsd = total * (sizePct / 100);
          if (ledger.usdBalance >= tradeUsd && tradeUsd > 0) {
            const sl = assetPrice * (1 - 10 / 100);
            const tp = assetPrice * (1 + 20 / 100);
            const tradeResult = executePaperTrade('BUY', tradeUsd, assetPrice, sl, tp, ledger, { pair: `${asset}/USDC` });
            log(`💎 T2 paper BUY ${asset} $${tradeUsd.toFixed(2)} @ $${assetPrice.toFixed(2)} → ${tradeResult}`);
          }
        }
      }
    } catch (err: any) {
      log(`⚠️  Tier 2 ${asset} error: ${err.message}`);
    }
  }

  log('═'.repeat(60));
}

// ── Tier 4: Meme Momentum (3-min, only when activated) ────────

async function tier4Scan(force = false): Promise<void> {
  if (isAgentPaused()) return;
  if (!force && !lastMarketResult?.tier4Criteria.allMet) {
    if (force === false) log('⏭️  Tier 4 skipped — activation criteria not met (use manual trigger to force)');
    return;
  }
  if (!force && isInCooldown()) {
    log('⏸️  Tier 4 in cooldown — skipping scan');
    return;
  }

  log('═'.repeat(60));
  log(`🎰 TIER 4 SCAN — Meme momentum${force ? ' (manual trigger)' : ''}`);

  try {
    const ledger = loadLedger();
    const ethPrice = lastMarketResult?.ethChange24h ?? 2000;
    const total  = ledger.usdBalance + ledger.ethBalance * ethPrice;

    const mockCriteria = lastMarketResult?.tier4Criteria ?? {
      allMet: false, tier1Bullish: false, tier2Active: false,
      fearGreedAbove75: false, altSeason: false, memeVolume: false,
    };

    const { getTier4Decision } = await import('./brain-tier4.js');
    const decision = await getTier4Decision({
      candidates: [],
      criteria:   mockCriteria,
      fearGreed:  lastMarketResult?.fearGreed ?? 50,
      altcoinDominance: lastMarketResult?.altcoinDominance ?? 40,
      portfolioValue: total,
      currentTier4Exposure: 0,
      openPositions: ledger.positions.filter(p => p.status === 'OPEN').length,
    });

    log(`📋 T4 Decision: ${decision.action} | ${decision.reasoning}`);

    addResearchEntry({
      tier: 4, asset: decision.symbol ?? 'MEME',
      directive: decision.action,
      confidence: 0.5,
      thesis: decision.reasoning,
      timestamp: new Date().toISOString(),
    });

    if (decision.action === 'BUY' && decision.symbol && decision.amountUsd) {
      log(`🎰 T4 BUY ${decision.symbol} $${decision.amountUsd.toFixed(2)}`);
    }
  } catch (err: any) {
    log(`⚠️  Tier 4 scan error: ${err.message}`);
  }

  log('═'.repeat(60));
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

  // Register manual research triggers for dashboard footer
  registerTierTrigger(1, async () => {
    const market = await getMarketData();
    await runTier1Research(market.ethPrice || 2000, market.change24h || 0);
  });
  registerTierTrigger(2, async () => {
    const market = await getMarketData();
    await runTier2Research(market.ethPrice || 2000);
  });
  registerTierTrigger(3, async () => {
    log('⚡ Tier 3 manual trigger — event-driven scan (no candidates queued)');
    addResearchEntry({
      tier: 3, asset: 'BNKR',
      directive: 'SKIP',
      confidence: 0,
      thesis: 'Tier 3 is event-driven. No active emerging protocol signals queued. It activates automatically when TVL growth >20%/month and ETH is in uptrend.',
      timestamp: new Date().toISOString(),
    });
  });
  registerTierTrigger(4, async () => {
    log('⚡ Tier 4 manual scan triggered (force mode)');
    await tier4Scan(true);
  });

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

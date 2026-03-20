# Coolbreeze Multi-Strategy Trading Framework
**deanjackson.eth | March 2026**

---

## Vision: Adaptive Multi-Tier Bot Architecture

A modular trading system that deploys different strategies across market conditions, using **market condition signals** to determine which tier(s) to activate. Think of it as a portfolio of specialized bots, each optimized for specific market environments and asset classes.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                   DATA SOURCES                       │
│     ┌──────────────┬──────────────┬──────────────┐  │
│     │  WEB         │  Fear/Greed  │  On-chain    │  │
│     │  (News/X)    │  Index       │  Metrics     │  │
│     └──────────────┴──────────────┴──────────────┘  │
└─────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────┐
│                   BRAIN (Router)                     │
│  - Analyzes market conditions                        │
│  - Selects active strategy tier(s)                   │
│  - Allocates capital across tiers                    │
│  - Monitors performance feedback loop                │
└─────────────────────────────────────────────────────┘
          ↓                    ↓
┌────────────────┐    ┌────────────────┐
│  RESEARCH      │    │  EXECUTION     │
│  MODULE        │    │  LAYER         │
│                │    │                │
│  - Scans DAOs  │    │  - 0x API      │
│  - Gov forums  │    │  - Uniswap     │
│  - News feeds  │    │  - Base L2     │
└────────────────┘    └────────────────┘
                          ↓
┌─────────────────────────────────────────────────────┐
│                STRATEGY TIERS                        │
│  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐            │
│  │Tier 1│→ │Tier 2│→ │Tier 3│→ │Tier 4│            │
│  └──────┘  └──────┘  └──────┘  └──────┘            │
└─────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────┐
│           ANALYSIS OF OUTCOMES                       │
│  - Track PnL per tier                                │
│  - Regression testing on historical data             │
│  - Strategy performance attribution                  │
│  - Feed learnings back to Brain                      │
└─────────────────────────────────────────────────────┘
```

---

## Strategy Tiers (Detailed Breakdown)

### **Tier 1: Blue Chip Foundation**
**Assets:** ETH / USDC / BTC / (MMA?)  
**Thesis:** "The world goes on-chain"  
**Execution Interval:** 30 minutes to 1 hour  

**When to Activate:**
- **All market conditions** — this tier is always active with at least 40-60% of capital
- Acts as the portfolio's foundation and volatility anchor
- Can scale up allocation during extreme fear (accumulation mode)

**Strategy Profile:**
- **Type:** Swing trading with macro positioning
- **Holding Period:** Days to weeks
- **Stop Losses:** 6-8% (wider for BTC/ETH moves)
- **Take Profits:** 12-20%
- **Position Sizing:** 10-15% per trade
- **Brain Parameters:**
  - Uses your existing straddle sizing framework
  - VWAP deviation, 9/21 EMA, Fear & Greed, Volume
  - Composite score threshold: 70+

**Why It Works:**
- ETH and BTC dominate crypto liquidity and volume
- Most correlated to macro liquidity cycles
- Provides base returns in any market
- Lower volatility = more predictable risk management

---

### **Tier 2: DeFi Infrastructure**
**Assets:** UNI / AAVE / LINK / (others TBD)  
**Thesis:** "Best positioned for masses" — infrastructure that captures value as DeFi adoption grows  
**Execution Interval:** 30 minutes to 1 hour  

**When to Activate:**
- **Bull or neutral markets** — when BTC/ETH are stable or trending up
- **High DeFi activity** — when TVL, lending rates, or DEX volume are elevated
- **Capital allocation:** 15-25% during favorable conditions, 0-5% during bear

**Strategy Profile:**
- **Type:** Event-driven + trend following
- **Holding Period:** Days to weeks
- **Stop Losses:** 8-12% (DeFi tokens are more volatile)
- **Take Profits:** 15-30%
- **Position Sizing:** 5-8% per trade

**Research Module Focus:**
- Monitor governance proposals (snapshot.org, Tally, forums)
- Track protocol revenue and usage metrics (tokenterminal.com)
- News aggregation: X, Bankless, The Defiant
- Look for catalysts: major upgrades, partnerships, token unlocks

**Example Signals:**
- **UNI:** V4 launch news, governance vote on fee switch → bullish
- **AAVE:** Rising lending rates, institutional adoption news → bullish
- **LINK:** New oracle integrations, enterprise partnerships → bullish

**Brain Enhancement:**
- Add "protocol revenue trend" as a 5th indicator (15% weight)
- Reduce Fear & Greed weight to 15% (less relevant for infrastructure)

---

### **Tier 3: Emerging Products**
**Assets:** BNKR / [TBD emerging DeFi products]  
**Thesis:** "Heavy product-market fit emerging" — early-stage protocols showing strong traction  
**Execution Interval:** 30 minutes to 1 hour  

**When to Activate:**
- **Bull markets only** — when overall crypto market cap is expanding
- **Strong individual signals** — specific to each emerging protocol
- **Capital allocation:** 5-15% during favorable conditions, 0% otherwise

**Strategy Profile:**
- **Type:** Momentum + narrative trading
- **Holding Period:** Days to weeks (faster exits on reversal)
- **Stop Losses:** 10-15% (high volatility)
- **Take Profits:** 25-50% (wider targets for explosive moves)
- **Position Sizing:** 3-5% per trade

**Research Module Focus:**
- Track TVL growth rate (faster than competitors?)
- Monitor user adoption metrics (daily active users, transaction volume)
- Social sentiment: X engagement, Discord/Telegram activity
- Watch for: beta launches, token generation events, major partnerships

**Example Criteria for BNKR:**
- TVL growth >20% per month
- Positive sentiment on X (engagement, influencer mentions)
- Trading volume increasing
- Brain sees BTC/ETH in uptrend (Tier 1 bullish confirmation)

**Brain Enhancement:**
- Add "social momentum score" (X API, LunarCrush)
- Require Tier 1 to be bullish before Tier 3 activates
- Use higher confidence threshold: 75+ composite score

---

### **Tier 4: "The Mob" (Meme/Alt Season)**
**Assets:** Altcoins / Shitcoins / Meme coins (BRETT, TOSHI, DEGEN on Base)  
**Thesis:** "Directional bull market trade if all signals = green"  
**Execution Interval:** 3-5 minutes (faster, momentum-based)  

**When to Activate:**
- **Only when ALL signals align:**
  - ✅ BTC/ETH both in confirmed uptrends (Tier 1 bullish)
  - ✅ DeFi infrastructure strong (Tier 2 active and profitable)
  - ✅ Fear & Greed index >75 (extreme greed = retail frenzy)
  - ✅ Altcoin market cap outperforming BTC (altseason confirmed)
  - ✅ Meme coin volume surging (degeneracy indicator)

**Strategy Profile:**
- **Type:** Scanner + sniper — find momentum, ride the wave, exit fast
- **Holding Period:** Minutes to hours (not days)
- **Stop Losses:** 5-8% (tight — these move fast)
- **Take Profits:** 15-40% (scale out: 50% at +15%, 50% at +40%)
- **Position Sizing:** 2-3% per trade, max 5 concurrent positions

**Execution Details:**
- **Scanner:** Monitors Base meme coins for volume spikes, social mentions, price breakouts
- **Entry:** Buy when momentum confirmed (price breaking resistance + volume 2x avg)
- **Exit:** Aggressive trailing stop (trail by 50% of gains) OR hit take profit
- **Max Hold Time:** 24 hours — if no profit by then, close and move on

**Research Module Focus:**
- Monitor X for trending tokens (Kaito AI, LunarCrush)
- Track Base meme coin scanner for volume anomalies
- Watch whale wallets (nansen.ai, debank)
- Look for: celebrity endorsements, viral memes, liquidity additions

**Risk Management:**
- **Portfolio cap:** Max 10% of total capital in Tier 4 at any time
- **Daily loss limit:** If Tier 4 loses 3% in a day, shut it down for 48 hours
- **Deactivation trigger:** If BTC drops >5% in 24h, close all Tier 4 positions immediately

**Brain Enhancement:**
- Create separate "Meme Brain" config file with its own parameters
- Use momentum indicators: RSI, MACD, volume profile
- Add "social velocity" score (rate of X mentions per hour)
- Confidence threshold: 70+ BUT all 5 activation criteria must be met

---

## Capital Allocation Framework

### Base State (Neutral/Uncertain Market)
```
Tier 1 (Blue Chip):        60%  ← Always core holding
Tier 2 (DeFi):             20%  ← Moderate exposure
Tier 3 (Emerging):          5%  ← Minimal, wait for signals
Tier 4 (Meme):              0%  ← Inactive
Cash Reserve:              15%  ← Dry powder for opportunities
```

### Bull Market State (All Systems Green)
```
Tier 1 (Blue Chip):        40%  ← Reduced but still foundation
Tier 2 (DeFi):             25%  ← Active, riding momentum
Tier 3 (Emerging):         15%  ← Aggressive positioning
Tier 4 (Meme):             10%  ← Opportunistic, high risk/reward
Cash Reserve:              10%  ← Smaller buffer
```

### Bear Market State (Risk-Off)
```
Tier 1 (Blue Chip):        70%  ← Increased, defensive accumulation
Tier 2 (DeFi):              5%  ← Minimal, only strongest conviction
Tier 3 (Emerging):          0%  ← Inactive
Tier 4 (Meme):              0%  ← Inactive
Cash Reserve:              25%  ← Maximize dry powder
```

---

## Execution Timing Strategy

### Why 30min-1hr intervals for Tier 1-3?
- **Avoids noise:** 3-minute cycles catch too much intraday chop for swing trades
- **Reduces API costs:** ~93% fewer Claude calls vs 3-minute cycles
- **Better entries:** Gives time for trends to develop, reduces false signals
- **Matches strategy:** Swing trades with multi-day holds don't need minute-by-minute decisions

### Why 3-5min intervals for Tier 4?
- **Momentum trading:** Meme coins move fast, need quick reaction to breakouts
- **Volume spikes:** Opportunities last minutes/hours, not days
- **Risk control:** Faster monitoring = tighter stop losses = smaller losses

### Implementation:
```
Main Loop (runs continuously):
  Every 30 minutes:
    → Tier 1 cycle (ETH/BTC brain decision)
    → Tier 2 cycle (DeFi brain decision)
    → Tier 3 cycle (Emerging brain decision)
  
  Every 3 minutes:
    → Tier 4 cycle (Meme brain decision — only if activated)
  
  Every 1 minute:
    → Monitor all open positions for stop loss / take profit across ALL tiers
```

---

## Brain Router Logic (Decision Tree)

```javascript
async function routerBrain() {
  // 1. Gather macro context
  const market = await getMarketData();
  const fearGreed = await getFearGreedIndex();
  const altcoinDominance = await getAltcoinDominance();
  
  // 2. Determine market state
  const state = classifyMarketState(market, fearGreed, altcoinDominance);
  // → Returns: 'BULL', 'NEUTRAL', 'BEAR'
  
  // 3. Set tier activation and capital allocation
  const allocation = getAllocationForState(state);
  
  // 4. Execute each active tier
  if (allocation.tier1 > 0) {
    await runTier1Strategy(allocation.tier1);
  }
  
  if (allocation.tier2 > 0 && state !== 'BEAR') {
    await runTier2Strategy(allocation.tier2);
  }
  
  if (allocation.tier3 > 0 && state === 'BULL') {
    await runTier3Strategy(allocation.tier3);
  }
  
  if (allocation.tier4 > 0 && checkTier4Activation()) {
    await runTier4Strategy(allocation.tier4);
  }
  
  // 5. Analyze outcomes and adjust
  await analyzePerformance();
}

function checkTier4Activation() {
  return (
    tier1IsBullish() &&         // BTC/ETH uptrending
    tier2IsActive() &&          // DeFi strong
    fearGreedIndex > 75 &&      // Extreme greed
    altcoinDominance > 8% &&    // Altseason confirmed
    memeVolumeSpike()           // Degens are active
  );
}
```

---

## Research Module Implementation

### Data Sources by Tier

**Tier 1 (Macro):**
- CoinGecko / Alchemy: Price, volume, VWAP
- Fear & Greed Index: alternative.me
- On-chain metrics: Glassnode, IntoTheBlock

**Tier 2 (DeFi):**
- Token Terminal: Protocol revenue, TVL, fees
- Snapshot / Tally: Governance proposals
- News: RSS feeds from Bankless, The Defiant, Decrypt
- Social: X API for mentions of UNI, AAVE, LINK

**Tier 3 (Emerging):**
- Protocol-specific dashboards (e.g., Bankr analytics)
- X API: Sentiment tracking for emerging tokens
- Discord/Telegram: Community activity (if APIs available)
- DeFiLlama: TVL growth tracking

**Tier 4 (Memes):**
- Kaito AI / LunarCrush: Social momentum scores
- DEX Screener: Volume spikes on Base meme coins
- X API: Trending tokens, viral memes
- Wallet tracking: Nansen, DeBank (whale movements)

### Research Agent Workflow
```
Every 30 minutes (Tier 1-3):
  1. Fetch latest data for active tiers
  2. Score each asset using tier-specific criteria
  3. Pass scored candidates to Brain for decision
  4. Log research findings for performance analysis

Every 3 minutes (Tier 4 when active):
  1. Scan Base meme coins for volume anomalies
  2. Check X for trending tokens
  3. Identify breakout candidates
  4. Pass top 3 candidates to Meme Brain
```

---

## Regression Testing Framework

### Question from Notes: "Can we do regression testing for strategy analysis?"

**Answer: YES — and it's critical for this multi-strategy system.**

### Implementation Plan

**Phase 1: Historical Data Collection**
- Export paper-ledger.json after every live trade
- Store: entry time, exit time, price, PnL, tier, market state, signals
- Build CSV: `timestamp, tier, asset, action, entry, exit, pnl, state, vwap, ema, fg, volume`

**Phase 2: Backtesting Engine**
```python
# Pseudocode structure
class BacktestEngine:
    def __init__(self, historical_data, strategy_config):
        self.data = historical_data
        self.config = strategy_config
    
    def run_backtest(self, start_date, end_date, tier):
        # Simulate trading decisions using historical signals
        # Calculate hypothetical PnL
        # Track win rate, avg profit, max drawdown
        return BacktestResults(...)
    
    def compare_strategies(self, config_A, config_B):
        # Run both configs on same historical data
        # Return performance comparison
```

**Phase 3: Strategy Optimization**
- Test different parameter sets (stop loss ranges, confidence thresholds, etc.)
- Find optimal settings per tier per market state
- Example: "In bear markets, Tier 1 performs best with 8% stops and 70 confidence threshold"

**Phase 4: Continuous Learning Loop**
```
Weekly:
  → Run regression tests on past week's trades
  → Identify which tier overperformed/underperformed
  → Adjust Brain parameters based on findings
  → Update capital allocation percentages if needed
```

### Metrics to Track Per Tier
```
Performance Metrics:
- Total PnL
- Win rate (% profitable trades)
- Average profit per trade
- Average loss per trade
- Max drawdown
- Sharpe ratio
- Profit factor (gross profit / gross loss)

Market Condition Breakdown:
- Performance in BULL vs NEUTRAL vs BEAR
- Best performing signals per market state
- False signal rate (trades that hit stop loss)
```

### Example Output
```
TIER 1 REGRESSION RESULTS (Feb 1 - Feb 28, 2026)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total Trades:     24
Win Rate:         62.5%
Total PnL:        +$127.34
Avg Profit:       +$12.89
Avg Loss:         -$7.21
Max Drawdown:     -$31.20
Sharpe Ratio:     1.47

Market State Performance:
  BULL:     +$89.12  (14 trades, 71% win rate)
  NEUTRAL:  +$52.44  (8 trades,  62% win rate)
  BEAR:     -$14.22  (2 trades,  0% win rate)  ← ADJUST STRATEGY

Best Signals:
  VWAP + EMA combination: 78% win rate
  Fear & Greed alone: 41% win rate  ← DE-EMPHASIZE

Recommendation:
  → Increase EMA weight from 25% → 30%
  → Reduce Fear & Greed from 20% → 15%
  → Avoid Tier 1 trades in confirmed BEAR (wait for reversal signals)
```

---

## Feedback Loop: Analysis of Outcomes

This is the critical learning mechanism — results from live trading inform future decisions.

### Data Pipeline
```
Live Trade → paper-ledger.json → Analysis Module → Brain Config Update
```

### What Gets Analyzed?
1. **Per-Tier Performance:** Which tier is contributing most to PnL?
2. **Signal Accuracy:** Which indicators predicted moves best?
3. **Market State Transitions:** How well did Brain detect state changes?
4. **Risk Management:** Were stop losses set correctly? Hit too often?
5. **Capital Allocation:** Was the tier allocation optimal for actual market conditions?

### Automated Adjustments
```javascript
async function analyzeAndAdjust() {
  const last30Days = await getTradeHistory(30);
  
  // Calculate performance by tier
  const tier1PnL = sumPnL(last30Days, 'tier1');
  const tier2PnL = sumPnL(last30Days, 'tier2');
  const tier3PnL = sumPnL(last30Days, 'tier3');
  const tier4PnL = sumPnL(last30Days, 'tier4');
  
  // Adjust allocation based on what's working
  if (tier2PnL > tier1PnL * 1.5) {
    // Tier 2 significantly outperforming → increase allocation
    allocation.tier2 += 5%;
    allocation.tier1 -= 5%;
  }
  
  // Identify underperforming signals
  const signalAccuracy = analyzeSignals(last30Days);
  if (signalAccuracy.fearGreed < 0.45) {
    // F&G not predictive → reduce weight
    brainConfig.fearGreedWeight = 15;
    brainConfig.emaWeight = 30;
  }
  
  // Save updated config
  await saveBrainConfig(brainConfig);
  await saveAllocationConfig(allocation);
}
```

### Human Review Dashboard
Generate weekly summary for manual review:
```
WEEKLY PERFORMANCE SUMMARY (Feb 24 - Mar 2, 2026)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Portfolio Value: $979.34 → $1,043.88 (+6.6%)

Tier Breakdown:
  Tier 1 (ETH/BTC):    +$42.14  (65% of gains)
  Tier 2 (DeFi):       +$28.90  (35% of gains)
  Tier 3 (Emerging):   -$3.52   (DEACTIVATED on Day 3)
  Tier 4 (Memes):      +$0.00   (INACTIVE all week)

Market State Distribution:
  BULL: 2 days (29%)
  NEUTRAL: 4 days (57%)
  BEAR: 1 day (14%)

Top Performing Trade:
  ETH long @ $1,906 → $2,052 (+7.7%, Tier 1)

Worst Trade:
  AAVE long stopped out -8.2% (Tier 2)

Recommendations:
  ✓ Tier 1 performing well, no changes needed
  ⚠ Tier 2 stop losses too tight for DeFi volatility → widen to 10%
  ✗ Tier 3 showed no edge this week → keep deactivated until stronger signals
  ℹ Market entering consolidation → shift allocation toward Tier 1
```

---

## Implementation Roadmap

### Phase 1: Foundation (Current → Week 1)
- ✅ Tier 1 already operational (ETH/BTC swing trader)
- ✅ Paper trading working, stop loss/take profit functional
- ⏳ Add regression testing framework
- ⏳ Build analysis module (track performance metrics)

### Phase 2: Add Tier 2 (Week 2-3)
- [ ] Create separate brain config for DeFi strategy
- [ ] Integrate Token Terminal API for protocol metrics
- [ ] Add governance scanning (Snapshot, Tally)
- [ ] Build DeFi research module
- [ ] Test Tier 2 in paper mode for 2 weeks

### Phase 3: Router Logic (Week 4)
- [ ] Build market state classifier (BULL/NEUTRAL/BEAR)
- [ ] Implement dynamic capital allocation
- [ ] Add Brain router to select active tiers
- [ ] Test multi-tier coordination in paper mode

### Phase 4: Add Tier 3 (Week 5-6)
- [ ] Research emerging protocols on Base (beyond BNKR)
- [ ] Build social momentum tracker (X API integration)
- [ ] Create Tier 3 brain config
- [ ] Test in paper mode, analyze performance

### Phase 5: Add Tier 4 (Week 7-8) — OPTIONAL
- [ ] Build meme coin scanner for Base
- [ ] Integrate Kaito AI or LunarCrush for social data
- [ ] Create "Meme Brain" with momentum indicators
- [ ] Set strict activation criteria (5-point checklist)
- [ ] Test with MAX 2% of portfolio, paper mode only

### Phase 6: Go Live on Mainnet (Week 9)
- [ ] Generate fresh mainnet wallet (security isolation)
- [ ] Fund with <$100 initially
- [ ] Deploy Tier 1 + Tier 2 only (proven strategies)
- [ ] Monitor for 1 month before adding Tier 3/4

### Phase 7: Continuous Optimization (Ongoing)
- [ ] Weekly regression analysis
- [ ] Monthly strategy review
- [ ] Quarterly brain parameter tuning
- [ ] Annual portfolio rebalancing

---

## Risk Management Across All Tiers

### Portfolio-Level Limits
```
Max Capital in Active Trades:        80% (20% cash reserve)
Max Concurrent Positions:            10 (across all tiers)
Max Single Position Size:            15% of portfolio
Max Loss Per Day:                    5% of portfolio value
Max Loss Per Week:                   10% of portfolio value
```

### Tier-Specific Limits
```
Tier 1: 10-15% per trade, max 5 concurrent
Tier 2: 5-8% per trade, max 3 concurrent
Tier 3: 3-5% per trade, max 2 concurrent
Tier 4: 2-3% per trade, max 3 concurrent (AND max 10% total tier allocation)
```

### Emergency Shutoff Triggers
```
If portfolio drops 15% in 24 hours:
  → Close ALL positions
  → Halt trading for 48 hours
  → Review what went wrong before resuming

If any single tier loses 10% in 7 days:
  → Deactivate that tier
  → Analyze strategy failure
  → Rebuild parameters before reactivating

If correlation breakdown (Tier 1 + Tier 2 both negative):
  → Reduce total exposure by 50%
  → Increase cash reserve
  → Wait for clearer market direction
```

---

## Key Differences from Current System

### What Changes?
1. **Multiple Strategies:** Instead of one ETH bot, you have 4 specialized bots
2. **Dynamic Allocation:** Capital shifts between tiers based on market state
3. **Longer Cycles:** Tier 1-3 run every 30-60 min (vs current 3-min)
4. **Research Module:** New component that feeds data to each tier's brain
5. **Feedback Loop:** Performance analysis informs future decisions

### What Stays the Same?
1. **Core Architecture:** Brain → Risk Gate → Executor → Monitor
2. **Stop Loss/Take Profit:** Same position management logic
3. **Paper Trading:** Can test all tiers in simulation first
4. **Claude Decision Engine:** Each tier uses Claude for trade decisions
5. **Hardcoded Guardrails:** LLM cannot override risk limits

---

## File Structure (Proposed)

```
coolbreeze/
├── src/
│   ├── index.ts              ← Main router loop
│   ├── brain-tier1.ts        ← ETH/BTC swing brain
│   ├── brain-tier2.ts        ← DeFi infrastructure brain
│   ├── brain-tier3.ts        ← Emerging protocols brain
│   ├── brain-tier4.ts        ← Meme momentum brain
│   ├── research-module.ts    ← Data aggregation for all tiers
│   ├── executor.ts           ← Paper trading (current)
│   ├── onchain-executor.ts   ← Live execution (current)
│   ├── analysis.ts           ← Performance tracking + regression
│   ├── router.ts             ← Market state classifier + allocator
│   └── wallet.ts             ← Wallet management (current)
├── configs/
│   ├── allocation.json       ← Capital allocation by market state
│   ├── tier1-params.json     ← Tier 1 brain parameters
│   ├── tier2-params.json     ← Tier 2 brain parameters
│   ├── tier3-params.json     ← Tier 3 brain parameters
│   └── tier4-params.json     ← Tier 4 brain parameters
├── data/
│   ├── paper-ledger.json     ← All trades across tiers
│   ├── performance.csv       ← Historical results for backtesting
│   └── market-states.json    ← Log of market state changes
└── tests/
    ├── backtest-tier1.ts
    ├── backtest-tier2.ts
    └── regression-suite.ts
```

---

## Next Steps: Where to Start?

### Option A: Incremental (Lower Risk)
1. Keep current Tier 1 bot running as-is
2. Build regression testing first (analyze current performance)
3. Add Tier 2 (DeFi) in paper mode, run parallel for 2 weeks
4. Compare results, decide if multi-tier makes sense
5. If yes, add Router and continue building out

### Option B: Clean Slate (Higher Reward)
1. Pause current bot
2. Build full multi-tier architecture from scratch
3. Test all tiers in paper mode simultaneously
4. Analyze which tiers work best
5. Deploy to mainnet with proven strategies only

### Recommended: Option A
- Lower risk, keeps proven system running
- Lets you validate multi-tier concept before full commit
- Can abandon if complexity doesn't justify results
- Easier to debug one new tier at a time

---

## Questions for You

Before building this, let's clarify:

1. **Time Horizon:** Are you thinking multi-day holds (current) or want faster intraday trades too?
   - Current system: 3-5% stops, 8-12% targets, multi-day holds
   - Your note says "30min to 1hr intervals" — does this mean decision frequency or hold time?

2. **Meme Coin Appetite:** Tier 4 is high-risk/high-reward. Comfortable with 2-5% bets on Base memes?
   - If yes, we build the scanner + sniper bot
   - If no, we skip Tier 4 and focus on Tier 1-3 (more conservative)

3. **Research Module Priority:** Which data sources are most important?
   - Governance (Snapshot/Tally) for Tier 2?
   - Social momentum (X API) for Tier 3/4?
   - On-chain metrics (Nansen, Glassnode) for Tier 1?

4. **Backtesting:** Do you have historical trade data from other bots/exchanges we can test on?
   - If yes, we can validate strategies before going live
   - If no, we start collecting data now for future testing

5. **Capital:** What's your target portfolio size once this is operational?
   - <$1K: Focus on Tier 1 only, keep it simple
   - $1K-$10K: Tier 1 + Tier 2 makes sense
   - $10K+: Full multi-tier justified (risk spread across strategies)

---

## Closing Thoughts

This multi-strategy framework is **ambitious but achievable**. The key is building incrementally — get Tier 1 rock-solid, add Tier 2, validate with regression testing, then expand.

The feedback loop is what makes this powerful. Most bots run blind, repeating the same strategy forever. This system **learns** — it sees what worked, adjusts parameters, shifts capital to winning strategies, and deactivates losers.

Your architecture sketch is spot-on. The Brain coordinates, Research feeds it data, Execution handles the trades, and Analysis closes the loop. It's a proper trading system, not just a single-strategy bot.

**Let me know which direction you want to take this, and we can start building the next component.**

---

**deanjackson.eth — Coolbreeze Multi-Strategy Framework v1 — Base L2**

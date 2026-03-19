# Refined Execution Timing: Research-Driven vs Event-Driven Tiers

## The Insight: Not Everything Needs Real-Time Monitoring

**Your instinct is correct.** ETH/BTC and DeFi infrastructure don't require 30-minute decision cycles. These are **macro position trades**, not day-trading opportunities.

---

## Updated Tier Timing Strategy

### Tier 1 (ETH/BTC) — Bi-Weekly Research Cycles

**Research Frequency:** Every 2 weeks (Sunday evening)  
**Position Management:** Continuous (every 5 minutes for stop-loss monitoring)

#### How It Works:

**Research Phase (2 hours every 2 weeks):**
```
Sunday 8pm:
  1. Deep dive into macro context
     - BTC/ETH 30-day price action
     - Fear & Greed trend (not snapshot, trend over 2 weeks)
     - On-chain metrics (accumulation vs distribution)
     - Correlation to macro liquidity (DXY, yields, equities)
  
  2. Consult Claude for macro positioning
     - "Given 2-week trends, should we be LONG, SHORT, or NEUTRAL on ETH?"
     - Not a trade signal, a POSITION directive
     - Example response: "LONG ETH, target 5-10% of portfolio, hold for 2+ weeks"
  
  3. Execute position adjustment
     - If directive = LONG and we're 0% → open 8% position
     - If directive = LONG and we're already 8% → hold
     - If directive = NEUTRAL and we're 8% → close to 0%
  
  4. Set wide stops appropriate for 2-week hold
     - Stop loss: 10-12% (give macro trends room to develop)
     - Take profit: 20-30% (patient, let winners run)
```

**Position Monitoring (continuous, automated):**
```
Every 5 minutes:
  - Check if stop loss hit → close position
  - Check if take profit hit → close position
  - NO new trade decisions, just exit management
```

**Why This Works:**
- ETH/BTC are macro assets — fundamentals change over weeks, not hours
- Swing trading thesis: multi-day to multi-week holds
- Reduces Claude API costs by ~98% (1 call every 2 weeks vs 480 calls)
- Forces discipline: you research, decide, commit, hold
- No FOMO-driven position churning

**Example 2-Week Research Report:**
```
Date: March 2, 2026
Asset: ETH
Current Price: $2,050

2-Week Context:
- Price action: +12% over last 14 days (from $1,830 → $2,050)
- Fear & Greed: Moved from 28 (Fear) → 52 (Neutral)
- On-chain: Accumulation addresses +3.2%, exchange balances -4.1%
- Correlation: Broke positive correlation with Nasdaq, now independent
- Volume: Above 30-day average by 18%

Claude's Macro Directive:
"LONG ETH — 8% of portfolio. Accumulation pattern strong, 
momentum building, next resistance $2,250. Hold for 2+ weeks.
Stop loss: $1,845 (-10%). Take profit: $2,460 (+20%)."

Action Taken: Opened 8% long position, set automated exits.
Next research: March 16, 2026
```

---

### Tier 2 (DeFi Infrastructure) — Tri-Weekly Research Cycles

**Research Frequency:** Every 3 weeks (1st of month, 10th, 20th)  
**Position Management:** Continuous (every 5 minutes for stop-loss monitoring)

#### How It Works:

**Research Phase (3 hours every 3 weeks):**
```
1st/10th/20th of month:
  1. Protocol deep dives (Dune Analytics)
     - UNI: TVL trend, fee revenue, governance activity
     - AAVE: Lending rates, utilization, bad debt events
     - LINK: Oracle integrations, new partnerships
  
  2. Competitive analysis
     - Is UNI losing market share to Aerodrome on Base?
     - Is AAVE lending rate competitive vs Compound/Morpho?
     - Are new oracle providers threatening LINK?
  
  3. Governance & catalysts
     - Upcoming votes (fee switches, protocol upgrades)
     - Token unlocks or vesting schedules
     - Regulatory developments
  
  4. Portfolio decision matrix
     UNI: [ACCUMULATE | HOLD | REDUCE]
     AAVE: [ACCUMULATE | HOLD | REDUCE]
     LINK: [ACCUMULATE | HOLD | REDUCE]
  
  5. Execute rebalancing
     - If ACCUMULATE → increase position by 3-5%
     - If HOLD → maintain current allocation
     - If REDUCE → trim position by 3-5%
```

**Why Tri-Weekly (not Bi-Weekly)?**
- DeFi protocol fundamentals evolve slower than macro
- Governance proposals take weeks to pass/implement
- TVL and revenue trends need 3-week windows to be meaningful
- Reduces research fatigue vs bi-weekly cadence

**Example Tri-Weekly Research Report:**
```
Date: March 1, 2026
Tier 2 Portfolio Review

UNI (Current: 4% of portfolio)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TVL (21-day): $4.2B → $4.6B (+9.5%)
Volume (21-day avg): $1.8B/day (+12%)
Fee revenue: $840K/day (↑ vs last review)
Governance: V4 hooks governance passed, bullish
Competitive: Maintaining dominance on Base
DECISION: ACCUMULATE → increase to 6% of portfolio

AAVE (Current: 5% of portfolio)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TVL (21-day): $11.2B → $10.8B (-3.6%)
Lending rates: USDC 4.2% → 3.8% (declining)
Bad debt: $0 (no liquidation issues)
Governance: GHO stablecoin expansion on Base proposed
Competitive: Losing ground to Morpho on Ethereum
DECISION: HOLD → maintain 5% position

LINK (Current: 3% of portfolio)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Oracle integrations: +7 new protocols (bullish)
CCIP adoption: 12 new chains connected
Competition: Pyth gaining in Solana DeFi
Price action: Consolidating, no clear trend
DECISION: HOLD → maintain 3% position

Actions Taken:
- Increased UNI from 4% → 6% (+$19.60 deployed)
- Held AAVE and LINK positions
Next review: March 20, 2026
```

---

### Tier 3 (Emerging Protocols) — Event-Driven (When Opportunity Appears)

**NOT on a schedule.** Only trade when:
- New protocol launches with strong early traction
- Existing position hits a catalyst (major partnership, token unlock)
- Social momentum crosses threshold (viral moment)

**Research triggered by:**
- Weekly Dune scan shows new protocol with >20% TVL growth
- X monitoring detects emerging narrative
- On-chain alerts (whale deposits, volume spikes)

**Position sizing:** 3-5% max, tighter stops (10-15%)

---

### Tier 4 (Meme Coins) — High-Frequency Scanning (When Activated)

**Only runs when all 5 activation criteria met:**
1. Tier 1 bullish (BTC/ETH uptrending)
2. Tier 2 active and profitable
3. Fear & Greed >75
4. Altseason confirmed
5. Meme volume surging

**When active:**
- Scanner runs every 3 minutes
- Positions held for minutes to hours
- Max 10% of portfolio across all meme positions

**When inactive (most of the time):**
- Scanner off, no CPU/API usage
- Tier 4 brain dormant

---

## Updated Main Loop Architecture

```javascript
// Main continuous loop
async function mainLoop() {
  while (true) {
    
    // POSITION MONITORING (every 5 minutes)
    await monitorAllPositions(); // Check stops/targets across ALL tiers
    
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // TIER 1 & 2: RESEARCH-DRIVEN (scheduled)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    if (isBiWeeklySunday()) {
      console.log('📊 Tier 1 Research Cycle Starting...');
      await tier1Research();
      await tier1PositionAdjustment();
    }
    
    if (isTriWeeklyResearchDay()) { // 1st, 10th, 20th of month
      console.log('📊 Tier 2 Research Cycle Starting...');
      await tier2Research();
      await tier2Rebalancing();
    }
    
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // TIER 3: EVENT-DRIVEN (no fixed schedule)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    // Runs weekly scan, only trades if opportunity detected
    if (isWeeklyScanDay()) {
      const opportunities = await scanEmergingProtocols();
      if (opportunities.length > 0) {
        console.log('🔔 Tier 3 Opportunity Detected');
        await tier3Evaluate(opportunities);
      }
    }
    
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // TIER 4: HIGH-FREQUENCY (only when activated)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    if (isTier4Activated()) {
      // Runs every 3 minutes when conditions align
      if (elapsed3Minutes()) {
        const memeSignals = await scanBaseMemeCoins();
        if (memeSignals.length > 0) {
          await tier4Execute(memeSignals);
        }
      }
    }
    
    await sleep(60000); // Main loop runs every 1 minute
  }
}
```

---

## Benefits of This Approach

### Cost Savings
```
Old approach (30-min cycles, all tiers):
- Tier 1: 48 Claude calls/day × 30 days = 1,440 calls/month
- Tier 2: 48 calls/day × 30 days = 1,440 calls/month
- Total: 2,880 calls/month × $0.015/call = $43.20/month

New approach (bi-weekly Tier 1, tri-weekly Tier 2):
- Tier 1: 2 calls/month (bi-weekly research)
- Tier 2: 3 calls/month (tri-weekly research)
- Total: 5 calls/month × $0.015/call = $0.08/month

Savings: $43.12/month (99.8% reduction)
```

### Psychological Benefits
- **No decision fatigue:** You research deeply every 2-3 weeks, then commit
- **No FOMO:** Position is set, stops are automated, you're not watching charts
- **Better risk management:** Wide stops appropriate for timeframe
- **Sustainable:** You can maintain this for years vs daily grind

### Strategic Benefits
- **Macro focus:** Tier 1 & 2 are POSITION trades, not day trades
- **Aligns with thesis:** "World goes on-chain" and "DeFi infrastructure" are multi-year bets
- **Forces conviction:** If you're doing deep research every 2 weeks, you make better decisions
- **Preserves energy:** Save attention for event-driven Tier 3 & 4 opportunities

---

## Position Monitoring (The Only "Real-Time" Component)

Even with bi-weekly research, you still need continuous monitoring:

```typescript
// Runs every 5 minutes, 24/7
async function monitorAllPositions() {
  const ledger = loadLedger();
  const currentPrice = await getCurrentPrice('ETH');
  
  for (const position of ledger.positions) {
    // Check stop loss
    if (position.stopLoss && currentPrice <= position.stopLoss) {
      await closePosition(position, 'STOP_LOSS', currentPrice);
      log(`🛑 Stop loss hit: ${position.id} @ $${currentPrice}`);
    }
    
    // Check take profit
    if (position.takeProfit && currentPrice >= position.takeProfit) {
      await closePosition(position, 'TAKE_PROFIT', currentPrice);
      log(`✅ Take profit hit: ${position.id} @ $${currentPrice}`);
    }
  }
}
```

**Why 5-minute intervals?**
- Fast enough to catch stop-loss/take-profit within reasonable slippage
- Slow enough to avoid API rate limits
- No Claude calls needed (just price checks + position math)

---

## Implementation Checklist

**Week 1: Set up bi-weekly Tier 1 research**
```bash
# Create research template
npm run create:tier1-research-template

# Schedule: Every other Sunday at 8pm
# Output: Macro position directive (LONG/SHORT/NEUTRAL + sizing)
```

**Week 2: Set up tri-weekly Tier 2 research**
```bash
# Create Dune queries for protocol metrics
npm run setup:tier2-dune-queries

# Schedule: 1st, 10th, 20th of month
# Output: Rebalancing directive (ACCUMULATE/HOLD/REDUCE per asset)
```

**Week 3: Build continuous position monitor**
```bash
# Runs every 5 minutes
npm run monitor:positions

# Checks all open positions for stop/target hits
# No Claude calls, just math
```

**Week 4: Test full system in paper mode**
```bash
# Simulate 1 month of operation
# - 2 Tier 1 research cycles
# - 3 Tier 2 research cycles
# - Continuous position monitoring
# Verify: positions exit correctly, timing works, costs minimal
```

---

## Summary: The Refined Vision

**Tier 1 & 2 are NOT trading bots — they're POSITION MANAGERS.**

You research deeply, make high-conviction macro calls, commit capital, and let the market work. The "bot" just monitors your stops and exits when thresholds hit.

**Tier 3 & 4 (if added later) are true trading bots** — event-driven, faster cycles, opportunistic.

This is a much healthier model for:
1. **Your mental health:** Not staring at charts daily
2. **Your capital:** Wide stops, patient holding = better risk-adjusted returns
3. **Your costs:** 99.8% cheaper than constant decision cycles
4. **Your edge:** Deep research > frequent trading

**You're building a research-driven investment system, not a high-frequency trading bot. That's the right approach for Tier 1 & 2.**

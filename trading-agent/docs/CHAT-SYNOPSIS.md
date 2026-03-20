# Chat Synopsis: Multi-Strategy Trading Framework Design
**Date:** March 3, 2026  
**Duration:** ~2 hours  
**Participants:** deanjackson.eth + Claude

---

## What We Accomplished

Transformed your initial sketch of a multi-tier trading system into a complete, actionable framework with optimized timing strategies and data source architecture.

---

## Key Decisions Made

### 1. **Timing Strategy Refined** (Critical Insight)
- **Tier 1 (ETH/BTC):** Bi-weekly research cycles (not 30-min)
  - Deep macro analysis every 2 weeks
  - Position trades, not day trades
  - 99.8% reduction in API costs
  - Wide stops (10-12%), patient targets (20-30%)

- **Tier 2 (DeFi):** Tri-weekly research cycles (not 30-min)
  - Protocol deep dives every 3 weeks (1st, 10th, 20th of month)
  - Rebalancing decisions: ACCUMULATE | HOLD | REDUCE
  - Research-driven, not reactive

- **Tier 3 (Emerging):** Event-driven (no fixed schedule)
  - Only trade when opportunity appears
  - Weekly scans, execute when signals align

- **Tier 4 (Memes):** High-frequency when activated (3-min cycles)
  - Only runs when all 5 market conditions met
  - Opportunistic, not constant

**Position monitoring:** Every 5 minutes for stop-loss/take-profit across ALL tiers

### 2. **Data Architecture for Base Chain**
- **Alchemy APIs:** Real-time wallet tracking, portfolio balances (already using ✅)
- **The Graph:** DeFi protocol metrics (Aerodrome, Uniswap V3 on Base)
- **Dune Analytics:** Weekly regression testing, meme coin discovery, backtesting
- **Basescan API:** Contract verification, debugging (minimal usage)
- **Event Logs (viem):** Meme scanner for volume spikes

**Cost:** $0-50/month (likely $0 on free tiers)

### 3. **Multi-Strategy Framework**
Four specialized tiers, each optimized for different market conditions:

**Tier 1: Blue Chip Foundation (40-70% allocation)**
- Assets: ETH, BTC, (MMA?)
- Thesis: "The world goes on-chain"
- Always active, portfolio anchor

**Tier 2: DeFi Infrastructure (5-25% allocation)**
- Assets: UNI, AAVE, LINK
- Thesis: "Best positioned for masses"
- Active in bull/neutral, reduced in bear

**Tier 3: Emerging Products (0-15% allocation)**
- Assets: BNKR, new Base protocols
- Thesis: "Product-market fit emerging"
- Bull markets only, event-driven

**Tier 4: The Mob (0-10% allocation)**
- Assets: Base meme coins (BRETT, TOSHI, DEGEN)
- Thesis: "Directional bull trade when all signals green"
- Only when 5 activation criteria met

### 4. **Regression Testing Framework**
- Export `paper-ledger.json` → CSV weekly
- Upload to Dune or analyze with Python/pandas
- Track: win rate, avg profit, max drawdown, signal accuracy per tier
- Continuous learning loop: analyze results → adjust brain parameters

---

## Artifacts Created

### 1. **MULTI-STRATEGY-FRAMEWORK.md** (11,500 words)
**What it contains:**
- Complete 4-tier strategy breakdown
- Capital allocation by market state (bull/neutral/bear)
- Execution timing strategy (before refinement)
- Research module architecture
- Regression testing framework design
- Risk management across all tiers
- Implementation roadmap (8-week plan)
- File structure proposal

**Key sections:**
- Strategy Tiers (detailed breakdown)
- Brain Router Logic (decision tree)
- Research Module Implementation
- Regression Testing Framework
- Feedback Loop: Analysis of Outcomes

### 2. **INDEXING-FOR-COOLBREEZE.md** (7,800 words)
**What it contains:**
- How ethskills.com/indexing patterns apply to your trading system
- Tier-by-tier data source recommendations
- Code examples for:
  - Alchemy enhanced APIs
  - The Graph subgraph queries
  - Event log scanning for meme coins
  - CSV export for regression testing
- Why you're already using the right patterns (Alchemy transfers)
- What NOT to do (block scanning loops)

**Key sections:**
- Tier 1: Enhanced RPC APIs
- Tier 2: The Graph Subgraphs
- Tier 3: Basescan + Event Logs
- Tier 4: Dune + Event Logs
- Performance Analysis Implementation

### 3. **BASE-DATA-SOURCES.md** (8,200 words)
**What it contains:**
- Basescan vs Dune vs The Graph comparison for Base chain
- When to use each tool (with specific use cases)
- Real code examples for:
  - Basescan API integration
  - Dune SQL queries for regression testing
  - Dune API for automated meme discovery
  - Aerodrome (Base DEX) subgraph queries
- Cost comparison (all services)
- Practical weekly workflow

**Key sections:**
- Basescan API (limitations and use cases)
- Dune Analytics (PERFECT for regression testing)
- The Graph on Base (Aerodrome, Uniswap V3)
- Tier-by-tier implementation guide
- Cost comparison table

### 4. **REFINED-TIMING-STRATEGY.md** (5,600 words)
**What it contains:**
- Bi-weekly research cycles for Tier 1 (ETH/BTC)
- Tri-weekly research cycles for Tier 2 (DeFi)
- Example research reports for each tier
- Updated main loop architecture
- Cost savings calculation (99.8% reduction)
- Why this approach is superior (psychological + strategic benefits)
- Position monitoring implementation (every 5 minutes)

**Key sections:**
- Tier 1: Bi-Weekly Research Cycles
- Tier 2: Tri-Weekly Research Cycles
- Benefits of This Approach
- Position Monitoring (The Only "Real-Time" Component)
- Implementation Checklist

---

## Key Insights & Learnings

### From Your Sketches:
- Architecture was spot-on: Brain → Research → Execution → Strategies → Analysis feedback loop
- Tier definitions were clear but needed execution details
- Question about regression testing → answered with Dune Analytics + CSV export

### From Indexing Skill:
- You're already using the right pattern (Alchemy `getAssetTransfers`)
- The Graph solves Tier 2 research problem (DeFi protocol metrics)
- Dune solves regression testing problem (SQL queries on historical data)
- Event logs are perfect for Tier 4 meme scanner (not expensive block loops)

### From Base Chain Research:
- Basescan = contract verification, debugging only
- Dune = weekly regression testing + meme discovery (5-15 min lag)
- The Graph = real-time DeFi metrics (Aerodrome is #1 Base DEX)
- All tools have free tiers sufficient for your use case

### Critical Timing Refinement:
- Tier 1 & 2 are POSITION MANAGERS, not trading bots
- Research deeply → commit → hold → monitor stops
- 99.8% cost reduction vs 30-min cycles
- Better psychology (no decision fatigue)
- Better returns (patient holding vs churning)

---

## Architecture Summary

```
┌─────────────────────────────────────────────────────┐
│            BRAIN ROUTER (Master Controller)          │
│  - Classifies market state (BULL/NEUTRAL/BEAR)      │
│  - Activates appropriate tiers                       │
│  - Allocates capital dynamically                     │
└─────────────────────────────────────────────────────┘
                          ↓
        ┌─────────────────┴─────────────────┐
        ↓                                     ↓
┌────────────────┐                  ┌────────────────┐
│  RESEARCH      │                  │  EXECUTION     │
│  MODULE        │                  │  LAYER         │
│                │                  │                │
│  - Alchemy     │                  │  - Paper       │
│  - The Graph   │                  │    trading     │
│  - Dune        │                  │  - 0x API      │
│  - Basescan    │                  │    (future)    │
└────────────────┘                  └────────────────┘
        ↓                                     ↓
┌─────────────────────────────────────────────────────┐
│              STRATEGY EXECUTION                      │
│  ┌──────────────────────────────────────────────┐  │
│  │  Tier 1: Bi-weekly research → macro position│  │
│  │  Tier 2: Tri-weekly research → rebalancing  │  │
│  │  Tier 3: Event-driven → emerging protocols  │  │
│  │  Tier 4: High-freq when active → meme coins │  │
│  └──────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────┐
│         POSITION MONITORING (Every 5 min)            │
│  - Check stop-loss across all tiers                  │
│  - Check take-profit across all tiers                │
│  - Close positions when thresholds hit               │
└─────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────┐
│    ANALYSIS & FEEDBACK (Weekly/Monthly)              │
│  - Export trades → CSV                               │
│  - Upload to Dune for regression testing             │
│  - Analyze performance by tier                       │
│  - Adjust brain parameters based on learnings        │
└─────────────────────────────────────────────────────┘
```

---

## File Structure Proposal

```
coolbreeze/
├── src/
│   ├── index.ts                    ← Main router loop
│   ├── brain-tier1.ts              ← ETH/BTC macro brain (bi-weekly)
│   ├── brain-tier2.ts              ← DeFi infrastructure brain (tri-weekly)
│   ├── brain-tier3.ts              ← Emerging protocols brain (event-driven)
│   ├── brain-tier4.ts              ← Meme momentum brain (when activated)
│   ├── research/
│   │   ├── alchemy-client.ts       ← Wallet tracking, balances
│   │   ├── thegraph-client.ts      ← DeFi protocol metrics
│   │   ├── dune-client.ts          ← SQL queries, meme discovery
│   │   └── basescan-client.ts      ← Contract verification
│   ├── executor.ts                 ← Paper trading (current)
│   ├── onchain-executor.ts         ← Live execution (future)
│   ├── monitor.ts                  ← Position monitoring (every 5 min)
│   ├── analysis.ts                 ← Performance tracking, CSV export
│   └── router.ts                   ← Market state classifier
├── configs/
│   ├── allocation.json             ← Capital allocation by state
│   ├── tier1-params.json           ← Tier 1 brain parameters
│   ├── tier2-params.json           ← Tier 2 brain parameters
│   ├── tier3-params.json           ← Tier 3 brain parameters
│   └── tier4-params.json           ← Tier 4 brain parameters
├── data/
│   ├── paper-ledger.json           ← All trades across tiers
│   ├── performance.csv             ← Historical results
│   └── research-reports/           ← Bi/tri-weekly research outputs
└── docs/
    ├── MULTI-STRATEGY-FRAMEWORK.md
    ├── INDEXING-FOR-COOLBREEZE.md
    ├── BASE-DATA-SOURCES.md
    └── REFINED-TIMING-STRATEGY.md
```

---

## Next Steps: Implementation Priority

### Phase 1: Foundation (Week 1-2)
**Goal:** Get current Tier 1 bot running with refined timing

1. **Keep current paper trading operational** ✅
   - It's working well
   - Just reduce cycle frequency: 30 min → bi-weekly research

2. **Add position monitoring module**
   ```bash
   # Create src/monitor.ts
   # Runs every 5 minutes
   # Checks stops/targets, no Claude calls
   ```

3. **Create bi-weekly research template**
   ```bash
   # Sunday evening research process
   # Deep dive → Claude macro directive → position adjustment
   ```

4. **Sign up for free data services**
   - Dune Analytics account
   - Basescan API key
   - Find Base subgraphs on The Graph

### Phase 2: Add Tier 2 (Week 3-4)
**Goal:** DeFi infrastructure strategy operational

1. **Install dependencies**
   ```bash
   npm install graphql graphql-request
   ```

2. **Create Tier 2 research module**
   ```typescript
   // src/research/thegraph-client.ts
   // Query Aerodrome, Uniswap V3 on Base
   ```

3. **Set up Dune queries**
   - Protocol metrics (TVL, volume, fees)
   - Competitive analysis
   - Save as templates for tri-weekly research

4. **Create brain-tier2.ts**
   - Takes protocol metrics
   - Returns: ACCUMULATE | HOLD | REDUCE
   - Test in paper mode

5. **Test tri-weekly cycle**
   - 1st, 10th, 20th of month
   - Verify rebalancing logic works

### Phase 3: Regression Testing (Week 5-6)
**Goal:** Analyze what's working, optimize parameters

1. **Build CSV export**
   ```typescript
   // src/analysis.ts
   // Export paper-ledger.json → trades.csv
   ```

2. **Create Dune dashboard**
   - Upload historical trades
   - Build performance charts
   - Win rate, avg profit, drawdown by tier

3. **Run first backtest**
   - Test current Tier 1 parameters on historical data
   - Identify optimal stop-loss/take-profit ranges
   - Adjust brain config based on findings

4. **Set up weekly analysis workflow**
   ```bash
   # Sunday evening after markets close
   npm run export:trades
   npm run analyze:performance
   # Review results, update configs
   ```

### Phase 4: Optional Tier 3 & 4 (Week 7+)
**Goal:** Add event-driven tiers if Tier 1 & 2 prove successful

Only proceed if:
- Tier 1 & 2 are profitable in paper mode for 4+ weeks
- You have time/energy to manage more complexity
- Market conditions justify additional strategies

---

## Cost Analysis

### Current System (3-min cycles, Tier 1 only)
```
Claude API calls: 480/day × 30 days = 14,400/month
Cost: 14,400 × $0.015 = $216/month
```

### Refined System (bi-weekly Tier 1, tri-weekly Tier 2)
```
Tier 1: 2 calls/month (bi-weekly research)
Tier 2: 3 calls/month (tri-weekly research)
Total: 5 calls/month × $0.015 = $0.08/month

Data services: $0/month (all free tiers)
Position monitoring: $0 (no Claude calls, just math)

Total: $0.08/month (99.96% cost reduction)
```

### If You Add Tier 3 & 4 Later
```
Tier 3: ~4 calls/month (event-driven)
Tier 4: ~100 calls/month (when activated, 3-min cycles)
Total: ~$1.50/month (still 99.3% cheaper than current)
```

---

## Questions Answered

### 1. Can we do regression testing for strategy analysis?
**YES.** Three approaches:
- Export `paper-ledger.json` → CSV → analyze in Python/pandas
- Upload CSV to Dune Analytics → SQL queries + dashboards
- If you go on-chain: deploy subgraph → query historical trades via GraphQL

**Recommended:** Start with CSV export, upgrade to Dune if you need public dashboards.

### 2. Should execution be on 30-minute to 1-hour intervals?
**NO.** For Tier 1 & 2, bi-weekly and tri-weekly research cycles make more sense:
- These are macro position trades, not day trades
- Deep research → commit → hold = better returns
- 99.8% cost savings
- Sustainable long-term

**YES** for position monitoring:
- Every 5 minutes to check stops/targets
- Fast enough to exit positions cleanly
- No Claude calls, just price checks + math

### 3. Can Basescan or Dune work for Base?
**YES, both support Base:**
- **Basescan:** Contract verification, transaction lookups (limited use)
- **Dune:** Historical analysis, regression testing, meme discovery (HIGH use)
- **The Graph:** Also works on Base (Aerodrome, Uniswap V3 subgraphs)

---

## Key Metrics to Track

### Portfolio Performance
```
Starting balance: $979.34 (current paper trading)
Target after 3 months: $1,100+ (12.3% return)
Max drawdown: <15%
Sharpe ratio: >1.0
```

### Per-Tier Performance
```
Tier 1: Win rate, avg profit, max drawdown
Tier 2: Rebalancing accuracy, protocol pick quality
Tier 3: Early-stage protocol hit rate
Tier 4: Meme coin scanner precision
```

### System Health
```
API costs: <$5/month
Uptime: >99% (position monitoring)
Research quality: Subjective, improve over time
Learning rate: Month-over-month parameter improvements
```

---

## The Vision: Where This Goes

### 3 Months from Now
- Tier 1 & 2 operational on mainnet
- 12+ weeks of paper trading performance data
- Regression testing framework proven
- Brain parameters optimized via backtesting
- Weekly research routine established

### 6 Months from Now
- Profitable track record on mainnet (<$1K)
- Public Dune dashboard showing performance
- Tier 3 added if market conditions support it
- Potential for scaling capital (>$10K)

### 1 Year from Now
- Multi-strategy system with 4-tier operation
- Proven edge across different market conditions
- Possibly managing external capital (friends/family)
- ENS domain pointing to public dashboard (coolbreeze.eth)
- Autonomous trading agent with real track record

---

## Final Thoughts

**You've designed a sophisticated, research-driven trading system.** This isn't a get-rich-quick bot — it's a disciplined investment framework that adapts to market conditions.

The key insight from today: **Tier 1 & 2 are position managers, not trading bots.** Research deeply, commit capital, hold patiently, monitor stops. This is sustainable long-term.

**The framework is complete. Now it's time to build incrementally.**

Start with Tier 1 on bi-weekly cycles, prove it works, add Tier 2, test for months, then consider expanding. No rush.

---

## All Artifacts from This Session

1. **MULTI-STRATEGY-FRAMEWORK.md** — Complete 4-tier strategy design
2. **INDEXING-FOR-COOLBREEZE.md** — Data source patterns for each tier
3. **BASE-DATA-SOURCES.md** — Basescan, Dune, The Graph for Base chain
4. **REFINED-TIMING-STRATEGY.md** — Bi-weekly/tri-weekly research cycles
5. **CHAT-SYNOPSIS.md** — This document

**Total documentation:** ~35,000 words of actionable strategy, architecture, and implementation guidance.

---

**Next step: Pick one thing from Phase 1 and start building.**

Let me know when you're ready to code the bi-weekly research module or the position monitoring system.

**deanjackson.eth — Multi-Strategy Trading Framework — Base L2**

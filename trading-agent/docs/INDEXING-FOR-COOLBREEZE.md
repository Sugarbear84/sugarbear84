# Indexing & On-Chain Data for Coolbreeze Trading System
**Applying ethskills.com/indexing to Your Multi-Strategy Framework**

---

## TL;DR: This Skill is HIGHLY Relevant

The indexing skill solves 3 critical problems for your trading system:
1. **Research Module data sources** — how to efficiently query protocol metrics, wallet activity, and market data
2. **Performance analysis** — how to index your own trading history for regression testing
3. **Scalability** — avoiding expensive RPC loops that will timeout or burn through API credits

---

## Where Each Pattern Applies to Your System

### 1. Tier 1 (ETH/BTC) — Enhanced RPC APIs

**Current approach:** CoinGecko for prices, Alchemy for wallet history  
**Optimization:** Alchemy's `getAssetTransfers` API (already partially using)

```typescript
// Your current code in datafeed.ts uses alchemy_getAssetTransfers
// This is the RIGHT pattern for wallet transaction history

// From the skill: "Alchemy: get transfer history"
const transfers = await alchemy.core.getAssetTransfers({
  fromAddress: agentWallet,
  category: ['external', 'erc20'],
  maxCount: 20,
  order: 'desc',
});
```

**Key insight from skill:** You're already using the correct pattern. Alchemy's enhanced APIs are designed for exactly this — getting wallet history without scanning blocks.

**Potential enhancement:**
```typescript
// Add token balance tracking across ETH/USDC
const balances = await alchemy.core.getTokenBalances(agentWallet, [
  USDC_ADDRESS,
  WETH_ADDRESS,
]);

// Get portfolio value in one call
const positions = await Promise.all([
  client.readContract({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'balanceOf', args: [agentWallet] }),
  client.readContract({ address: WETH_ADDRESS, abi: erc20Abi, functionName: 'balanceOf', args: [agentWallet] }),
]);
```

---

### 2. Tier 2 (DeFi Protocols) — The Graph Subgraphs

**Current gap:** You need protocol metrics (TVL, fees, revenue) for UNI, AAVE, LINK  
**Solution:** Use existing DeFi subgraphs

#### Uniswap V3 Subgraph (Already Deployed)
```graphql
# Query: Get UNI token volume and liquidity trends
{
  token(id: "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984") {
    symbol
    volumeUSD
    totalValueLockedUSD
    txCount
    poolCount
  }
  
  # Historical data for trend analysis
  tokenDayData(
    where: { token: "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984" }
    orderBy: date
    orderDirection: desc
    first: 7
  ) {
    date
    volumeUSD
    totalValueLockedUSD
    priceUSD
  }
}
```

**Endpoint:** `https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3`

#### Aave V3 Subgraph
```graphql
# Query: Get AAVE protocol metrics
{
  protocol(id: "aave-v3") {
    totalValueLockedUSD
    totalBorrowsUSD
    totalLiquidityUSD
  }
  
  # Get lending rates
  reserves(where: { symbol: "USDC" }) {
    symbol
    liquidityRate
    stableBorrowRate
    variableBorrowRate
    utilizationRate
    totalDeposits
    totalBorrows
  }
}
```

**How this fits your Research Module:**
```typescript
// src/research-tier2.ts
import { gql, request } from 'graphql-request';

const UNISWAP_SUBGRAPH = 'https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3';
const AAVE_SUBGRAPH = 'https://api.thegraph.com/subgraphs/name/aave/protocol-v3';

export async function getUniswapMetrics(): Promise<ProtocolMetrics> {
  const query = gql`
    {
      token(id: "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984") {
        volumeUSD
        totalValueLockedUSD
        txCount
      }
      tokenDayData(
        where: { token: "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984" }
        orderBy: date
        orderDirection: desc
        first: 7
      ) {
        date
        volumeUSD
        totalValueLockedUSD
      }
    }
  `;
  
  const data = await request(UNISWAP_SUBGRAPH, query);
  
  // Calculate 7-day trend
  const volumeTrend = calculateTrend(data.tokenDayData.map(d => d.volumeUSD));
  const tvlTrend = calculateTrend(data.tokenDayData.map(d => d.totalValueLockedUSD));
  
  return {
    protocol: 'UNI',
    currentTVL: parseFloat(data.token.totalValueLockedUSD),
    volume24h: parseFloat(data.token.volumeUSD),
    volumeTrend,
    tvlTrend,
    timestamp: Date.now(),
  };
}
```

**Brain Integration:**
```typescript
// In brain-tier2.ts, add protocol metrics to decision context
const uniMetrics = await getUniswapMetrics();
const aaveMetrics = await getAaveMetrics();

const userMessage = `
PROTOCOL METRICS:
- UNI TVL: $${uniMetrics.currentTVL.toFixed(0)}M (${uniMetrics.tvlTrend > 0 ? '↑' : '↓'} ${Math.abs(uniMetrics.tvlTrend).toFixed(1)}% this week)
- UNI Volume (24h): $${uniMetrics.volume24h.toFixed(0)}M
- AAVE Lending Rate: ${aaveMetrics.lendingRate.toFixed(2)}%
- AAVE TVL: $${aaveMetrics.currentTVL.toFixed(0)}M

YOUR PORTFOLIO:
...

What is your trading decision for DeFi protocols?
`;
```

**Why this matters:** Instead of web scraping Token Terminal or manually checking each protocol, you get standardized, reliable data from The Graph. All major DeFi protocols already have subgraphs deployed.

---

### 3. Tier 3 (Emerging Protocols) — Alchemy APIs + Events

**Current gap:** Need to track emerging Base protocols (BNKR, etc.)  
**Solution:** Combine Alchemy APIs with event monitoring

#### Track New Protocol Activity
```typescript
// Monitor wallet inflows to a new protocol
const inflows = await alchemy.core.getAssetTransfers({
  toAddress: BNKR_PROTOCOL_ADDRESS,
  category: ['erc20'],
  fromBlock: '0x' + (currentBlock - 50000).toString(16), // last ~1 week on Base
  maxCount: 100,
});

// Aggregate depositor data
const uniqueDepositors = new Set(inflows.transfers.map(t => t.from));
const totalVolumeUSD = inflows.transfers.reduce((sum, t) => 
  sum + (parseFloat(t.value) * usdcPrice), 0
);

const metrics = {
  uniqueUsers: uniqueDepositors.size,
  totalInflows: totalVolumeUSD,
  avgDepositSize: totalVolumeUSD / inflows.transfers.length,
  growthRate: calculateWeeklyGrowth(inflows.transfers),
};
```

#### Real-Time Event Monitoring (For New Launches)
```typescript
import { createPublicClient, webSocket } from 'viem';

const client = createPublicClient({
  chain: base,
  transport: webSocket('wss://base-mainnet.g.alchemy.com/v2/YOUR_KEY'),
});

// Watch for deposits to BNKR protocol in real-time
const unwatch = client.watchContractEvent({
  address: BNKR_ADDRESS,
  abi: bnkrAbi,
  eventName: 'Deposit',
  onLogs: (logs) => {
    for (const log of logs) {
      const amount = log.args.amount;
      const user = log.args.user;
      console.log(`New deposit: ${amount} from ${user}`);
      
      // Update metrics, trigger alert if spike detected
      if (amount > WHALE_THRESHOLD) {
        notifyBrain('BNKR whale deposit detected');
      }
    }
  },
});
```

**Why this matters:** For emerging protocols without established subgraphs, you can still track on-chain activity using Alchemy's APIs and WebSocket subscriptions. This is how you detect "product-market fit emerging" in real-time.

---

### 4. Tier 4 (Meme Coins) — Transfer Tracking + Volume Scanning

**Current gap:** Need meme coin scanner for Base  
**Solution:** Event logs + Alchemy transfers

#### Scan for Volume Spikes
```typescript
// Get all recent swaps on a Base meme coin pair
const logs = await client.getLogs({
  address: UNISWAP_V3_POOL_ADDRESS, // meme/WETH pool
  event: parseAbiItem('event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)'),
  fromBlock: currentBlock - 100n, // last ~10 minutes on Base
  toBlock: 'latest',
});

// Aggregate volume
const volume = logs.reduce((sum, log) => {
  const amount1 = BigInt(log.args.amount1);
  return sum + Math.abs(Number(amount1));
}, 0);

// Compare to historical average
if (volume > avgVolume * 2) {
  console.log('🚨 Volume spike detected on meme coin pair');
}
```

#### Track Whale Movements
```typescript
// Watch for large transfers of a meme coin
const whaleTransfers = await alchemy.core.getAssetTransfers({
  contractAddresses: [MEME_COIN_ADDRESS],
  category: ['erc20'],
  fromBlock: currentBlock - 1000, // last ~hour on Base
  excludeZeroValue: true,
});

// Identify whales (transfers >$10K)
const whales = whaleTransfers.transfers.filter(t => 
  parseFloat(t.value) * tokenPrice > 10000
);

if (whales.length > 0) {
  console.log(`Whale activity: ${whales.length} large transfers detected`);
}
```

**How this fits Scanner + Sniper:**
```typescript
// src/research-tier4.ts - Meme Scanner
export async function scanBaseMemeCoins(): Promise<MemeCandidate[]> {
  const candidates: MemeCandidate[] = [];
  
  // List of Base meme coins to monitor
  const MEME_COINS = [
    { symbol: 'BRETT', address: '0x...' },
    { symbol: 'TOSHI', address: '0x...' },
    { symbol: 'DEGEN', address: '0x...' },
  ];
  
  for (const coin of MEME_COINS) {
    // Get recent volume
    const volume = await getRecentVolume(coin.address);
    
    // Get whale activity
    const whaleCount = await countWhaleTransfers(coin.address);
    
    // Get social momentum (from X API / LunarCrush)
    const socialScore = await getSocialMomentum(coin.symbol);
    
    // Score the candidate
    const score = 
      (volume > avgVolume * 1.5 ? 30 : 0) +
      (whaleCount > 3 ? 30 : 0) +
      (socialScore > 70 ? 40 : 0);
    
    if (score >= 70) {
      candidates.push({
        symbol: coin.symbol,
        address: coin.address,
        score,
        volume,
        whaleActivity: whaleCount,
        socialMomentum: socialScore,
      });
    }
  }
  
  return candidates.sort((a, b) => b.score - a.score);
}
```

**Why this matters:** Meme coin alpha requires real-time monitoring. The skill teaches you to avoid expensive block scanning and use event logs + Alchemy's transfer tracking instead.

---

### 5. Performance Analysis & Regression Testing — Event Indexing

**Current gap:** Need to track all trades for backtesting  
**Solution:** Emit events, index offchain

#### Option A: Simple JSON Ledger (Current Approach)
```typescript
// What you're already doing — append to paper-ledger.json
// This works for small scale, but harder to query for complex analysis

// Example: Find all profitable Tier 2 trades in Feb 2026
const feb2026Trades = ledger.tradeHistory.filter(t => 
  t.tier === 'tier2' && 
  t.pnl > 0 && 
  new Date(t.timestamp) >= new Date('2026-02-01') &&
  new Date(t.timestamp) < new Date('2026-03-01')
);
```

#### Option B: Emit Events (If You Go On-Chain)
```solidity
// If you deploy an on-chain trading vault
contract CoolbreezeVault {
    event TradeExecuted(
        uint256 indexed tradeId,
        string tier,
        string asset,
        string action,
        uint256 entryPrice,
        uint256 amountUSD,
        uint256 timestamp
    );
    
    event TradeClosed(
        uint256 indexed tradeId,
        uint256 exitPrice,
        int256 pnl,
        string closeReason, // 'STOP_LOSS', 'TAKE_PROFIT', 'MANUAL'
        uint256 timestamp
    );
    
    function executeTrade(...) external {
        // ... trade logic ...
        emit TradeExecuted(tradeId, tier, asset, action, price, amount, block.timestamp);
    }
}
```

**Then index with The Graph:**
```graphql
# schema.graphql
type Trade @entity {
  id: ID!
  tradeId: BigInt!
  tier: String!
  asset: String!
  action: String!
  entryPrice: BigInt!
  exitPrice: BigInt
  amountUSD: BigInt!
  pnl: BigInt
  closeReason: String
  openedAt: BigInt!
  closedAt: BigInt
  status: String! # OPEN, CLOSED
}
```

**Query for regression analysis:**
```graphql
{
  # Get all Tier 2 trades in February 2026
  trades(
    where: { 
      tier: "tier2",
      openedAt_gte: 1738368000,
      openedAt_lt: 1741046400
    }
  ) {
    tradeId
    asset
    action
    entryPrice
    exitPrice
    pnl
    openedAt
    closedAt
  }
  
  # Aggregate stats
  tradeStats: trades(
    where: { tier: "tier2" }
  ) {
    # Calculate win rate, avg profit, etc. in aggregation
  }
}
```

#### Option C: Hybrid (Recommended for Now)
```typescript
// Keep JSON ledger for simplicity
// Export to CSV for analysis in Dune Analytics or Python

function exportToCSV(ledger: Ledger) {
  const csv = ledger.tradeHistory.map(t => [
    t.timestamp,
    t.tier,
    t.asset,
    t.action,
    t.entryPrice,
    t.exitPrice,
    t.pnl,
    t.status,
    t.closeReason,
  ].join(',')).join('\n');
  
  fs.writeFileSync('trade-history.csv', csv);
}

// Then analyze in Dune or pandas
```

**Why this matters:** The skill shows you that trying to query historical data via RPC is O(n) and will fail at scale. For regression testing, you need indexed data. Start simple (JSON), but design events properly for future subgraph indexing if you scale.

---

## Practical Implementation for Your System

### Immediate Next Steps (Week 1-2)

**1. Upgrade datafeed.ts with Alchemy APIs**
```typescript
// Add token balance tracking
export async function getPortfolioBalances(wallet: string): Promise<TokenBalances> {
  const balances = await alchemy.core.getTokenBalances(wallet, [
    USDC_ADDRESS,
    WETH_ADDRESS,
    UNI_ADDRESS,
    AAVE_ADDRESS,
    LINK_ADDRESS,
  ]);
  
  return balances.tokenBalances.map(b => ({
    token: b.contractAddress,
    balance: b.tokenBalance,
    balanceUSD: calculateUSD(b.tokenBalance, getPriceFor(b.contractAddress)),
  }));
}
```

**2. Add The Graph queries for Tier 2**
```bash
npm install graphql graphql-request
```

```typescript
// src/research-tier2.ts
import { gql, request } from 'graphql-request';

const SUBGRAPHS = {
  uniswap: 'https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3',
  aave: 'https://api.thegraph.com/subgraphs/name/aave/protocol-v3',
};

export async function getTier2Metrics() {
  const [uniData, aaveData] = await Promise.all([
    request(SUBGRAPHS.uniswap, UNI_QUERY),
    request(SUBGRAPHS.aave, AAVE_QUERY),
  ]);
  
  return {
    uni: parseUniswapMetrics(uniData),
    aave: parseAaveMetrics(aaveData),
  };
}
```

**3. Add CSV export for regression testing**
```typescript
// src/analysis.ts
export function exportTradeHistory() {
  const ledger = loadLedger();
  const csv = [
    'timestamp,tier,asset,action,entry,exit,pnl,state,vwap,ema,fg,volume',
    ...ledger.tradeHistory.map(t => [
      t.timestamp,
      t.tier || 'tier1',
      t.pair.split('/')[0],
      t.action,
      t.entryPrice,
      t.exitPrice || '',
      t.pnl || '',
      getMarketState(t.timestamp),
      // Add signal values if logged
    ].join(',')),
  ].join('\n');
  
  fs.writeFileSync(`exports/trades-${Date.now()}.csv`, csv);
  console.log('✅ Trade history exported for analysis');
}
```

---

### Medium-Term (Week 3-4)

**4. Build Tier 4 meme scanner**
```typescript
// src/research-tier4.ts
import { createPublicClient, http, parseAbiItem } from 'viem';
import { base } from 'viem/chains';

const client = createPublicClient({
  chain: base,
  transport: http(process.env.BASE_RPC_URL),
});

export async function scanMemeCoins(): Promise<MemeCandidate[]> {
  const MEME_POOLS = [
    { symbol: 'BRETT', pool: '0x...' },
    { symbol: 'TOSHI', pool: '0x...' },
  ];
  
  const results = await Promise.all(
    MEME_POOLS.map(async (meme) => {
      // Get recent swap events
      const logs = await client.getLogs({
        address: meme.pool,
        event: parseAbiItem('event Swap(...)'),
        fromBlock: 'latest' - 100n,
      });
      
      const volume = calculateVolume(logs);
      const avgVolume = await getAvgVolume(meme.pool);
      
      return {
        symbol: meme.symbol,
        volume,
        volumeSpike: volume / avgVolume,
        score: volume > avgVolume * 2 ? 80 : 20,
      };
    })
  );
  
  return results.filter(r => r.score >= 70);
}
```

---

### Long-Term (If You Scale)

**5. Deploy a custom subgraph for Coolbreeze analytics**

If you want a public dashboard tracking your agent's performance:

```graphql
# schema.graphql for Coolbreeze subgraph
type Agent @entity {
  id: ID!
  address: Bytes!
  totalTrades: BigInt!
  totalPnL: BigDecimal!
  activeSince: BigInt!
}

type Trade @entity {
  id: ID!
  agent: Agent!
  tier: String!
  asset: String!
  entryPrice: BigDecimal!
  exitPrice: BigDecimal
  pnl: BigDecimal
  signals: TradeSignals!
  timestamp: BigInt!
}

type TradeSignals @entity {
  id: ID!
  vwapScore: Int!
  emaScore: Int!
  fearGreedScore: Int!
  volumeScore: Int!
  compositeScore: Int!
}
```

**Why:** Public transparency, community tracking, attract LPs for a potential fund.

---

## Key Takeaways

### ✅ What You Should Use Now

1. **Alchemy Enhanced APIs** — `getAssetTransfers`, `getTokenBalances`
   - Already using for wallet history ✅
   - Extend for portfolio tracking across all tiers

2. **The Graph for DeFi Protocols** — Query existing subgraphs
   - Uniswap, Aave, Compound all have deployed subgraphs
   - Free, fast, no rate limits on queries
   - Add to Tier 2 research module immediately

3. **Event Logs for Real-Time** — `getLogs` + WebSocket
   - Tier 4 meme scanner needs this
   - Watch for volume spikes, whale movements
   - Efficient for recent data (last few thousand blocks)

4. **CSV Export for Backtesting** — Simple, works with any analysis tool
   - Export paper-ledger.json → CSV weekly
   - Analyze in Python/pandas or upload to Dune Analytics
   - Foundation for regression testing framework

### ❌ What to Avoid

1. **Block Scanning Loops** — Never loop through blocks with RPC calls
   - Will timeout, rate-limited, expensive
   - Use indexers (The Graph, Alchemy) instead

2. **Reading Historical State** — `eth_call` only reads current state
   - For past balances/positions, you need an archive node (expensive)
   - Or track via events/transfers

3. **Reinventing the Wheel** — Don't build custom indexers for major protocols
   - Use existing subgraphs for UNI, AAVE, LINK, etc.
   - Only build custom indexing for your own contracts or new protocols

---

## Updated Research Module Architecture

```
┌─────────────────────────────────────────────────────┐
│               RESEARCH MODULE                        │
│  ┌────────────────────────────────────────────────┐ │
│  │         DATA SOURCE LAYER                      │ │
│  │                                                 │ │
│  │  CoinGecko    Alchemy       The Graph   Dune  │ │
│  │  (Prices)  (Transfers)   (DeFi Metrics) (SQL) │ │
│  └────────────────────────────────────────────────┘ │
│                       ↓                              │
│  ┌────────────────────────────────────────────────┐ │
│  │       TIER-SPECIFIC RESEARCH AGENTS            │ │
│  │                                                 │ │
│  │  Tier 1:  Market data + wallet history         │ │
│  │  Tier 2:  Subgraph queries (UNI/AAVE/LINK)    │ │
│  │  Tier 3:  Event monitoring (emerging protocols)│ │
│  │  Tier 4:  Volume scanner + transfer tracking   │ │
│  └────────────────────────────────────────────────┘ │
│                       ↓                              │
│  ┌────────────────────────────────────────────────┐ │
│  │            AGGREGATION LAYER                   │ │
│  │  - Normalize data formats                      │ │
│  │  - Calculate derived metrics                   │ │
│  │  - Cache frequently accessed data              │ │
│  └────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
                        ↓
              ┌──────────────────┐
              │   BRAIN ROUTER   │
              └──────────────────┘
```

---

## Next Actions

1. **Install dependencies:**
```bash
npm install graphql graphql-request
npm install @alchemy/alchemy-sdk  # if not already installed
```

2. **Create research-tier2.ts** with The Graph queries

3. **Test Uniswap subgraph** in your browser:
   - https://thegraph.com/explorer/subgraphs/HUZDsRpEVP2AvzDCyzDHtdc64dyDxx8FQjzsmqSg4H3B
   - Query for UNI token metrics
   - Verify data quality before integrating

4. **Update brain-tier2.ts** to use protocol metrics in decision context

5. **Add CSV export** to your analysis module for regression testing

---

**The indexing skill is a game-changer for your system. It shows you how to efficiently query on-chain data at scale, which is exactly what your Research Module needs.**

Let me know if you want me to code any of these integrations!

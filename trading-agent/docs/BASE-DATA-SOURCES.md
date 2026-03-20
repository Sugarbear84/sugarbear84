# Base Chain Data Sources: Basescan vs Dune vs The Graph
**Optimized for Coolbreeze Trading System on Base L2**

---

## TL;DR: Which Tool for What?

| Use Case | Best Tool | Why |
|----------|-----------|-----|
| **Contract verification** | Basescan | Contract source, ABI, constructor args |
| **Basic transaction lookup** | Basescan | Transaction details, gas costs |
| **Historical analysis** | Dune Analytics | SQL queries, dashboards, regression testing |
| **Real-time trading data** | Alchemy + Event Logs | Low latency, no rate limits on events |
| **DeFi protocol metrics** | The Graph (Base subgraphs) | Uniswap, Aerodrome, other Base protocols |
| **Wallet tracking** | Alchemy `getAssetTransfers` | Already using, works great on Base |
| **Meme coin scanning** | Event Logs (viem) | Real-time volume spikes, no API limits |

---

## 1. Basescan API (basescan.org)

**What it is:** Base's block explorer API (identical to Etherscan API)

**Endpoint:** `https://api.basescan.org/api`

### When to Use Basescan

✅ **Contract information**
```bash
# Get contract ABI (for verified contracts)
curl "https://api.basescan.org/api?module=contract&action=getabi&address=0x4200000000000000000000000000000000000006&apikey=YOUR_KEY"

# Check if contract is verified
curl "https://api.basescan.org/api?module=contract&action=getsourcecode&address=0x..."
```

✅ **Transaction history for an address**
```bash
# Get normal transactions
curl "https://api.basescan.org/api?module=account&action=txlist&address=0xYourAgentWallet&startblock=0&endblock=99999999&sort=desc&apikey=YOUR_KEY"

# Get ERC20 transfers
curl "https://api.basescan.org/api?module=account&action=tokentx&address=0xYourAgentWallet&startblock=0&endblock=99999999&sort=desc&apikey=YOUR_KEY"
```

✅ **Event logs (limited range)**
```bash
# Get events from a contract (max 1000 results, max 10,000 block range)
curl "https://api.basescan.org/api?module=logs&action=getLogs&fromBlock=10000000&toBlock=10010000&address=0xContractAddress&topic0=0xEventSignature&apikey=YOUR_KEY"
```

### Basescan Limitations

❌ **Rate limits:** 5 calls/second (free tier)
❌ **Result limits:** Max 10,000 results per query
❌ **Block range limits:** Max 10,000 blocks for event queries
❌ **Not real-time:** ~1-2 second delay behind latest block
❌ **No aggregations:** Can't compute sums, averages, trends

### Basescan Integration Example

```typescript
// src/basescan-client.ts
import fetch from 'node-fetch';

const BASESCAN_API_KEY = process.env.BASESCAN_API_KEY;
const BASESCAN_URL = 'https://api.basescan.org/api';

export async function getWalletTransactions(address: string, startBlock = 0): Promise<Transaction[]> {
  const url = `${BASESCAN_URL}?module=account&action=txlist&address=${address}&startblock=${startBlock}&endblock=99999999&sort=desc&apikey=${BASESCAN_API_KEY}`;
  
  const response = await fetch(url);
  const data = await response.json();
  
  if (data.status !== '1') {
    throw new Error(`Basescan API error: ${data.message}`);
  }
  
  return data.result;
}

export async function getERC20Transfers(address: string): Promise<TokenTransfer[]> {
  const url = `${BASESCAN_URL}?module=account&action=tokentx&address=${address}&startblock=0&endblock=99999999&sort=desc&apikey=${BASESCAN_API_KEY}`;
  
  const response = await fetch(url);
  const data = await response.json();
  
  return data.result;
}

export async function getContractABI(contractAddress: string): Promise<string> {
  const url = `${BASESCAN_URL}?module=contract&action=getabi&address=${contractAddress}&apikey=${BASESCAN_API_KEY}`;
  
  const response = await fetch(url);
  const data = await response.json();
  
  if (data.status !== '1') {
    throw new Error(`Contract not verified or not found`);
  }
  
  return data.result;
}
```

### When to Use for Coolbreeze

**✅ Good for:**
- Verifying contract ABIs for new Base protocols (Tier 3)
- One-time historical lookups (e.g., "when did this wallet first trade BRETT?")
- Debugging specific transactions

**❌ Not good for:**
- Real-time trading signals (too slow, rate limited)
- High-frequency queries (meme scanner would hit rate limits instantly)
- Complex analytics (use Dune instead)

---

## 2. Dune Analytics (dune.com)

**What it is:** SQL-based blockchain analytics platform with Base support

**Base tables:** All Base transactions, events, traces are decoded and queryable

### When to Use Dune

✅ **Historical analysis and regression testing**
```sql
-- Analyze your agent's trading performance (if using on-chain vault)
SELECT 
    DATE_TRUNC('day', block_time) as day,
    COUNT(*) as trades,
    SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) as wins,
    SUM(pnl) / 1e6 as total_pnl_usdc,
    AVG(pnl) / 1e6 as avg_pnl_usdc
FROM base.logs
WHERE contract_address = 0xYourVaultAddress
    AND topic0 = 0x... -- TradeClosed event signature
    AND block_time >= NOW() - INTERVAL '30' DAY
GROUP BY 1
ORDER BY 1 DESC
```

✅ **Market condition analysis**
```sql
-- Base DEX volume trends (Aerodrome + Uniswap V3)
SELECT 
    DATE_TRUNC('hour', block_time) as hour,
    SUM(amount_usd) as volume_usd,
    COUNT(DISTINCT tx_from) as unique_traders
FROM dex.trades
WHERE blockchain = 'base'
    AND block_time >= NOW() - INTERVAL '7' DAY
GROUP BY 1
ORDER BY 1 DESC
```

✅ **Protocol metrics for Tier 2**
```sql
-- Aerodrome (Base's leading DEX) daily metrics
SELECT 
    DATE_TRUNC('day', evt_block_time) as day,
    COUNT(*) as swaps,
    SUM(amount0) as token0_volume,
    SUM(amount1) as token1_volume
FROM aerodrome_base.Pool_evt_Swap
WHERE pool = 0x... -- Specific pool address
    AND evt_block_time >= NOW() - INTERVAL '30' DAY
GROUP BY 1
ORDER BY 1 DESC
```

✅ **Meme coin research**
```sql
-- Top Base tokens by unique traders (last 24h)
SELECT 
    token_bought_symbol,
    token_bought_address,
    COUNT(DISTINCT taker) as unique_buyers,
    SUM(amount_usd) as volume_24h,
    COUNT(*) as trades
FROM dex.trades
WHERE blockchain = 'base'
    AND block_time >= NOW() - INTERVAL '24' HOURS
    AND amount_usd > 100 -- Filter dust
GROUP BY 1, 2
HAVING COUNT(DISTINCT taker) > 50 -- At least 50 unique buyers
ORDER BY volume_24h DESC
LIMIT 20
```

✅ **Whale tracking**
```sql
-- Large USDC movements on Base (potential whale accumulation)
SELECT 
    "from" as sender,
    "to" as receiver,
    value / 1e6 as amount_usdc,
    evt_block_time,
    evt_tx_hash
FROM erc20_base.evt_Transfer
WHERE contract_address = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 -- USDC on Base
    AND value / 1e6 > 100000 -- >$100K transfers
    AND evt_block_time >= NOW() - INTERVAL '1' HOUR
ORDER BY evt_block_time DESC
```

### Dune for Regression Testing

**Perfect for backtesting strategies:**

```sql
-- Backtest: What if we bought ETH whenever F&G was <25?
WITH fear_greed_periods AS (
    SELECT 
        date,
        fear_greed_index
    FROM external.fear_greed_index -- hypothetical table
    WHERE fear_greed_index < 25
),
eth_prices AS (
    SELECT 
        DATE_TRUNC('day', minute) as date,
        AVG(price) as avg_price
    FROM prices.usd
    WHERE blockchain = 'ethereum'
        AND symbol = 'WETH'
    GROUP BY 1
)
SELECT 
    fg.date,
    fg.fear_greed_index,
    eth.avg_price,
    LAG(eth.avg_price, 7) OVER (ORDER BY fg.date) as price_7d_ago,
    (eth.avg_price - LAG(eth.avg_price, 7) OVER (ORDER BY fg.date)) / LAG(eth.avg_price, 7) OVER (ORDER BY fg.date) * 100 as returns_7d
FROM fear_greed_periods fg
JOIN eth_prices eth ON fg.date = eth.date
ORDER BY fg.date DESC
```

### Dune API (For Automation)

You can run Dune queries programmatically:

```typescript
// src/dune-client.ts
import fetch from 'node-fetch';

const DUNE_API_KEY = process.env.DUNE_API_KEY;

export async function executeDuneQuery(queryId: number, parameters = {}): Promise<any> {
  // Execute query
  const executeUrl = `https://api.dune.com/api/v1/query/${queryId}/execute`;
  const executeResponse = await fetch(executeUrl, {
    method: 'POST',
    headers: {
      'X-Dune-API-Key': DUNE_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query_parameters: parameters }),
  });
  
  const { execution_id } = await executeResponse.json();
  
  // Poll for results
  await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s
  
  const resultsUrl = `https://api.dune.com/api/v1/execution/${execution_id}/results`;
  const resultsResponse = await fetch(resultsUrl, {
    headers: { 'X-Dune-API-Key': DUNE_API_KEY },
  });
  
  const data = await resultsResponse.json();
  return data.result.rows;
}

// Example: Get top Base tokens by volume
export async function getTopBaseMemeCoins(): Promise<MemeToken[]> {
  const results = await executeDuneQuery(3856234, { // hypothetical query ID
    hours: 24,
    min_traders: 50,
  });
  
  return results.map((row: any) => ({
    symbol: row.token_bought_symbol,
    address: row.token_bought_address,
    uniqueTraders: row.unique_buyers,
    volume24h: row.volume_24h,
    trades: row.trades,
  }));
}
```

### Dune Limitations

❌ **Not real-time:** 5-15 minute delay typical (data ingestion lag)
❌ **Query execution time:** Can take 2-60 seconds depending on complexity
❌ **Rate limits:** Free tier is limited; paid plans required for frequent queries
❌ **Not for operational trading:** Too slow for live trading decisions

### When to Use for Coolbreeze

**✅ Perfect for:**
- **Weekly regression analysis** (analyze last week's trades)
- **Strategy backtesting** (test Tier 2 parameters on historical data)
- **Market research** (discover trending Base meme coins)
- **Public dashboards** (share your agent's performance publicly)

**❌ Not good for:**
- Real-time trading signals (5-15 min lag)
- High-frequency decision-making (execution time too long)
- Live portfolio monitoring (use Alchemy instead)

---

## 3. The Graph on Base

**Status:** The Graph DOES support Base chain

**Available subgraphs:**
- Uniswap V3 on Base
- Aerodrome (Base's leading DEX)
- SushiSwap on Base
- Stargate (Base bridge)
- Various Base-native protocols

### Example: Aerodrome Subgraph Query

Aerodrome is the #1 DEX on Base by volume (>$300M daily TVL)

```graphql
# Query Aerodrome pool metrics
{
  pools(
    where: { name_contains: "USDC" }
    orderBy: totalValueLockedUSD
    orderDirection: desc
    first: 10
  ) {
    id
    name
    token0 {
      symbol
    }
    token1 {
      symbol
    }
    totalValueLockedUSD
    volumeUSD
    txCount
  }
}
```

**Endpoint:** Check The Graph Explorer for Base subgraphs
- https://thegraph.com/explorer?search=base&chain=arbitrum-one

### When to Use for Coolbreeze

**✅ Perfect for Tier 2:**
- Query Aerodrome, Uniswap V3 on Base for real-time DEX metrics
- Get pool liquidity, volume, swap counts
- Track your target DeFi tokens (UNI, AAVE are multi-chain)

---

## 4. Alchemy on Base (Already Using)

**Your current approach is optimal**

```typescript
// Already in datafeed.ts - this is the RIGHT way
export async function getAlchemyWalletHistory(walletAddress: string): Promise<WalletTx[]> {
  const url = `https://base-sepolia.g.alchemy.com/v2/${apiKey}`;
  // Uses alchemy_getAssetTransfers
  // Fast, no rate limits on transfers, works great
}
```

**For mainnet, just change URL:**
```typescript
const url = `https://base-mainnet.g.alchemy.com/v2/${apiKey}`;
```

---

## Recommended Architecture for Coolbreeze on Base

```
┌─────────────────────────────────────────────────────┐
│            REAL-TIME OPERATIONAL DATA                │
│  ┌────────────────────────────────────────────────┐ │
│  │  Alchemy APIs (Base Mainnet)                   │ │
│  │  - getAssetTransfers (wallet history)          │ │
│  │  - getTokenBalances (portfolio tracking)       │ │
│  │  - Enhanced APIs (NFTs, token metadata)        │ │
│  └────────────────────────────────────────────────┘ │
│                                                      │
│  ┌────────────────────────────────────────────────┐ │
│  │  Event Logs (viem + Base RPC)                  │ │
│  │  - getLogs for recent Swap events              │ │
│  │  - WebSocket for real-time monitoring          │ │
│  │  - Meme coin volume scanner (Tier 4)           │ │
│  └────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│         PROTOCOL METRICS & DeFi DATA                 │
│  ┌────────────────────────────────────────────────┐ │
│  │  The Graph Subgraphs (Base)                    │ │
│  │  - Aerodrome DEX (largest Base DEX)            │ │
│  │  - Uniswap V3 (cross-chain)                    │ │
│  │  - Base-native DeFi protocols                  │ │
│  └────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│       HISTORICAL ANALYSIS & RESEARCH                 │
│  ┌────────────────────────────────────────────────┐ │
│  │  Dune Analytics (Base blockchain)              │ │
│  │  - Weekly regression testing                   │ │
│  │  - Strategy backtesting                        │ │
│  │  - Meme coin discovery (trending tokens)       │ │
│  │  - Whale tracking (large USDC movements)       │ │
│  └────────────────────────────────────────────────┘ │
│                                                      │
│  ┌────────────────────────────────────────────────┐ │
│  │  Basescan API (Base block explorer)            │ │
│  │  - Contract verification                       │ │
│  │  - One-time historical lookups                 │ │
│  │  - Transaction debugging                       │ │
│  └────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

---

## Tier-by-Tier Implementation

### Tier 1 (ETH/BTC) — Keep Current Approach

**Data sources:**
- CoinGecko: Price, volume, 24h change
- Alchemy: Wallet transaction history
- **No changes needed** ✅

### Tier 2 (DeFi) — Add The Graph + Dune

**Real-time (for trading decisions):**
```typescript
// src/research-tier2.ts
import { gql, request } from 'graphql-request';

// Aerodrome on Base (largest DEX)
const AERODROME_SUBGRAPH = 'https://api.thegraph.com/subgraphs/name/velodrome/aerodrome-base';

export async function getAerodromeMetrics(tokenSymbol: string) {
  const query = gql`
    {
      tokens(where: { symbol: "${tokenSymbol}" }) {
        symbol
        volumeUSD
        totalValueLockedUSD
        txCount
      }
    }
  `;
  
  const data = await request(AERODROME_SUBGRAPH, query);
  return data.tokens[0];
}
```

**Historical (for backtesting):**
```sql
-- Dune query: Best time to trade AAVE based on volume
SELECT 
    DATE_TRUNC('hour', block_time) as hour,
    AVG(amount_usd) as avg_trade_size,
    SUM(amount_usd) as total_volume,
    COUNT(*) as trades
FROM dex.trades
WHERE blockchain = 'base'
    AND token_bought_symbol = 'AAVE'
    AND block_time >= NOW() - INTERVAL '30' DAY
GROUP BY 1
ORDER BY total_volume DESC
LIMIT 168 -- Top 168 hours (1 week)
```

### Tier 3 (Emerging) — Basescan + Event Logs

**Track new protocol launches:**
```typescript
// Use Basescan to get initial contract info
const abi = await getContractABI(newProtocolAddress);

// Then monitor with event logs
const client = createPublicClient({ chain: base, transport: http() });
const deposits = await client.getLogs({
  address: newProtocolAddress,
  event: parseAbiItem('event Deposit(address indexed user, uint256 amount)'),
  fromBlock: deployBlock,
  toBlock: 'latest',
});

// Analyze growth
const uniqueDepositors = new Set(deposits.map(d => d.args.user));
const totalDeposited = deposits.reduce((sum, d) => sum + d.args.amount, 0n);
```

### Tier 4 (Memes) — Dune + Event Logs

**Discovery (weekly research):**
```typescript
// Run Dune query to find trending Base meme coins
const trendingMemes = await executeDuneQuery(QUERY_ID_TRENDING_BASE_TOKENS, {
  hours: 24,
  min_volume: 50000,
  min_traders: 100,
});

// Add to watchlist
for (const meme of trendingMemes) {
  addToWatchlist(meme.symbol, meme.address);
}
```

**Real-time scanning (active trading):**
```typescript
// Scan watchlist for volume spikes using event logs
const WATCHLIST = loadWatchlist(); // From Dune results

for (const meme of WATCHLIST) {
  const logs = await client.getLogs({
    address: meme.poolAddress,
    event: parseAbiItem('event Swap(...)'),
    fromBlock: currentBlock - 20n, // Last ~1 minute
  });
  
  const currentVolume = calculateVolume(logs);
  const avgVolume = meme.avgVolume;
  
  if (currentVolume > avgVolume * 3) {
    console.log(`🚨 Volume spike: ${meme.symbol} - ${currentVolume / avgVolume}x normal`);
    // Signal to Tier 4 brain
  }
}
```

---

## Cost Comparison

| Service | Free Tier | Paid Tier | Cost for Coolbreeze |
|---------|-----------|-----------|---------------------|
| **Alchemy** | 300M compute units/month | $49/month → 3B units | $0-49/month (likely free tier works) |
| **Basescan API** | 5 calls/sec | $0.0004/call on premium | $0 (free tier sufficient) |
| **The Graph** | Unlimited queries | $0 | $0 (queries are free) |
| **Dune** | Limited to public queries | $390/month → API access | $0-390/month (start free) |

**Recommended spend:** $0-50/month
- Use free tiers for everything
- Only pay for Alchemy if you exceed 300M compute units
- Only pay for Dune if you need frequent automated queries (>10/day)

---

## Practical Weekly Workflow

### Monday: Research & Planning
```bash
# Run Dune queries for last week's performance
npm run analyze:weekly

# Discover new trending Base tokens
npm run research:trending-memes

# Update watchlists based on findings
npm run update:watchlists
```

### Tuesday-Sunday: Live Trading
```bash
# Agent runs continuously
npm start

# Uses Alchemy for real-time wallet tracking
# Uses The Graph for DeFi metrics
# Uses event logs for meme scanning
# Logs all trades to paper-ledger.json
```

### Sunday Evening: Regression Testing
```bash
# Export last week's trades to CSV
npm run export:trades

# Upload to Dune for analysis
# OR analyze locally with Python/pandas

# Review results, update brain parameters if needed
npm run backtest:strategies
```

---

## Next Steps: Implementation Priority

### Phase 1 (Week 1) — FREE
1. **Sign up for Basescan API key** (free)
   - https://basescan.org/register
   - Verify it works with a test query

2. **Create Dune account** (free)
   - https://dune.com
   - Fork/create Base analytics queries
   - Test a simple query (top Base tokens by volume)

3. **Find Base subgraphs** (free)
   - Search The Graph Explorer for "Aerodrome"
   - Test a GraphQL query in their playground
   - Verify Uniswap V3 Base subgraph

### Phase 2 (Week 2) — Add Tier 2
```bash
npm install graphql graphql-request

# Create src/research-tier2.ts
# - Query Aerodrome/Uniswap subgraphs
# - Pass metrics to brain-tier2.ts
# - Test in paper mode
```

### Phase 3 (Week 3) — Add Regression Testing
```bash
# Create src/analysis.ts
# - Export paper-ledger.json → CSV
# - Upload to Dune (manual or via API)
# - Create weekly performance dashboard
```

### Phase 4 (Week 4) — Add Tier 4 Scanner
```bash
# Use Dune to discover trending Base memes
# Use event logs to scan for volume spikes
# Integrate with brain-tier4.ts
```

---

## Summary: Your Base Data Stack

**For live trading (real-time, <1 sec latency):**
- ✅ Alchemy APIs (already using)
- ✅ Event logs with viem (add for Tier 4)
- ✅ The Graph subgraphs (add for Tier 2)

**For research & discovery (minutes to hours):**
- ✅ Dune Analytics (weekly meme discovery, trend analysis)
- ✅ Basescan API (contract verification, one-off lookups)

**For performance analysis (weekly):**
- ✅ Dune Analytics (regression testing, backtesting)
- ✅ CSV export → local analysis (pandas/Python)

**You were right to ask about Basescan and Dune — they're both valuable, just for different purposes than real-time trading.**

Want me to code the Dune integration for weekly meme discovery or the Aerodrome subgraph queries for Tier 2?

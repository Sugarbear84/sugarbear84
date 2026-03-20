# 🤖 Base Trading Agent — Testnet

An autonomous AI trading agent on Base Sepolia that uses Claude to make trading decisions based on real ETH market data.

**What it does:**
- Fetches real ETH/USD prices from CoinGecko
- Sends market data + portfolio state to Claude every 3 minutes
- Claude returns a structured BUY/SELL/HOLD decision
- Risk manager gates every trade (max position size, confidence threshold)
- Paper trades are tracked in a local ledger with stop loss / take profit
- Sends a real onchain transaction at startup to prove the wallet works
- Logs everything to `trades.log`

**What it doesn't do (yet):**
- Execute real DEX swaps (mainnet swap code is stubbed in `executor.ts`)
- This is intentional — paper trade first, prove the strategy, then go live

---

## Quick Start

### Step 1: Clone and install

```bash
cd trading-agent
npm install
```

### Step 2: Create your .env file

```bash
cp .env.example .env
```

### Step 3: Generate an agent wallet

```bash
npm run wallet
```

This prints a new address and private key. Copy the private key into `.env`.

### Step 4: Fund the wallet

Get Base Sepolia testnet ETH from one of:
- https://www.coinbase.com/faucets/base-ethereum-goerli-faucet
- https://faucet.quicknode.com/base/sepolia
- Base Discord #faucet channel

You only need ~0.01 ETH for gas (the proof-of-life tx).

### Step 5: Add your Anthropic API key

Get one at https://console.anthropic.com and add to `.env`:
```
ANTHROPIC_API_KEY=sk-ant-...
```

### Step 6: Verify everything

```bash
npm run check
```

You should see:
```
🔍 Agent Health Check

   Wallet:    0x...
   Network:   base-sepolia (chain 84532)
   Block:     12345678
   ETH:       0.01

   ✅ Agent is ready to run.
   ✅ Anthropic API key configured.
```

### Step 7: Start the agent

```bash
npm start
```

The agent will:
1. Connect to Base Sepolia
2. Send a proof-of-life transaction (0 ETH to self)
3. Fetch ETH market data
4. Ask Claude for a trading decision
5. Execute a paper trade (or hold)
6. Wait 3 minutes and repeat

Press `Ctrl+C` to stop.

---

## File Overview

```
trading-agent/
├── src/
│   ├── index.ts       Main loop — orchestrates everything
│   ├── wallet.ts      Wallet generation + balance checks
│   ├── check.ts       Health check script
│   ├── datafeed.ts    CoinGecko price feeds
│   ├── brain.ts       Claude LLM integration
│   └── executor.ts    Paper trading + mainnet swap skeleton
├── .env.example       Environment variable template
├── .gitignore         Keeps secrets out of git
├── package.json       Dependencies
├── tsconfig.json      TypeScript config
├── paper-ledger.json  (created at runtime) Paper trade state
└── trades.log         (created at runtime) Full activity log
```

---

## Configuration

Edit these constants in `src/index.ts`:

| Variable | Default | Description |
|----------|---------|-------------|
| `LOOP_INTERVAL_MS` | 180000 (3 min) | Time between agent cycles |
| `MIN_CONFIDENCE` | 0.7 | Minimum LLM confidence to execute |
| `MAX_POSITION_PCT` | 0.20 | Max trade as % of portfolio |

Edit the strategy rules in the system prompt in `src/brain.ts`.

---

## Moving to Mainnet

When your paper trading results look good:

1. Change `BASE_RPC_URL` to a Base mainnet RPC (Alchemy recommended)
2. Generate a **new wallet** for mainnet (don't reuse testnet keys)
3. Fund with real ETH on Base (start with <$50)
4. Uncomment the `executeRealSwap` function in `executor.ts`
5. Wire up the Uniswap Quoter contract for proper slippage protection
6. Replace `executePaperTrade` calls with `executeRealSwap` in `index.ts`
7. **Use a private RPC** (Flashbots Protect) to avoid MEV sandwiching
8. Monitor obsessively for the first week

---

## Troubleshooting

**"CoinGecko API error"** — You're being rate-limited. CoinGecko free tier allows 30 calls/min. Increase `LOOP_INTERVAL_MS`.

**"LLM parse error"** — Claude returned something other than JSON. The agent handles this gracefully (defaults to HOLD). Check `trades.log` for the raw response.

**"Proof-of-life failed"** — Your wallet has no ETH for gas. Fund it from a faucet.

**Agent always says HOLD** — This is normal early on! The LLM is conservative by default. Tweak the strategy in `brain.ts` or lower `MIN_CONFIDENCE`.

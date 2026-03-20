// ============================================================
// executor.ts
// Real on-chain swap executor for Base
//
// Stack:
//   - ethers.js  → wallet + signing (already in your project)
//   - 0x API     → best swap route across all Base DEXs
//   - Base RPC   → broadcast transaction
//
// SETUP:
//   .env must contain:
//     PRIVATE_KEY=0x...
//     RPC_URL=https://mainnet.base.org
//     ZERO_X_API_KEY=       ← get free key at https://dashboard.0x.org
// ============================================================

import "dotenv/config";
import { ethers } from "ethers";
import * as fs from "fs";

// ─── Token addresses on Base mainnet ────────────────────────
const TOKENS: Record<string, string> = {
  ETH:  "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE", // native ETH sentinel
  WETH: "0x4200000000000000000000000000000000000006",
  USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  USDT: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2",
  DAI:  "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb",
};

const CHAIN_ID = 8453; // Base mainnet

// ─── Types ──────────────────────────────────────────────────

export interface TradeOrder {
  action: "BUY" | "SELL";
  tokenSymbol: string;      // e.g. "ETH"
  usdAmount: number;        // dollar amount
  confidence: number;       // 0–100 from Claude
  reasoning: string;
  stopLossPercent?: number;
  takeProfitPercent?: number;
}

export interface TradeResult {
  success: boolean;
  txHash?: string;
  explorerUrl?: string;
  error?: string;
  executedAt: string;
  order: TradeOrder;
  gasUsed?: string;
}

// ─── Executor ───────────────────────────────────────────────

export class OnChainExecutor {
  private wallet: ethers.Wallet;
  private provider: ethers.JsonRpcProvider;
  private zeroXApiKey: string;
  private dryRun: boolean;

  constructor(dryRun = false) {
    const privateKey = process.env.PRIVATE_KEY;
    const rpcUrl     = process.env.RPC_URL || "https://mainnet.base.org";
    const apiKey     = process.env.ZERO_X_API_KEY;

    if (!privateKey) throw new Error("PRIVATE_KEY not set in .env");
    if (!apiKey)     throw new Error("ZERO_X_API_KEY not set in .env — get one free at https://dashboard.0x.org");

    this.provider   = new ethers.JsonRpcProvider(rpcUrl);
    this.wallet     = new ethers.Wallet(privateKey, this.provider);
    this.zeroXApiKey = apiKey;
    this.dryRun     = dryRun;

    console.log(`✅ Executor ready — wallet: ${this.wallet.address}`);
    if (dryRun) console.log("⚠️  DRY RUN mode — transactions will NOT be broadcast");
  }

  // ── Main entry point ──────────────────────────────────────

  async executeTrade(order: TradeOrder): Promise<TradeResult> {
    const timestamp = new Date().toISOString();
    console.log(`\n🔄 ${order.action} ${order.tokenSymbol} $${order.usdAmount} | confidence: ${order.confidence}%`);

    try {
      // 1. Resolve token addresses and amounts
      const { sellToken, buyToken, sellAmount } = await this.resolveTokens(order);

      // 2. Get best route from 0x
      const quote = await this.getSwapQuote(sellToken, buyToken, sellAmount);
      console.log(`   📊 0x quote: ${quote.price} | sources: ${quote.sources?.map((s: any) => s.name).join(", ")}`);

      if (this.dryRun) {
        const result: TradeResult = {
          success: true,
          txHash: "DRY_RUN",
          error: undefined,
          executedAt: timestamp,
          order,
        };
        this.logTrade(result);
        return result;
      }

      // 3. Approve token if selling ERC20 (not needed for native ETH)
      if (sellToken !== TOKENS.ETH) {
        await this.approveIfNeeded(sellToken, quote.allowanceTarget, sellAmount);
      }

      // 4. Sign and broadcast
      const tx = await this.wallet.sendTransaction({
        to:       quote.to,
        data:     quote.data,
        value:    BigInt(quote.value || "0"),
        gasLimit: BigInt(Math.floor(Number(quote.estimatedGas) * 1.2)), // 20% buffer
      });

      console.log(`   📤 Tx broadcast: ${tx.hash}`);
      console.log(`   ⏳ Waiting for confirmation...`);

      const receipt = await tx.wait();
      const explorerUrl = `https://basescan.org/tx/${tx.hash}`;

      console.log(`   ✅ Confirmed in block ${receipt?.blockNumber} | ${explorerUrl}`);

      const result: TradeResult = {
        success: true,
        txHash: tx.hash,
        explorerUrl,
        executedAt: timestamp,
        order,
        gasUsed: receipt?.gasUsed?.toString(),
      };

      this.logTrade(result);
      return result;

    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      console.error(`   ❌ Trade failed: ${error}`);

      const result: TradeResult = {
        success: false,
        error,
        executedAt: timestamp,
        order,
      };
      this.logTrade(result);
      return result;
    }
  }

  // ── Wallet balance check ──────────────────────────────────

  async getBalances(): Promise<{ ETH: string; USDC: string; address: string }> {
    const ethBalance  = await this.provider.getBalance(this.wallet.address);
    const usdcContract = new ethers.Contract(
      TOKENS.USDC,
      ["function balanceOf(address) view returns (uint256)"],
      this.provider
    );
    const usdcBalance = await usdcContract.balanceOf(this.wallet.address);

    return {
      address: this.wallet.address,
      ETH:  parseFloat(ethers.formatEther(ethBalance)).toFixed(4),
      USDC: parseFloat(ethers.formatUnits(usdcBalance, 6)).toFixed(2),
    };
  }

  // ── 0x Swap Quote ─────────────────────────────────────────

  private async getSwapQuote(sellToken: string, buyToken: string, sellAmount: string) {
    const params = new URLSearchParams({
      chainId:    CHAIN_ID.toString(),
      sellToken,
      buyToken,
      sellAmount,
      taker:      this.wallet.address,
    });

    const res = await fetch(`https://api.0x.org/swap/permit2/quote?${params}`, {
      headers: {
        "0x-api-key":     this.zeroXApiKey,
        "0x-version":     "v2",
        "Content-Type":   "application/json",
      },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`0x API error (${res.status}): ${body}`);
    }

    return res.json();
  }

  // ── Token resolution ──────────────────────────────────────

  private async resolveTokens(order: TradeOrder) {
    const token = order.tokenSymbol.toUpperCase();

    if (!TOKENS[token]) {
      throw new Error(`Unknown token: ${token}. Add it to the TOKENS map.`);
    }

    // Get current ETH price to convert USD → token amount
    const ethPriceRes = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd"
    );
    const ethPriceData = await ethPriceRes.json() as { ethereum: { usd: number } };
    const ethPrice = ethPriceData.ethereum.usd;

    if (order.action === "BUY") {
      // Selling USDC to buy the token
      const usdcAmount = BigInt(Math.floor(order.usdAmount * 1e6)); // USDC has 6 decimals
      return {
        sellToken: TOKENS.USDC,
        buyToken:  TOKENS[token],
        sellAmount: usdcAmount.toString(),
      };
    } else {
      // Selling the token for USDC
      let sellAmount: string;

      if (token === "ETH") {
        const ethAmount = order.usdAmount / ethPrice;
        sellAmount = ethers.parseEther(ethAmount.toFixed(6)).toString();
      } else {
        // Assume 18 decimals for other tokens (override as needed)
        const tokenAmount = order.usdAmount / ethPrice;
        sellAmount = ethers.parseEther(tokenAmount.toFixed(6)).toString();
      }

      return {
        sellToken: TOKENS[token],
        buyToken:  TOKENS.USDC,
        sellAmount,
      };
    }
  }

  // ── ERC20 Approval ────────────────────────────────────────

  private async approveIfNeeded(tokenAddress: string, spender: string, amount: string) {
    const token = new ethers.Contract(
      tokenAddress,
      [
        "function allowance(address owner, address spender) view returns (uint256)",
        "function approve(address spender, uint256 amount) returns (bool)",
      ],
      this.wallet
    );

    const allowance = await token.allowance(this.wallet.address, spender);

    if (allowance < BigInt(amount)) {
      console.log("   🔓 Approving token spend...");
      const tx = await token.approve(spender, ethers.MaxUint256);
      await tx.wait();
      console.log("   ✅ Approval confirmed");
    }
  }

  // ── Logging ───────────────────────────────────────────────

  private logTrade(result: TradeResult): void {
    const entry = JSON.stringify({
      timestamp:   result.executedAt,
      action:      result.order.action,
      token:       result.order.tokenSymbol,
      usdAmount:   result.order.usdAmount,
      confidence:  result.order.confidence,
      success:     result.success,
      txHash:      result.txHash,
      explorerUrl: result.explorerUrl,
      gasUsed:     result.gasUsed,
      error:       result.error,
    }) + "\n";

    fs.appendFileSync("trades.log", entry, "utf8");
  }
}

// ─── Adapter for your existing Claude decision loop ─────────
//
// In your main loop, replace the paper ledger call with:
//   import { executeDecision } from './executor';
//   await executeDecision(claudeDecision, marketData, executor);

export async function executeDecision(
  decision: {
    action:              "BUY" | "SELL" | "HOLD";
    confidence:          number;
    stopLossPercent?:    number;
    takeProfitPercent?:  number;
    reasoning:           string;
    amount?:             number;
  },
  marketData: { price: number; symbol?: string },
  executor: OnChainExecutor
): Promise<TradeResult | null> {

  if (decision.action === "HOLD") {
    console.log("  ⏸️  HOLD — no trade");
    return null;
  }

  const order: TradeOrder = {
    action:             decision.action,
    tokenSymbol:        marketData.symbol ?? "ETH",
    usdAmount:          decision.amount ?? 50,
    confidence:         decision.confidence,
    reasoning:          decision.reasoning,
    stopLossPercent:    decision.stopLossPercent,
    takeProfitPercent:  decision.takeProfitPercent,
  };

  return executor.executeTrade(order);
}

// ─── Quick test — run directly to verify setup ──────────────
//   npx ts-node --env-file=.env src/executor.ts

const isMain = false; // run test on direct execution
if (isMain) {
  (async () => {
    console.log("🚀 On-Chain Executor — connectivity test\n");

    try {
      const executor = new OnChainExecutor(true); // DRY RUN

      console.log("1️⃣  Checking wallet balances...");
      const balances = await executor.getBalances();
      console.log(`   Address: ${balances.address}`);
      console.log(`   ETH:     ${balances.ETH}`);
      console.log(`   USDC:    $${balances.USDC}`);

      console.log("\n2️⃣  Simulating a BUY order (dry run)...");
      const result = await executeDecision(
        {
          action:             "BUY",
          confidence:         85,
          stopLossPercent:    5,
          takeProfitPercent:  10,
          reasoning:          "ETH at support, oversold RSI",
          amount:             50,
        },
        { price: 2050, symbol: "ETH" },
        executor
      );

      console.log(`\n✅ Test complete — ${result?.success ? "SUCCESS" : "FAILED"}`);
      console.log("   When ready for live trading, change DRY RUN to false in your main loop.");

    } catch (err) {
      console.error("❌ Test failed:", err instanceof Error ? err.message : err);
    }
  })();
}

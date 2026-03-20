// ============================================================
// bankr-executor.ts
// Real on-chain execution layer via Bankr Agent API
//
// DROP-IN REPLACEMENT for the paper trading ledger.
// Slot this in wherever your bot currently calls
// paperTradingLedger.executeTrade() or similar.
//
// SETUP:
//   1. Revoke your exposed key at https://bankr.bot/api
//   2. Generate a new key and add to .env:
//        BANKR_API_KEY=bk_3FPAL76N8ANUPXX53GHUPTZSJJPGZLS9
//   3. npm install (no new deps needed — uses native fetch)
// ============================================================

import * as fs from "fs";
import { fileURLToPath } from "url";
import * as path from "path";

// ─── Config ────────────────────────────────────────────────

const BANKR_API_URL = "https://api.bankr.bot";
const BANKR_API_KEY = process.env.BANKR_API_KEY;

const POLL_INTERVAL_MS = 2000;    // 2s between status checks
const MAX_POLL_ATTEMPTS = 30;     // 60s total timeout per trade

// ES module safe __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOG_FILE = path.join(__dirname, "trades.log");

// ─── Types ──────────────────────────────────────────────────

export type TradeAction = "BUY" | "SELL";
export type Chain = "base" | "ethereum" | "polygon" | "solana" | "unichain";

export interface TradeOrder {
  action: TradeAction;
  tokenSymbol: string;           // e.g. "ETH", "USDC", "PEPE"
  usdAmount: number;             // dollar amount to trade
  chain: Chain;
  stopLossPercent?: number;      // e.g. 5 = 5% below entry
  takeProfitPercent?: number;    // e.g. 10 = 10% above entry
  confidence: number;            // 0–100, from Claude's decision
  reasoning: string;             // Claude's reasoning string
}

export interface TradeResult {
  success: boolean;
  jobId?: string;
  threadId?: string;
  response?: string;             // Bankr's natural language response
  error?: string;
  executedAt: string;
  order: TradeOrder;
}

export interface JobStatus {
  jobId: string;
  status: "pending" | "processing" | "completed" | "failed" | "cancelled";
  response?: string;
  error?: string;
  threadId?: string;
}

export interface PortfolioBalance {
  chain: Chain;
  balances: Record<string, string>;  // token → human-readable amount
  rawResponse: string;
}

// ─── Core API Client ────────────────────────────────────────

class BankrClient {
  private apiKey: string;
  private currentThreadId?: string;

  constructor(apiKey: string) {
    if (!apiKey || !apiKey.startsWith("bk_")) {
      throw new Error(
        "Invalid or missing BANKR_API_KEY. Must start with 'bk_'. " +
        "Generate one at https://bankr.bot/api"
      );
    }
    this.apiKey = apiKey;
  }

  private headers() {
    return {
      "X-API-Key": this.apiKey,
      "Content-Type": "application/json",
    };
  }

  // Submit a natural language prompt, returns jobId + threadId
  async submitPrompt(prompt: string, useThread = false): Promise<{ jobId: string; threadId: string }> {
    const body: Record<string, string> = { prompt };

    // Maintain conversation thread for context continuity
    if (useThread && this.currentThreadId) {
      body.threadId = this.currentThreadId;
    }

    const res = await fetch(`${BANKR_API_URL}/agent/prompt`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Bankr prompt submission failed (${res.status}): ${text}`);
    }

    const data = await res.json() as { jobId: string; threadId: string };
    this.currentThreadId = data.threadId;
    return data;
  }

  // Poll job status until terminal state
  async pollJob(jobId: string): Promise<JobStatus> {
    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
      const res = await fetch(`${BANKR_API_URL}/agent/job/${jobId}`, {
        headers: this.headers(),
      });

      if (!res.ok) {
        throw new Error(`Bankr job poll failed (${res.status})`);
      }

      const status = await res.json() as JobStatus;

      if (["completed", "failed", "cancelled"].includes(status.status)) {
        return status;
      }

      // Still processing — wait and retry
      await sleep(POLL_INTERVAL_MS);
    }

    throw new Error(`Bankr job ${jobId} timed out after ${MAX_POLL_ATTEMPTS * POLL_INTERVAL_MS / 1000}s`);
  }

  // Full submit → poll → result cycle
  async execute(prompt: string, useThread = false): Promise<JobStatus> {
    const { jobId } = await this.submitPrompt(prompt, useThread);
    console.log(`  📤 Bankr job submitted: ${jobId}`);
    const result = await this.pollJob(jobId);
    return result;
  }

  // Cancel a running job
  async cancelJob(jobId: string): Promise<void> {
    await fetch(`${BANKR_API_URL}/agent/job/${jobId}`, {
      method: "DELETE",
      headers: this.headers(),
    });
  }

  // Check wallet balances on a chain
  async getBalances(chain: Chain = "base"): Promise<string> {
    const result = await this.execute(`What are my token balances on ${chain}?`);
    return result.response ?? "No balance data returned";
  }

  // Get current token price
  async getPrice(token: string): Promise<string> {
    const result = await this.execute(`What is the current price of ${token}?`);
    return result.response ?? "No price data returned";
  }
}

// ─── Executor ───────────────────────────────────────────────

export class BankrExecutor {
  private client: BankrClient;
  private dryRun: boolean;

  constructor(dryRun = false) {
    if (!BANKR_API_KEY) {
      throw new Error("BANKR_API_KEY not set in environment");
    }
    this.client = new BankrClient(BANKR_API_KEY);
    this.dryRun = dryRun;

    if (dryRun) {
      console.log("⚠️  BankrExecutor running in DRY RUN mode — prompts will be submitted but trades won't execute");
    }
  }

  // ── Main entry point called by your trading loop ──────────

  async executeTrade(order: TradeOrder): Promise<TradeResult> {
    const timestamp = new Date().toISOString();

    console.log(`\n🔄 Executing ${order.action} ${order.tokenSymbol} $${order.usdAmount} on ${order.chain}`);
    console.log(`   Confidence: ${order.confidence}% | Reasoning: ${order.reasoning.slice(0, 80)}...`);

    try {
      const prompt = this.buildTradePrompt(order);
      console.log(`   Prompt: "${prompt}"`);

      let result: TradeResult;

      if (this.dryRun) {
        // Dry run: submit for price/balance checks but don't actually trade
        const balanceCheck = await this.client.execute(
          `What is my current ${order.tokenSymbol} balance and USD value on ${order.chain}?`
        );
        result = {
          success: true,
          response: `[DRY RUN] Would have executed: ${prompt}\nBalance check: ${balanceCheck.response}`,
          executedAt: timestamp,
          order,
        };
      } else {
        const jobResult = await this.client.execute(prompt);

        result = {
          success: jobResult.status === "completed",
          jobId: jobResult.jobId,
          threadId: jobResult.threadId,
          response: jobResult.response,
          error: jobResult.status !== "completed" ? jobResult.error : undefined,
          executedAt: timestamp,
          order,
        };
      }

      this.logTrade(result);
      return result;

    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      console.error(`  ❌ Trade execution failed: ${error}`);

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

  // ── Stop loss / Take profit automation ────────────────────

  async setStopLoss(token: string, triggerPrice: number, chain: Chain = "base"): Promise<TradeResult> {
    const order: TradeOrder = {
      action: "SELL",
      tokenSymbol: token,
      usdAmount: 0, // Bankr will sell full position
      chain,
      confidence: 100,
      reasoning: `Automated stop loss at $${triggerPrice}`,
    };

    const prompt = `Set a stop loss to sell all my ${token} on ${chain} if the price drops to $${triggerPrice}`;
    console.log(`\n🛡️  Setting stop loss: ${prompt}`);

    try {
      const jobResult = await this.client.execute(prompt);
      const result: TradeResult = {
        success: jobResult.status === "completed",
        jobId: jobResult.jobId,
        response: jobResult.response,
        error: jobResult.error,
        executedAt: new Date().toISOString(),
        order,
      };
      this.logTrade(result);
      return result;
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      return { success: false, error, executedAt: new Date().toISOString(), order };
    }
  }

  async setTakeProfit(token: string, triggerPrice: number, chain: Chain = "base"): Promise<TradeResult> {
    const order: TradeOrder = {
      action: "SELL",
      tokenSymbol: token,
      usdAmount: 0,
      chain,
      confidence: 100,
      reasoning: `Automated take profit at $${triggerPrice}`,
    };

    const prompt = `Set a limit order to sell all my ${token} on ${chain} when the price reaches $${triggerPrice}`;
    console.log(`\n🎯 Setting take profit: ${prompt}`);

    try {
      const jobResult = await this.client.execute(prompt);
      return {
        success: jobResult.status === "completed",
        jobId: jobResult.jobId,
        response: jobResult.response,
        error: jobResult.error,
        executedAt: new Date().toISOString(),
        order,
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      return { success: false, error, executedAt: new Date().toISOString(), order };
    }
  }

  // ── Portfolio queries ──────────────────────────────────────

  async getPortfolio(chain: Chain = "base"): Promise<string> {
    console.log(`\n📊 Fetching portfolio on ${chain}...`);
    return this.client.getBalances(chain);
  }

  async getTokenPrice(token: string): Promise<string> {
    return this.client.getPrice(token);
  }

  // ── Prompt builder ─────────────────────────────────────────

  private buildTradePrompt(order: TradeOrder): string {
    const { action, tokenSymbol, usdAmount, chain } = order;

    if (action === "BUY") {
      return `Buy $${usdAmount} of ${tokenSymbol} on ${chain}`;
    } else {
      return `Sell $${usdAmount} of ${tokenSymbol} on ${chain}`;
    }
  }

  // ── Logging ───────────────────────────────────────────────

  private logTrade(result: TradeResult): void {
    const logEntry = {
      timestamp: result.executedAt,
      action: result.order.action,
      token: result.order.tokenSymbol,
      usdAmount: result.order.usdAmount,
      chain: result.order.chain,
      confidence: result.order.confidence,
      success: result.success,
      jobId: result.jobId,
      response: result.response?.slice(0, 200),
      error: result.error,
    };

    const line = JSON.stringify(logEntry) + "\n";
    fs.appendFileSync(LOG_FILE, line, "utf8");

    if (result.success) {
      console.log(`  ✅ Trade confirmed: ${result.response?.slice(0, 120)}`);
    } else {
      console.log(`  ❌ Trade failed: ${result.error}`);
    }
  }
}

// ─── Integration shim for existing bot ─────────────────────
//
// Your existing bot calls something like:
//   await paperLedger.recordTrade(decision, marketData)
//
// Replace it with this adapter so the rest of your code
// doesn't change at all.

export async function executeDecision(
  decision: {
    action: "BUY" | "SELL" | "HOLD";
    confidence: number;
    stopLossPercent?: number;
    takeProfitPercent?: number;
    reasoning: string;
    amount?: number;
  },
  marketData: {
    price: number;
    symbol?: string;
  },
  executor: BankrExecutor
): Promise<TradeResult | null> {

  if (decision.action === "HOLD") {
    console.log("  ⏸️  HOLD — no trade executed");
    return null;
  }

  const usdAmount = decision.amount ?? 50; // default $50 per trade if not specified
  const token = marketData.symbol ?? "ETH";

  const order: TradeOrder = {
    action: decision.action,
    tokenSymbol: token,
    usdAmount,
    chain: "base",
    stopLossPercent: decision.stopLossPercent,
    takeProfitPercent: decision.takeProfitPercent,
    confidence: decision.confidence,
    reasoning: decision.reasoning,
  };

  const result = await executor.executeTrade(order);

  // Auto-set stop loss and take profit as separate Bankr automations
  if (result.success && decision.action === "BUY") {
    if (decision.stopLossPercent) {
      const slPrice = marketData.price * (1 - decision.stopLossPercent / 100);
      await executor.setStopLoss(token, Math.round(slPrice), "base");
    }
    if (decision.takeProfitPercent) {
      const tpPrice = marketData.price * (1 + decision.takeProfitPercent / 100);
      await executor.setTakeProfit(token, Math.round(tpPrice), "base");
    }
  }

  return result;
}

// ─── Utility ────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Quick test harness ─────────────────────────────────────
//
// Run directly to test connectivity before wiring into your bot:
//   npx ts-node bankr-executor.ts
//
// (Uses DRY RUN mode — safe to run without risking funds)

// ES module entry point check
const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  (async () => {
    console.log("🚀 Bankr Executor — connectivity test\n");

    try {
      // DRY RUN = true for safe testing
      const executor = new BankrExecutor(true);

      console.log("1️⃣  Checking portfolio on Base...");
      const portfolio = await executor.getPortfolio("base");
      console.log("   Portfolio:", portfolio.slice(0, 200));

      console.log("\n2️⃣  Getting ETH price...");
      const price = await executor.getTokenPrice("ETH");
      console.log("   ETH price:", price.slice(0, 100));

      console.log("\n3️⃣  Simulating a BUY decision...");
      const result = await executeDecision(
        {
          action: "BUY",
          confidence: 82,
          stopLossPercent: 5,
          takeProfitPercent: 10,
          reasoning: "ETH oversold, RSI 28, accumulation pattern near support",
          amount: 50,
        },
        { price: 2050, symbol: "ETH" },
        executor
      );

      console.log("\n✅ Test complete. Result:", result?.success ? "SUCCESS" : "FAILED");

    } catch (err) {
      console.error("❌ Test failed:", err instanceof Error ? err.message : err);
      console.error("\nMake sure BANKR_API_KEY is set in your .env file.");
      console.error("Generate a new key at: https://bankr.bot/api");
    }
  })();
}



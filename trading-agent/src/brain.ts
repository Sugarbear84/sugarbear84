// src/brain.ts
import Anthropic from '@anthropic-ai/sdk';
import * as dotenv from 'dotenv';
import type { MarketData, PricePoint, WalletTx } from './datafeed.js';

dotenv.config();

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ----- Types (unchanged) -----

export interface Portfolio {
  ethBalance: string;
  usdcBalance: string;
  totalValueUsd: number;
}

export interface TradeDecision {
  action: 'BUY' | 'SELL' | 'HOLD';
  pair: string;
  amountUsd: number;
  confidence: number;
  reasoning: string;
  stopLoss: number | null;
  takeProfit: number | null;
}

// ----- System Prompt (unchanged) -----

const SYSTEM_PROMPT = `You are an autonomous crypto trading agent running on Base L2.
You analyze market data and make trading decisions for the ETH/USDC pair.

STRATEGY RULES:
- You manage a portfolio of ETH and USDC
- Max single trade: 10% of total portfolio value
- Minimum confidence to trade: 0.7 (scale 0-1)
- Stop loss: always set, typically 3-5% below entry
- Take profit: typically 5-10% above entry
- If data is stale or unreliable, HOLD
- If you're unsure, HOLD — doing nothing is a valid strategy
- Consider 24h price range, volume, and trend direction

RESPONSE FORMAT:
You MUST respond with ONLY valid JSON matching this exact schema.
No markdown, no backticks, no explanation outside the JSON.

{
  "action": "BUY" | "SELL" | "HOLD",
  "pair": "ETH/USDC",
  "amountUsd": 0.00,
  "confidence": 0.00,
  "reasoning": "one sentence explanation",
  "stopLoss": null | price_number,
  "takeProfit": null | price_number
}

For HOLD actions, set amountUsd to 0 and stopLoss/takeProfit to null.`;

// ----- Decision Function (updated signature) -----

export async function getTradeDecision(
  market: MarketData,
  portfolio: Portfolio,
  recentHistory: PricePoint[],
  walletHistory: WalletTx[]   // NEW: on-chain wallet activity
): Promise<TradeDecision> {

  // Format wallet history for the prompt (last 5 txs)
  const walletSummary = walletHistory.length === 0
    ? '  No recent on-chain transactions found.'
    : walletHistory.slice(0, 5).map(tx =>
        `  ${tx.time} | ${tx.category.toUpperCase()} | ${tx.value} ${tx.asset} | to: ${tx.to.slice(0, 10)}...`
      ).join('\n');

  // Format 7-day price history for the prompt (sample every 6 hours = 28 points)
  const historyForPrompt = recentHistory.length === 0
    ? '  No price history available yet.'
    : recentHistory
        .filter((_: PricePoint, i: number) => i % 6 === 0)  // every 6th point
        .slice(-28)
        .map((h: PricePoint) => `  ${h.time.slice(0, 16)}: $${h.price.toFixed(2)}`)
        .join('\n');

  const userMessage = `
CURRENT MARKET DATA:
- ETH Price: $${market.ethPrice.toFixed(2)}
- 24h Change: ${market.change24h.toFixed(2)}%
- 24h Volume: $${(market.volume24h / 1e9).toFixed(2)}B
- 24h High: $${market.high24h.toFixed(2)}
- 24h Low: $${market.low24h.toFixed(2)}
- Time: ${market.timestamp}

7-DAY PRICE HISTORY (hourly, sampled every 6h):
${historyForPrompt}

YOUR PORTFOLIO:
- ETH: ${portfolio.ethBalance} (≈$${(parseFloat(portfolio.ethBalance) * market.ethPrice).toFixed(2)})
- USDC: ${portfolio.usdcBalance}
- Total Value: ≈$${portfolio.totalValueUsd.toFixed(2)}
- Max trade size: $${(portfolio.totalValueUsd * 0.10).toFixed(2)} (10% limit — do not exceed)

AGENT WALLET ON-CHAIN HISTORY (last 5 transactions):
${walletSummary}

What is your trading decision?`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 500,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  });

  const text = response.content[0].type === 'text'
    ? response.content[0].text.trim()
    : '';

  try {
    const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const decision = JSON.parse(clean) as TradeDecision;

    if (!['BUY', 'SELL', 'HOLD'].includes(decision.action)) {
      throw new Error(`Invalid action: ${decision.action}`);
    }
    if (typeof decision.confidence !== 'number' || decision.confidence < 0 || decision.confidence > 1) {
      throw new Error(`Invalid confidence: ${decision.confidence}`);
    }

    return decision;
  } catch (parseError: any) {
    console.error('⚠️  Failed to parse LLM response:', parseError.message);
    console.error('   Raw response:', text.substring(0, 200));
    return {
      action: 'HOLD',
      pair: 'ETH/USDC',
      amountUsd: 0,
      confidence: 0,
      reasoning: `LLM parse error: ${parseError.message}`,
      stopLoss: null,
      takeProfit: null,
    };
  }
}

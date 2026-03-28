// src/datafeed.ts
import * as dotenv from 'dotenv';
dotenv.config();

export interface MarketData {
  ethPrice: number;
  change24h: number;
  volume24h: number;
  high24h: number;
  low24h: number;
  timestamp: string;
}

export interface PricePoint {
  price: number;
  time: string;
}

// ── CoinGecko (unchanged) ──────────────────────────────────────
const COINGECKO_URL = 'https://api.coingecko.com/api/v3';

export async function getMarketData(): Promise<MarketData> {
  try {
    const res = await fetch(
      `${COINGECKO_URL}/simple/price?ids=ethereum&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true`
    );
    const data = await res.json();
    const eth = data.ethereum;

    const chartRes = await fetch(
      `${COINGECKO_URL}/coins/ethereum/market_chart?vs_currency=usd&days=1`
    );
    const chart = await chartRes.json();
    if (!chart?.prices?.length) throw new Error('No price chart data returned');
    const prices = chart.prices.map((p: number[]) => p[1]);
    const high24h = Math.max(...prices);
    const low24h = Math.min(...prices);

    return {
      ethPrice: eth.usd,
      change24h: eth.usd_24h_change,
      volume24h: eth.usd_24h_vol,
      high24h,
      low24h,
      timestamp: new Date().toISOString(),
    };
  } catch (error: any) {
    console.error('⚠️  CoinGecko API error:', error.message);
    return { ethPrice: 0, change24h: 0, volume24h: 0, high24h: 0, low24h: 0, timestamp: new Date().toISOString() };
  }
}

// ── In-memory price buffer (unchanged) ────────────────────────
const priceHistory: PricePoint[] = [];
const MAX_HISTORY = 50;

export function recordPrice(price: number): void {
  priceHistory.push({ price, time: new Date().toISOString() });
  if (priceHistory.length > MAX_HISTORY) priceHistory.shift();
}

export function getPriceHistory(): PricePoint[] {
  return [...priceHistory];
}

// ── NEW: Alchemy 7-day price history ──────────────────────────
// Replaces the small in-memory buffer with real historical data
// from Alchemy's token price history API.
// Returns up to 168 hourly data points (7 days).

export async function getAlchemyPriceHistory(): Promise<PricePoint[]> {
  const apiKey = process.env.ALCHEMY_API_KEY;
  if (!apiKey) {
    console.warn('⚠️  ALCHEMY_API_KEY not set — skipping price history');
    return [];
  }

  try {
    // Alchemy prices API — ETH by symbol, 7 days, 1-hour intervals
    const url = `https://api.g.alchemy.com/prices/v1/${apiKey}/tokens/historical`;

    const body = {
      symbol: 'ETH',
      startTime: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      endTime: new Date().toISOString(),
      interval: '1h',
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Alchemy API ${res.status}: ${err}`);
    }

    const data = await res.json();

    // Alchemy returns: { data: [{ timestamp: number, value: string }] }
    if (!data?.data?.length) {
      console.warn('⚠️  Alchemy returned empty price history');
      return [];
    }

    return data.data.map((point: { timestamp: number; value: string }) => ({
      price: parseFloat(point.value),
      time: new Date(point.timestamp * 1000).toISOString(),
    }));

  } catch (error: any) {
    console.error('⚠️  Alchemy price history error:', error.message);
    return [];
  }
}

// ── NEW: Alchemy wallet transaction history ────────────────────
// Fetches the agent wallet's recent on-chain transactions from
// Alchemy so Claude can see its own trade history.
// Returns last 20 transactions as a readable summary array.

export interface WalletTx {
  hash: string;
  from: string;
  to: string;
  value: string;      // in ETH
  asset: string;      // 'ETH' or token symbol
  category: string;   // 'external', 'erc20', etc.
  time: string;
}

export async function getAlchemyWalletHistory(walletAddress: string): Promise<WalletTx[]> {
  const apiKey = process.env.ALCHEMY_API_KEY;
  if (!apiKey) {
    console.warn('⚠️  ALCHEMY_API_KEY not set — skipping wallet history');
    return [];
  }

  try {
    // Alchemy getAssetTransfers — gets all inbound + outbound transfers
    const url = `https://base-sepolia.g.alchemy.com/v2/${apiKey}`;

    const body = {
      jsonrpc: '2.0',
      id: 1,
      method: 'alchemy_getAssetTransfers',
      params: [{
        fromAddress: walletAddress,
        category: ['external', 'erc20', 'erc721'],
        withMetadata: true,
        excludeZeroValue: false,
        maxCount: '0x14', // 20 results
        order: 'desc',
      }],
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) throw new Error(`Alchemy RPC ${res.status}`);

    const data = await res.json();
    const transfers = data?.result?.transfers ?? [];

    return transfers.map((tx: any) => ({
      hash: tx.hash,
      from: tx.from,
      to: tx.to ?? '',
      value: tx.value?.toString() ?? '0',
      asset: tx.asset ?? 'ETH',
      category: tx.category,
      time: tx.metadata?.blockTimestamp ?? '',
    }));

  } catch (error: any) {
    console.error('⚠️  Alchemy wallet history error:', error.message);
    return [];
  }
}

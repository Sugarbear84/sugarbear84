// src/research/alchemy-client.ts
// ============================================================
// Enhanced Alchemy client for multi-asset price history
// and wallet transaction history across all tiers.
//
// Extends the basic Alchemy calls in datafeed.ts to support
// any token symbol (not just ETH) for Tier 2–4 research.
// ============================================================

import * as dotenv from 'dotenv';
dotenv.config();

export interface PricePoint {
  price: number;
  time: string;
}

export interface WalletTx {
  hash: string;
  from: string;
  to: string;
  value: string;
  asset: string;
  category: string;
  time: string;
}

// ── Price history (7-day, hourly) ─────────────────────────────

export async function getPriceHistory(symbol: string, days = 7): Promise<PricePoint[]> {
  const apiKey = process.env.ALCHEMY_API_KEY;
  if (!apiKey) {
    console.warn('⚠️  ALCHEMY_API_KEY not set — skipping price history');
    return [];
  }

  try {
    const url  = `https://api.g.alchemy.com/prices/v1/${apiKey}/tokens/historical`;
    const now  = Math.floor(Date.now() / 1000);
    const body = {
      symbol: symbol.toUpperCase(),
      startTime: now - days * 24 * 60 * 60,
      endTime:   now,
      interval:  '1h',
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Alchemy prices API ${res.status}: ${err}`);
    }

    const data = await res.json() as { data?: Array<{ timestamp: number; value: string }> };
    if (!data?.data?.length) return [];

    return data.data.map(p => ({
      price: parseFloat(p.value),
      time:  new Date(p.timestamp * 1000).toISOString(),
    }));
  } catch (err: any) {
    console.error(`⚠️  Alchemy price history (${symbol}):`, err.message);
    return [];
  }
}

// ── Wallet transaction history ────────────────────────────────

export async function getWalletHistory(
  walletAddress: string,
  network = 'base-sepolia'
): Promise<WalletTx[]> {
  const apiKey = process.env.ALCHEMY_API_KEY;
  if (!apiKey) {
    console.warn('⚠️  ALCHEMY_API_KEY not set — skipping wallet history');
    return [];
  }

  try {
    const rpcUrl = `https://${network}.g.alchemy.com/v2/${apiKey}`;
    const body   = {
      jsonrpc: '2.0', id: 1,
      method:  'alchemy_getAssetTransfers',
      params: [{
        fromAddress:   walletAddress,
        category:      ['external', 'erc20', 'erc721'],
        withMetadata:  true,
        excludeZeroValue: false,
        maxCount:      '0x14',
        order:         'desc',
      }],
    };

    const res = await fetch(rpcUrl, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });

    if (!res.ok) throw new Error(`Alchemy RPC ${res.status}`);

    const data = await res.json() as { result?: { transfers: any[] } };
    return (data.result?.transfers ?? []).map((tx: any) => ({
      hash:     tx.hash,
      from:     tx.from,
      to:       tx.to ?? '',
      value:    tx.value?.toString() ?? '0',
      asset:    tx.asset ?? 'ETH',
      category: tx.category,
      time:     tx.metadata?.blockTimestamp ?? '',
    }));
  } catch (err: any) {
    console.error('⚠️  Alchemy wallet history:', err.message);
    return [];
  }
}

// ── Portfolio balances via Alchemy Token Balances ─────────────

export async function getTokenBalances(
  walletAddress: string,
  network = 'base-mainnet'
): Promise<Record<string, string>> {
  const apiKey = process.env.ALCHEMY_API_KEY;
  if (!apiKey) return {};

  try {
    const rpcUrl = `https://${network}.g.alchemy.com/v2/${apiKey}`;
    const body   = {
      jsonrpc: '2.0', id: 1,
      method:  'alchemy_getTokenBalances',
      params:  [walletAddress, 'erc20'],
    };

    const res  = await fetch(rpcUrl, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });

    if (!res.ok) throw new Error(`Alchemy balances ${res.status}`);

    const data = await res.json() as {
      result?: { tokenBalances: Array<{ contractAddress: string; tokenBalance: string }> }
    };

    const balances: Record<string, string> = {};
    for (const b of data.result?.tokenBalances ?? []) {
      const hex = b.tokenBalance;
      balances[b.contractAddress] = hex ? (parseInt(hex, 16) / 1e18).toFixed(6) : '0';
    }
    return balances;
  } catch (err: any) {
    console.error('⚠️  Alchemy token balances:', err.message);
    return {};
  }
}

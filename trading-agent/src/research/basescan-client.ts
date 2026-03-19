// src/research/basescan-client.ts
// ============================================================
// Basescan API client for contract verification and
// on-chain debugging. Minimal usage — see docs for when
// to use Basescan vs Dune vs The Graph.
//
// Use Basescan for:
//   - Verifying contract addresses before trading
//   - Checking token contract source code
//   - Looking up specific transaction details
//   - Debugging failed transactions
//
// NOT for: bulk data, historical analysis (use Dune for that)
//
// Requires: BASESCAN_API_KEY in .env (free at basescan.org)
// ============================================================

import * as dotenv from 'dotenv';
dotenv.config();

const BASESCAN_API = 'https://api.basescan.org/api';

// ── Types ──────────────────────────────────────────────────────

export interface TokenInfo {
  contractAddress: string;
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: string;
  isVerified: boolean;
  isProxy: boolean;
}

export interface TxInfo {
  hash: string;
  from: string;
  to: string;
  value: string;
  gasUsed: string;
  status: 'success' | 'failed';
  timestamp: string;
  methodId: string;
}

// ── Core fetch helper ─────────────────────────────────────────

async function basescanFetch(params: Record<string, string>): Promise<any> {
  const apiKey = process.env.BASESCAN_API_KEY;
  if (!apiKey) {
    console.warn('⚠️  BASESCAN_API_KEY not set');
    return null;
  }

  const url = new URL(BASESCAN_API);
  url.searchParams.set('apikey', apiKey);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  try {
    const res  = await fetch(url.toString());
    const data = await res.json() as { status: string; result: any; message?: string };

    if (data.status !== '1') {
      throw new Error(data.message ?? 'Basescan API error');
    }
    return data.result;
  } catch (err: any) {
    console.error('⚠️  Basescan error:', err.message);
    return null;
  }
}

// ── Token contract verification ───────────────────────────────

export async function verifyToken(contractAddress: string): Promise<TokenInfo | null> {
  const [tokenInfo, abi] = await Promise.all([
    basescanFetch({
      module:  'token',
      action:  'tokeninfo',
      contractaddress: contractAddress,
    }),
    basescanFetch({
      module:  'contract',
      action:  'getabi',
      address: contractAddress,
    }),
  ]);

  if (!tokenInfo) return null;

  return {
    contractAddress,
    name:         tokenInfo.tokenName    ?? 'Unknown',
    symbol:       tokenInfo.symbol       ?? 'UNKNOWN',
    decimals:     parseInt(tokenInfo.divisor ?? '18', 10),
    totalSupply:  tokenInfo.totalSupply  ?? '0',
    isVerified:   abi !== null,
    isProxy:      false, // Extend later with proxy detection
  };
}

// ── Transaction lookup ────────────────────────────────────────

export async function getTxDetails(txHash: string): Promise<TxInfo | null> {
  const result = await basescanFetch({
    module:  'transaction',
    action:  'gettxreceiptstatus',
    txhash:  txHash,
  });

  if (!result) return null;

  return {
    hash:      txHash,
    from:      result.from    ?? '',
    to:        result.to      ?? '',
    value:     result.value   ?? '0',
    gasUsed:   result.gasUsed ?? '0',
    status:    result.status === '1' ? 'success' : 'failed',
    timestamp: result.timeStamp ? new Date(parseInt(result.timeStamp, 10) * 1000).toISOString() : '',
    methodId:  result.input?.slice(0, 10) ?? '0x',
  };
}

// ── ETH balance for any address ───────────────────────────────

export async function getEthBalance(address: string): Promise<number> {
  const result = await basescanFetch({
    module:  'account',
    action:  'balance',
    address,
    tag:     'latest',
  });

  if (!result) return 0;
  return parseInt(result, 10) / 1e18;
}

// ── Token holders count ───────────────────────────────────────
// Useful for Tier 3/4 research: are holders growing?

export async function getTokenHolderCount(contractAddress: string): Promise<number> {
  // Basescan doesn't have a direct holders endpoint on free tier.
  // This is a placeholder — use Dune for holder analysis.
  console.warn('⚠️  Holder count requires Dune Analytics — see dune-client.ts');
  return 0;
}

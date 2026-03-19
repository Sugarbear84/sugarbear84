// src/research/thegraph-client.ts
// ============================================================
// The Graph subgraph queries for Tier 2 DeFi research.
//
// Queries:
//   - Aerodrome (Base #1 DEX): volume, TVL, fee revenue
//   - Uniswap V3 on Base: pool stats for UNI token research
//
// Used during tri-weekly Tier 2 research cycles to get
// protocol-level metrics that inform ACCUMULATE/HOLD/REDUCE.
//
// Free tier: The Graph has a generous free allowance.
// No API key required for public subgraphs.
// ============================================================

// ── Subgraph endpoints ────────────────────────────────────────

// Aerodrome (Base): https://thegraph.com/explorer/subgraphs/...
const AERODROME_SUBGRAPH = 'https://api.thegraph.com/subgraphs/name/aerodrome-finance/aerodrome';

// Uniswap V3 on Base
const UNISWAP_V3_BASE = 'https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3-base';

async function querySubgraph(url: string, query: string): Promise<any> {
  const res = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ query }),
  });

  if (!res.ok) throw new Error(`Graph query failed ${res.status}`);
  const data = await res.json() as { data?: any; errors?: any[] };
  if (data.errors?.length) throw new Error(data.errors[0].message);
  return data.data;
}

// ── Aerodrome metrics ─────────────────────────────────────────

export interface AerodromeMetrics {
  tvlUsd: number;
  volume24hUsd: number;
  fees24hUsd: number;
  volume7dUsd: number;
  poolCount: number;
}

export async function getAerodromeMetrics(): Promise<AerodromeMetrics | null> {
  const query = `{
    factories(first: 1) {
      totalValueLockedUSD
      totalVolumeUSD
      txCount
      poolCount
    }
    aerodromeFactoryDayDatas(
      first: 7
      orderBy: date
      orderDirection: desc
    ) {
      date
      dailyVolumeUSD
      dailyFeesUSD
      tvlUSD
    }
  }`;

  try {
    const data = await querySubgraph(AERODROME_SUBGRAPH, query);
    const factory = data?.factories?.[0];
    const days    = data?.aerodromeFactoryDayDatas ?? [];

    if (!factory) return null;

    const volume24h = parseFloat(days[0]?.dailyVolumeUSD ?? '0');
    const fees24h   = parseFloat(days[0]?.dailyFeesUSD   ?? '0');
    const volume7d  = days.reduce((s: number, d: any) => s + parseFloat(d.dailyVolumeUSD ?? '0'), 0);

    return {
      tvlUsd:      parseFloat(factory.totalValueLockedUSD),
      volume24hUsd: volume24h,
      fees24hUsd:   fees24h,
      volume7dUsd:  volume7d,
      poolCount:    parseInt(factory.poolCount, 10),
    };
  } catch (err: any) {
    console.error('⚠️  Aerodrome subgraph:', err.message);
    return null;
  }
}

// ── Uniswap V3 on Base ────────────────────────────────────────

export interface UniswapV3Metrics {
  tvlUsd: number;
  volume24hUsd: number;
  fees24hUsd: number;
  poolCount: number;
}

export async function getUniswapV3Metrics(): Promise<UniswapV3Metrics | null> {
  const query = `{
    factories(first: 1) {
      totalValueLockedUSD
      totalVolumeUSD
      poolCount
    }
    uniswapDayDatas(first: 1 orderBy: date orderDirection: desc) {
      volumeUSD
      feesUSD
      tvlUSD
    }
  }`;

  try {
    const data    = await querySubgraph(UNISWAP_V3_BASE, query);
    const factory = data?.factories?.[0];
    const day     = data?.uniswapDayDatas?.[0];

    if (!factory) return null;

    return {
      tvlUsd:      parseFloat(factory.totalValueLockedUSD ?? '0'),
      volume24hUsd: parseFloat(day?.volumeUSD ?? '0'),
      fees24hUsd:   parseFloat(day?.feesUSD   ?? '0'),
      poolCount:    parseInt(factory.poolCount ?? '0', 10),
    };
  } catch (err: any) {
    console.error('⚠️  Uniswap V3 subgraph:', err.message);
    return null;
  }
}

// ── Combined DeFi health summary ──────────────────────────────

export interface DeFiHealthSummary {
  aerodrome: AerodromeMetrics | null;
  uniswapV3: UniswapV3Metrics | null;
  totalDexTvlUsd: number;
  totalDex24hVolumeUsd: number;
  timestamp: string;
}

export async function getDeFiHealth(): Promise<DeFiHealthSummary> {
  const [aerodrome, uniswapV3] = await Promise.all([
    getAerodromeMetrics(),
    getUniswapV3Metrics(),
  ]);

  return {
    aerodrome,
    uniswapV3,
    totalDexTvlUsd:        (aerodrome?.tvlUsd ?? 0) + (uniswapV3?.tvlUsd ?? 0),
    totalDex24hVolumeUsd:  (aerodrome?.volume24hUsd ?? 0) + (uniswapV3?.volume24hUsd ?? 0),
    timestamp: new Date().toISOString(),
  };
}

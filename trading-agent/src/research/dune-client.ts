// src/research/dune-client.ts
// ============================================================
// Dune Analytics client for regression testing and
// meme coin discovery (Tier 4 research).
//
// Primary uses:
//   1. Export trade performance data for SQL analysis
//   2. Query pre-built dashboards for Base meme coin metrics
//   3. Weekly regression testing workflow
//
// Requires: DUNE_API_KEY in .env
// Free tier: 2,500 credits/month — sufficient for weekly use
// ============================================================

import * as dotenv from 'dotenv';
dotenv.config();

const DUNE_API = 'https://api.dune.com/api/v1';

// ── Types ──────────────────────────────────────────────────────

export interface DuneQueryResult {
  queryId: number;
  rows: Record<string, any>[];
  metadata: {
    columnNames: string[];
    rowCount: number;
    executionTime: number;
  };
}

export interface MemeCoinMetrics {
  symbol: string;
  volume24hUsd: number;
  holders: number;
  transactions24h: number;
  priceChange24h: number;
}

// ── Core query runner ─────────────────────────────────────────

async function runQuery(queryId: number, params: Record<string, any> = {}): Promise<DuneQueryResult | null> {
  const apiKey = process.env.DUNE_API_KEY;
  if (!apiKey) {
    console.warn('⚠️  DUNE_API_KEY not set — skipping Dune query');
    return null;
  }

  try {
    // Execute query
    const execRes = await fetch(`${DUNE_API}/query/${queryId}/execute`, {
      method:  'POST',
      headers: { 'X-Dune-API-Key': apiKey, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ query_parameters: params }),
    });

    if (!execRes.ok) throw new Error(`Execute failed: ${execRes.status}`);
    const { execution_id } = await execRes.json() as { execution_id: string };

    // Poll for results (max 60 seconds)
    for (let i = 0; i < 12; i++) {
      await new Promise(r => setTimeout(r, 5000));

      const statusRes = await fetch(`${DUNE_API}/execution/${execution_id}/results`, {
        headers: { 'X-Dune-API-Key': apiKey },
      });

      if (!statusRes.ok) continue;
      const result = await statusRes.json() as any;

      if (result.state === 'QUERY_STATE_COMPLETED') {
        return {
          queryId,
          rows: result.result?.rows ?? [],
          metadata: {
            columnNames: result.result?.metadata?.column_names ?? [],
            rowCount:    result.result?.metadata?.total_row_count ?? 0,
            executionTime: result.metadata?.execution_time_millis ?? 0,
          },
        };
      }

      if (result.state === 'QUERY_STATE_FAILED') {
        throw new Error(`Dune query ${queryId} failed`);
      }
    }

    throw new Error(`Dune query ${queryId} timed out`);
  } catch (err: any) {
    console.error('⚠️  Dune query error:', err.message);
    return null;
  }
}

// ── Regression testing ────────────────────────────────────────
// Upload trades CSV to Dune and run performance analysis.
// Set up this query once in the Dune UI, then call it here.
//
// Example Dune SQL (create at dune.com):
// SELECT
//   tier,
//   COUNT(*) as trades,
//   SUM(pnl) as total_pnl,
//   AVG(pnl) as avg_pnl,
//   SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) * 100.0 / COUNT(*) as win_rate
// FROM your_table
// GROUP BY tier

export async function runRegressionTest(
  queryId: number
): Promise<DuneQueryResult | null> {
  console.log(`📊 Running Dune regression test (query ${queryId})...`);
  return runQuery(queryId);
}

// ── Meme coin discovery (Tier 4 research) ────────────────────
// Query your Dune dashboard for Base meme coin metrics.
// Build this query in Dune UI targeting base.transactions
// and dex.trades tables.

export async function getMemeCoinMetrics(
  queryId: number,
  symbols: string[] = ['BRETT', 'TOSHI', 'DEGEN']
): Promise<MemeCoinMetrics[]> {
  const result = await runQuery(queryId, { symbols: symbols.join(',') });
  if (!result) return [];

  return result.rows.map((row: any) => ({
    symbol:          row.symbol ?? '',
    volume24hUsd:    parseFloat(row.volume_24h_usd ?? '0'),
    holders:         parseInt(row.holders          ?? '0', 10),
    transactions24h: parseInt(row.transactions_24h ?? '0', 10),
    priceChange24h:  parseFloat(row.price_change_24h ?? '0'),
  }));
}

// ── Weekly workflow helper ─────────────────────────────────────

export function printDuneSetupGuide(): void {
  console.log(`
📊 DUNE ANALYTICS SETUP GUIDE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Sign up at dune.com (free)
2. Create a new query with this SQL:

   SELECT
     tier, action, pair,
     entry_price, exit_price, pnl,
     CASE WHEN pnl > 0 THEN 'WIN' ELSE 'LOSS' END as result
   FROM dune.your_username.dataset_trades
   ORDER BY timestamp DESC

3. Upload data/trades.csv as a dataset
4. Add DUNE_API_KEY to your .env
5. Note your query ID and pass it to runRegressionTest()
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
}

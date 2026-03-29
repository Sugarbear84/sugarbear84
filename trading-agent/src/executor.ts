// src/executor.ts
import * as fs from 'fs';
import * as path from 'path';
import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
dotenv.config();

const LEDGER_PATH = path.resolve('paper-ledger.json');

export interface Position {
  id: string;
  action: 'BUY' | 'SELL';
  pair: string;
  entryPrice: number;
  amountUsd: number;
  stopLoss: number | null;
  takeProfit: number | null;
  timestamp: string;
  status: 'OPEN' | 'CLOSED';
  exitPrice?: number;
  pnl?: number;
  maxHoldHours?: number;
  tier?: number;
}

export interface PortfolioSnapshot {
  timestamp: string;
  value: number;
}

export interface Ledger {
  usdBalance: number;
  ethBalance: number;
  positions: Position[];
  tradeHistory: Position[];
  portfolioHistory: PortfolioSnapshot[];
}

export function loadLedger(): Ledger {
  if (!fs.existsSync(LEDGER_PATH)) {
    const initial: Ledger = { usdBalance: 1000, ethBalance: 0, positions: [], tradeHistory: [], portfolioHistory: [] };
    fs.writeFileSync(LEDGER_PATH, JSON.stringify(initial, null, 2));
    return initial;
  }
  const ledger = JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf-8')) as Ledger;
  if (!ledger.portfolioHistory) ledger.portfolioHistory = [];
  return ledger;
}

export function recordPortfolioSnapshot(ethPrice: number): void {
  const ledger = loadLedger();
  const total = ledger.usdBalance + ledger.ethBalance * ethPrice;
  ledger.portfolioHistory.push({ timestamp: new Date().toISOString(), value: total });
  // Keep max 1 year of 30-min snapshots (17,520 points)
  if (ledger.portfolioHistory.length > 17520) ledger.portfolioHistory.shift();
  saveLedger(ledger);
}

function saveLedger(ledger: Ledger): void {
  fs.writeFileSync(LEDGER_PATH, JSON.stringify(ledger, null, 2));
}

export function executePaperTrade(
  action: 'BUY' | 'SELL',
  amountUsd: number,
  ethPrice: number,
  stopLoss: number | null,
  takeProfit: number | null,
  ledger: Ledger,
  opts?: { pair?: string; maxHoldHours?: number; tier?: number }
): string {
  const ethAmount = amountUsd / ethPrice;
  if (action === 'BUY') {
    if (ledger.usdBalance < amountUsd) return `⚠️  Insufficient USDC: have $${ledger.usdBalance.toFixed(2)}, need $${amountUsd.toFixed(2)}`;
    ledger.usdBalance -= amountUsd;
    ledger.ethBalance += ethAmount;
  } else {
    if (ledger.ethBalance * ethPrice < amountUsd) return `⚠️  Insufficient ETH`;
    ledger.ethBalance -= ethAmount;
    ledger.usdBalance += amountUsd;
  }
  const position: Position = {
    id: `trade-${Date.now()}`,
    action, pair: opts?.pair ?? 'ETH/USDC', entryPrice: ethPrice, amountUsd,
    stopLoss, takeProfit, timestamp: new Date().toISOString(), status: 'OPEN',
    ...(opts?.maxHoldHours !== undefined ? { maxHoldHours: opts.maxHoldHours } : {}),
    ...(opts?.tier !== undefined ? { tier: opts.tier } : {}),
  };
  ledger.positions.push(position);
  saveLedger(ledger);
  return `✅ Paper ${action}: ${ethAmount.toFixed(6)} ETH @ $${ethPrice.toFixed(2)} | SL: ${stopLoss ? '$'+stopLoss.toFixed(2) : 'none'} | TP: ${takeProfit ? '$'+takeProfit.toFixed(2) : 'none'}`;
}

export function checkOpenPositions(currentPrice: number, ledger: Ledger): string[] {
  const messages: string[] = [];
  const stillOpen: Position[] = [];
  for (const pos of ledger.positions) {
    if (pos.status !== 'OPEN') { stillOpen.push(pos); continue; }
    let closed = false, reason = '', exitPrice = currentPrice;
    if (pos.action === 'BUY') {
      if (pos.stopLoss && currentPrice <= pos.stopLoss) { closed = true; reason = 'STOP LOSS'; exitPrice = pos.stopLoss; }
      else if (pos.takeProfit && currentPrice >= pos.takeProfit) { closed = true; reason = 'TAKE PROFIT'; exitPrice = pos.takeProfit; }
    } else {
      if (pos.stopLoss && currentPrice >= pos.stopLoss) { closed = true; reason = 'STOP LOSS'; exitPrice = pos.stopLoss; }
      else if (pos.takeProfit && currentPrice <= pos.takeProfit) { closed = true; reason = 'TAKE PROFIT'; exitPrice = pos.takeProfit; }
    }
    if (closed) {
      const ethAmount = pos.amountUsd / pos.entryPrice;
      const exitValue = ethAmount * exitPrice;
      const pnl = pos.action === 'BUY' ? exitValue - pos.amountUsd : pos.amountUsd - exitValue;
      if (pos.action === 'BUY') { ledger.ethBalance -= ethAmount; ledger.usdBalance += exitValue; }
      else { ledger.usdBalance -= exitValue; ledger.ethBalance += ethAmount; }
      pos.status = 'CLOSED'; pos.exitPrice = exitPrice; pos.pnl = pnl;
      ledger.tradeHistory.push(pos);
      messages.push(`🔔 ${reason} | Entry: $${pos.entryPrice.toFixed(2)} → Exit: $${exitPrice.toFixed(2)} | PnL: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}`);
    } else { stillOpen.push(pos); }
  }
  ledger.positions = stillOpen;
  saveLedger(ledger);
  return messages;
}

export function getPortfolioSummary(ledger: Ledger, ethPrice: number): string {
  const ethValue = ledger.ethBalance * ethPrice;
  const total = ledger.usdBalance + ethValue;
  const totalPnl = ledger.tradeHistory.reduce((sum, t) => sum + (t.pnl ?? 0), 0);
  return `💼 Portfolio: $${total.toFixed(2)} total | USDC: $${ledger.usdBalance.toFixed(2)} | ETH: ${ledger.ethBalance.toFixed(6)} ($${ethValue.toFixed(2)}) | Open: ${ledger.positions.length} | Realized PnL: ${totalPnl >= 0 ? '+' : ''}$${totalPnl.toFixed(2)}`;
}

export async function sendProofOfLife(wallet: ethers.Wallet): Promise<string | null> {
  try {
    const tx = await wallet.sendTransaction({
      to: wallet.address,
      value: ethers.parseEther('0'),
      data: ethers.hexlify(ethers.toUtf8Bytes('agent:alive')),
    });
    await tx.wait();
    return tx.hash;
  } catch (error: any) {
    console.error('⚠️  Proof-of-life failed:', error.message);
    return null;
  }
}

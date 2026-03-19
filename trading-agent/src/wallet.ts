// src/wallet.ts
// ================================================
// Wallet management for the trading agent.
// Run directly with `npm run wallet` to generate
// a new wallet or check an existing one.
// ================================================

import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
import * as fs from 'fs';

dotenv.config();

// ----- Base Sepolia Config -----
const BASE_SEPOLIA_RPC = process.env.BASE_RPC_URL || 'https://sepolia.base.org';
const BASE_SEPOLIA_CHAIN_ID = 84532;

export const provider = new ethers.JsonRpcProvider(
  BASE_SEPOLIA_RPC,
  { name: 'base-sepolia', chainId: BASE_SEPOLIA_CHAIN_ID }
);

// ----- Load or Create Wallet -----
export function loadWallet(): ethers.Wallet {
  const pk = process.env.AGENT_PRIVATE_KEY;

  if (!pk || pk.trim() === '') {
    console.log('\n⚠️  No AGENT_PRIVATE_KEY found in .env');
    console.log('Generating a new wallet...\n');

    const newWallet = ethers.Wallet.createRandom();
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║  NEW AGENT WALLET CREATED                                   ║');
    console.log('╠══════════════════════════════════════════════════════════════╣');
    console.log(`║  Address:     ${newWallet.address}  ║`);
    console.log(`║  Private Key: ${newWallet.privateKey}  ║`);
    console.log('╠══════════════════════════════════════════════════════════════╣');
    console.log('║  ACTION REQUIRED:                                            ║');
    console.log('║  1. Copy the private key into your .env file                ║');
    console.log('║  2. Fund this address with Base Sepolia ETH:                ║');
    console.log('║     - https://www.coinbase.com/faucets/base-ethereum-goerli-faucet');
    console.log('║     - Or ask in Base Discord #faucet channel                ║');
    console.log('║  3. Run `npm run check` to verify the balance              ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');

    process.exit(0);
  }

  return new ethers.Wallet(pk, provider);
}

// ----- Balance Checks -----
export async function getEthBalance(wallet: ethers.Wallet): Promise<string> {
  const balance = await provider.getBalance(wallet.address);
  return ethers.formatEther(balance);
}

export async function getTokenBalance(
  wallet: ethers.Wallet,
  tokenAddress: string
): Promise<{ balance: string; decimals: number; symbol: string }> {
  const abi = [
    'function balanceOf(address) view returns (uint256)',
    'function decimals() view returns (uint8)',
    'function symbol() view returns (string)',
  ];
  const contract = new ethers.Contract(tokenAddress, abi, provider);
  const [raw, decimals, symbol] = await Promise.all([
    contract.balanceOf(wallet.address),
    contract.decimals(),
    contract.symbol(),
  ]);
  return {
    balance: ethers.formatUnits(raw, decimals),
    decimals,
    symbol,
  };
}

// ----- Run directly: `npm run wallet` -----
const isDirectRun = process.argv[1]?.includes('wallet');
if (isDirectRun) {
  const wallet = loadWallet();
  console.log(`\n🤖 Agent wallet: ${wallet.address}`);
  console.log(`   Network:      Base Sepolia (${BASE_SEPOLIA_CHAIN_ID})`);
  console.log(`   RPC:          ${BASE_SEPOLIA_RPC}\n`);

  getEthBalance(wallet).then(bal => {
    console.log(`   ETH Balance:  ${bal} ETH`);
    if (parseFloat(bal) === 0) {
      console.log('\n   ⚠️  Balance is zero. Fund this address with testnet ETH.');
      console.log('   Faucet: https://www.coinbase.com/faucets/base-ethereum-goerli-faucet\n');
    } else {
      console.log('\n   ✅ Wallet is funded and ready.\n');
    }
  });
}

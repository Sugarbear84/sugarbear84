// src/check.ts
// ================================================
// Quick health check. Run: npm run check
// Verifies wallet, RPC connection, and balances.
// ================================================

import { loadWallet, getEthBalance, provider } from './wallet.js';

async function check() {
  console.log('\n🔍 Agent Health Check\n');

  // 1. Wallet
  const wallet = loadWallet();
  console.log(`   Wallet:    ${wallet.address}`);

  // 2. RPC connection
  try {
    const network = await provider.getNetwork();
    const block = await provider.getBlockNumber();
    console.log(`   Network:   ${network.name} (chain ${network.chainId})`);
    console.log(`   Block:     ${block}`);
  } catch (e: any) {
    console.log(`   ❌ RPC Error: ${e.message}`);
    console.log('   Check BASE_RPC_URL in your .env file.');
    process.exit(1);
  }

  // 3. Balance
  const ethBal = await getEthBalance(wallet);
  console.log(`   ETH:       ${ethBal}`);

  if (parseFloat(ethBal) === 0) {
    console.log('\n   ❌ No ETH. Agent cannot pay gas.');
    console.log('   Fund with testnet ETH first.\n');
  } else if (parseFloat(ethBal) < 0.001) {
    console.log('\n   ⚠️  Low ETH. May run out of gas quickly.\n');
  } else {
    console.log('\n   ✅ Agent is ready to run.\n');
  }

  // 4. Anthropic key
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('   ⚠️  No ANTHROPIC_API_KEY set. Brain will not work.\n');
  } else {
    console.log('   ✅ Anthropic API key configured.\n');
  }
}

check().catch(console.error);

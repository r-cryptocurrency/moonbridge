// Configure all bridge routes
import { createWalletClient, createPublicClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arbitrumNova, arbitrum, mainnet, gnosis } from 'viem/chains';

const PRIVATE_KEY = process.env.PRIVATE_KEY;

if (!PRIVATE_KEY) {
  console.error('ERROR: Please set PRIVATE_KEY environment variable');
  console.error('Usage: PRIVATE_KEY=0x... node configure-routes.js');
  process.exit(1);
}

const BRIDGE_ADDRESSES = {
  42170: '0xd7454c00e705d724140b31DDc9A63E45cC0e1b9c', // Nova
  42161: '0x609B1430b6575590F5C75bcb7db261007d5FED41', // One
  1: '0x609B1430b6575590F5C75bcb7db261007d5FED41',     // Ethereum
  100: '0x7bFF7F20Dd583e0665A5C62A06d2E78ee6f23a01',    // Gnosis
};

const ASSET_IDS = {
  MOON: '0x4d4f4f4e00000000000000000000000000000000000000000000000000000000',
  ETH: '0x4554480000000000000000000000000000000000000000000000000000000000',
  USDC: '0x5553444300000000000000000000000000000000000000000000000000000000',
  DONUT: '0x444f4e5554000000000000000000000000000000000000000000000000000000',
};

// Define which chains each asset is available on
const ASSET_CHAINS = {
  MOON: [42170, 42161, 1],           // Nova, One, Ethereum
  ETH: [42170, 42161, 1, 100],       // All chains
  USDC: [42170, 42161, 1, 100],      // All chains
  DONUT: [42161, 1, 100],            // One, Ethereum, Gnosis (not Nova)
};

const CHAINS = {
  42170: { chain: arbitrumNova, name: 'Arbitrum Nova', rpc: 'https://nova.arbitrum.io/rpc' },
  42161: { chain: arbitrum, name: 'Arbitrum One', rpc: 'https://arb1.arbitrum.io/rpc' },
  1: { chain: mainnet, name: 'Ethereum', rpc: 'https://eth.llamarpc.com' },
  100: { chain: gnosis, name: 'Gnosis', rpc: 'https://rpc.gnosischain.com' },
};

const BRIDGE_ABI = [
  {
    type: 'function',
    name: 'configureRoute',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'assetId', type: 'bytes32' },
      { name: 'chainId', type: 'uint256' },
      { name: 'enabled', type: 'bool' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'isRouteEnabled',
    stateMutability: 'view',
    inputs: [
      { name: 'assetId', type: 'bytes32' },
      { name: 'chainId', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
];

async function configureRoutes() {
  console.log('🔧 Configuring Bridge Routes\n');

  const account = privateKeyToAccount(PRIVATE_KEY);
  console.log(`Using account: ${account.address}\n`);
  console.log('=' .repeat(80) + '\n');

  let totalConfigured = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  // For each source chain
  for (const [sourceChainIdStr, sourceBridgeAddress] of Object.entries(BRIDGE_ADDRESSES)) {
    const sourceChainId = parseInt(sourceChainIdStr);
    const sourceChainConfig = CHAINS[sourceChainId];

    console.log(`\n📍 ${sourceChainConfig.name} (Chain ID: ${sourceChainId})`);
    console.log('-'.repeat(80));

    const publicClient = createPublicClient({
      chain: sourceChainConfig.chain,
      transport: http(sourceChainConfig.rpc),
    });

    const walletClient = createWalletClient({
      account,
      chain: sourceChainConfig.chain,
      transport: http(sourceChainConfig.rpc),
    });

    // For each asset
    for (const [assetName, assetId] of Object.entries(ASSET_IDS)) {
      const assetChains = ASSET_CHAINS[assetName];

      // Skip if asset not available on source chain
      if (!assetChains.includes(sourceChainId)) {
        console.log(`\n  ${assetName}: ⏭️  Not available on this chain`);
        continue;
      }

      console.log(`\n  ${assetName}:`);

      // For each destination chain where asset exists
      for (const destChainId of assetChains) {
        if (destChainId === sourceChainId) continue; // Skip same chain

        const destChainName = CHAINS[destChainId].name;

        try {
          // Check if already enabled
          const isEnabled = await publicClient.readContract({
            address: sourceBridgeAddress,
            abi: BRIDGE_ABI,
            functionName: 'isRouteEnabled',
            args: [assetId, BigInt(destChainId)],
          });

          if (isEnabled) {
            console.log(`    → ${destChainName}: ✅ Already enabled`);
            totalSkipped++;
            continue;
          }

          // Enable route
          console.log(`    → ${destChainName}: Enabling...`);

          const hash = await walletClient.writeContract({
            address: sourceBridgeAddress,
            abi: BRIDGE_ABI,
            functionName: 'configureRoute',
            args: [assetId, BigInt(destChainId), true],
          });

          console.log(`       📤 Tx: ${hash}`);

          const receipt = await publicClient.waitForTransactionReceipt({ hash });

          if (receipt.status === 'success') {
            console.log(`       ✅ Enabled! Gas: ${receipt.gasUsed.toString()}`);
            totalConfigured++;
          } else {
            console.log(`       ❌ Transaction failed`);
            totalErrors++;
          }
        } catch (error) {
          console.log(`    → ${destChainName}: ❌ Error - ${error.message}`);
          totalErrors++;
        }

        // Small delay between transactions
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('\n📊 Summary:');
  console.log(`   ✅ Routes configured: ${totalConfigured}`);
  console.log(`   ⏭️  Routes already enabled: ${totalSkipped}`);
  console.log(`   ❌ Errors: ${totalErrors}`);
  console.log('\n✅ Done!\n');
}

configureRoutes().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

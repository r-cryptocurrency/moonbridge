// Check if routes are configured for all assets
import { createPublicClient, http } from 'viem';
import { arbitrumNova, arbitrum, mainnet, gnosis } from 'viem/chains';

const BRIDGE_ADDRESSES = {
  42170: '0xd7454c00e705d724140b31DDc9A63E45cC0e1b9c',
  42161: '0x609B1430b6575590F5C75bcb7db261007d5FED41',
  1: '0x609B1430b6575590F5C75bcb7db261007d5FED41',
  100: '0x7bFF7F20Dd583e0665A5C62A06d2E78ee6f23a01',
};

const ASSET_IDS = {
  MOON: '0x4d4f4f4e00000000000000000000000000000000000000000000000000000000',
  ETH: '0x4554480000000000000000000000000000000000000000000000000000000000',
  USDC: '0x5553444300000000000000000000000000000000000000000000000000000000',
  DONUT: '0x444f4e5554000000000000000000000000000000000000000000000000000000',
};

const CHAINS = {
  42170: { chain: arbitrumNova, name: 'Arbitrum Nova', rpc: 'https://nova.arbitrum.io/rpc' },
  42161: { chain: arbitrum, name: 'Arbitrum One', rpc: 'https://arb1.arbitrum.io/rpc' },
  1: { chain: mainnet, name: 'Ethereum', rpc: 'https://eth.llamarpc.com' },
  100: { chain: gnosis, name: 'Gnosis', rpc: 'https://rpc.gnosischain.com' },
};

const ROUTE_ABI = [
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

async function checkRoutes() {
  console.log('Checking Bridge Routes Configuration...\n');
  console.log('=' .repeat(80) + '\n');

  for (const [sourceChainIdStr, sourceBridgeAddress] of Object.entries(BRIDGE_ADDRESSES)) {
    const sourceChainId = parseInt(sourceChainIdStr);
    const sourceChainConfig = CHAINS[sourceChainId];

    console.log(`\n📍 ${sourceChainConfig.name} (Source Chain ID: ${sourceChainId})`);
    console.log('-'.repeat(80));

    const client = createPublicClient({
      chain: sourceChainConfig.chain,
      transport: http(sourceChainConfig.rpc),
    });

    for (const [assetName, assetId] of Object.entries(ASSET_IDS)) {
      console.log(`\n  ${assetName}:`);

      for (const [destChainIdStr] of Object.entries(BRIDGE_ADDRESSES)) {
        const destChainId = parseInt(destChainIdStr);
        if (destChainId === sourceChainId) continue;

        const destChainName = CHAINS[destChainId].name;

        try {
          const isEnabled = await client.readContract({
            address: sourceBridgeAddress,
            abi: ROUTE_ABI,
            functionName: 'isRouteEnabled',
            args: [assetId, BigInt(destChainId)],
          });

          console.log(`    → ${destChainName}: ${isEnabled ? '✅ ENABLED' : '❌ DISABLED'}`);
        } catch (error) {
          console.log(`    → ${destChainName}: ❌ Error - ${error.message}`);
        }
      }
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('\n✅ Done!\n');
}

checkRoutes().catch(console.error);

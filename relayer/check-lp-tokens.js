// Script to check LP token bridge addresses
import { createPublicClient, http } from 'viem';
import { arbitrumNova, arbitrum, mainnet, gnosis } from 'viem/chains';

// Bridge proxy addresses (from DEPLOYMENT_COMPLETE.md)
const BRIDGE_ADDRESSES = {
  42170: '0xd7454c00e705d724140b31DDc9A63E45cC0e1b9c', // Arbitrum Nova
  42161: '0x609B1430b6575590F5C75bcb7db261007d5FED41', // Arbitrum One
  1: '0x609B1430b6575590F5C75bcb7db261007d5FED41',     // Ethereum
  100: '0x7bFF7F20Dd583e0665A5C62A06d2E78ee6f23a01',    // Gnosis
};

// Asset IDs (as bytes32)
const ASSET_IDS = {
  MOON: '0x4d4f4f4e00000000000000000000000000000000000000000000000000000000',
  ETH: '0x4554480000000000000000000000000000000000000000000000000000000000',
  USDC: '0x5553444300000000000000000000000000000000000000000000000000000000',
  DONUT: '0x444f4e5554000000000000000000000000000000000000000000000000000000',
};

// ABIs
const BRIDGE_ABI = [
  {
    type: 'function',
    name: 'assetConfigs',
    stateMutability: 'view',
    inputs: [{ name: 'assetId', type: 'bytes32' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'enabled', type: 'bool' },
          { name: 'tokenAddress', type: 'address' },
          { name: 'lpTokenAddress', type: 'address' },
          { name: 'lpFeeBps', type: 'uint16' },
          { name: 'daoFeeBps', type: 'uint16' },
          { name: 'minBridgeAmount', type: 'uint256' },
          { name: 'maxBridgeAmount', type: 'uint256' },
        ],
      },
    ],
  },
];

const LP_TOKEN_ABI = [
  {
    type: 'function',
    name: 'bridge',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
];

// Chain configs
const CHAINS = {
  42170: { chain: arbitrumNova, name: 'Arbitrum Nova', rpc: 'https://nova.arbitrum.io/rpc' },
  42161: { chain: arbitrum, name: 'Arbitrum One', rpc: 'https://arb1.arbitrum.io/rpc' },
  1: { chain: mainnet, name: 'Ethereum', rpc: 'https://eth.llamarpc.com' },
  100: { chain: gnosis, name: 'Gnosis', rpc: 'https://rpc.gnosischain.com' },
};

async function checkLPTokens() {
  console.log('Checking LP Token Bridge Addresses...\n');
  console.log('Expected Bridge Proxy Addresses:');
  Object.entries(BRIDGE_ADDRESSES).forEach(([chainId, address]) => {
    console.log(`  ${CHAINS[chainId].name}: ${address}`);
  });
  console.log('\n' + '='.repeat(80) + '\n');

  for (const [chainIdStr, bridgeAddress] of Object.entries(BRIDGE_ADDRESSES)) {
    const chainId = parseInt(chainIdStr);
    const chainConfig = CHAINS[chainId];

    console.log(`\n${chainConfig.name} (Chain ID: ${chainId})`);
    console.log('-'.repeat(80));

    const client = createPublicClient({
      chain: chainConfig.chain,
      transport: http(chainConfig.rpc),
    });

    // Check each asset
    for (const [assetName, assetId] of Object.entries(ASSET_IDS)) {
      try {
        // Get asset config to find LP token address
        const assetConfig = await client.readContract({
          address: bridgeAddress,
          abi: BRIDGE_ABI,
          functionName: 'assetConfigs',
          args: [assetId],
        });

        console.log(`  ${assetName}:`);
        console.log(`    Raw assetConfig:`, assetConfig);

        const enabled = assetConfig[0];
        const tokenAddress = assetConfig[1];
        const lpTokenAddress = assetConfig[2];

        if (!enabled) {
          console.log(`    Status: ❌ Not enabled on this chain`);
          continue;
        }

        // Check LP token's stored bridge address
        const storedBridgeAddress = await client.readContract({
          address: lpTokenAddress,
          abi: LP_TOKEN_ABI,
          functionName: 'bridge',
        });

        const isCorrect = storedBridgeAddress.toLowerCase() === bridgeAddress.toLowerCase();

        console.log(`  ${assetName}:`);
        console.log(`    LP Token: ${lpTokenAddress}`);
        console.log(`    Stored Bridge: ${storedBridgeAddress}`);
        console.log(`    Expected Bridge: ${bridgeAddress}`);
        console.log(`    Status: ${isCorrect ? '✅ CORRECT' : '❌ MISMATCH!'}`);

        if (!isCorrect) {
          console.log(`    ⚠️  PROBLEM: LP token has wrong bridge address!`);
        }
      } catch (error) {
        console.log(`  ${assetName}: Error - ${error.message}`);
      }
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('\nDone!\n');
}

checkLPTokens().catch(console.error);

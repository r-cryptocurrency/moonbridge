// Safe script to re-add assets - checks first if they exist
import { createWalletClient, createPublicClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arbitrumNova, arbitrum, mainnet, gnosis } from 'viem/chains';

// CONFIGURATION
const PRIVATE_KEY = process.env.PRIVATE_KEY;

if (!PRIVATE_KEY) {
  console.error('ERROR: Please set PRIVATE_KEY environment variable');
  console.error('Usage: PRIVATE_KEY=0x... node fix-assets-safe.js');
  process.exit(1);
}

const BRIDGE_ADDRESSES = {
  42170: '0xd7454c00e705d724140b31DDc9A63E45cC0e1b9c',
  42161: '0x609B1430b6575590F5C75bcb7db261007d5FED41',
  1: '0x609B1430b6575590F5C75bcb7db261007d5FED41',
  100: '0x7bFF7F20Dd583e0665A5C62A06d2E78ee6f23a01',
};

const ASSETS_PER_CHAIN = {
  42170: {
    MOON: {
      assetId: '0x4d4f4f4e00000000000000000000000000000000000000000000000000000000',
      tokenAddress: '0x0057Ac2d777797d31CD3f8f13bF5e927571D6Ad0',
      lpName: 'MoonBridge LP - MOON',
      lpSymbol: 'mbMOON',
    },
    ETH: {
      assetId: '0x4554480000000000000000000000000000000000000000000000000000000000',
      tokenAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
      lpName: 'MoonBridge LP - ETH',
      lpSymbol: 'mbETH',
    },
    USDC: {
      assetId: '0x5553444300000000000000000000000000000000000000000000000000000000',
      tokenAddress: '0x750ba8b76187092b0d1e87e28daaf484d1b5273b',
      lpName: 'MoonBridge LP - USDC',
      lpSymbol: 'mbUSDC',
    },
  },
  42161: {
    MOON: {
      assetId: '0x4d4f4f4e00000000000000000000000000000000000000000000000000000000',
      tokenAddress: '0x24404DC041d74cd03cFE28855F555559390C931b',
      lpName: 'MoonBridge LP - MOON',
      lpSymbol: 'mbMOON',
    },
    ETH: {
      assetId: '0x4554480000000000000000000000000000000000000000000000000000000000',
      tokenAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
      lpName: 'MoonBridge LP - ETH',
      lpSymbol: 'mbETH',
    },
    USDC: {
      assetId: '0x5553444300000000000000000000000000000000000000000000000000000000',
      tokenAddress: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
      lpName: 'MoonBridge LP - USDC',
      lpSymbol: 'mbUSDC',
    },
    DONUT: {
      assetId: '0x444f4e5554000000000000000000000000000000000000000000000000000000',
      tokenAddress: '0xF42e2B8bc2aF8B110b65be98dB1321B1ab8D44f5',
      lpName: 'MoonBridge LP - DONUT',
      lpSymbol: 'mbDONUT',
    },
  },
  1: {
    MOON: {
      assetId: '0x4d4f4f4e00000000000000000000000000000000000000000000000000000000',
      tokenAddress: '0xb2490e357980cE57bF5745e181e537a64Eb367B1',
      lpName: 'MoonBridge LP - MOON',
      lpSymbol: 'mbMOON',
    },
    ETH: {
      assetId: '0x4554480000000000000000000000000000000000000000000000000000000000',
      tokenAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
      lpName: 'MoonBridge LP - ETH',
      lpSymbol: 'mbETH',
    },
    USDC: {
      assetId: '0x5553444300000000000000000000000000000000000000000000000000000000',
      tokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      lpName: 'MoonBridge LP - USDC',
      lpSymbol: 'mbUSDC',
    },
    DONUT: {
      assetId: '0x444f4e5554000000000000000000000000000000000000000000000000000000',
      tokenAddress: '0xC0F9bD5Fa5698B6505F643900FFA515Ea5dF54A9',
      lpName: 'MoonBridge LP - DONUT',
      lpSymbol: 'mbDONUT',
    },
  },
  100: {
    ETH: {
      assetId: '0x4554480000000000000000000000000000000000000000000000000000000000',
      tokenAddress: '0x6A023CCd1ff6F2045C3309768eAd9E68F978f6e1',
      lpName: 'MoonBridge LP - ETH',
      lpSymbol: 'mbETH',
    },
    USDC: {
      assetId: '0x5553444300000000000000000000000000000000000000000000000000000000',
      tokenAddress: '0xDDAfbb505ad214D7b80b1f830fcCc89B60fb7A83',
      lpName: 'MoonBridge LP - USDC',
      lpSymbol: 'mbUSDC',
    },
    DONUT: {
      assetId: '0x444f4e5554000000000000000000000000000000000000000000000000000000',
      tokenAddress: '0x524B969793a64a602342d89BC2789D43a016B13A',
      lpName: 'MoonBridge LP - DONUT',
      lpSymbol: 'mbDONUT',
    },
  },
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
  {
    type: 'function',
    name: 'addAsset',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'assetId', type: 'bytes32' },
      { name: 'tokenAddress', type: 'address' },
      { name: 'lpName', type: 'string' },
      { name: 'lpSymbol', type: 'string' },
    ],
    outputs: [],
  },
];

async function fixAssets() {
  console.log('🔧 MoonBridge Asset Configuration Fix (Safe Mode)\n');

  const account = privateKeyToAccount(PRIVATE_KEY);
  console.log(`Using account: ${account.address}\n`);
  console.log('=' .repeat(80) + '\n');

  let totalAdded = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  for (const [chainIdStr, assets] of Object.entries(ASSETS_PER_CHAIN)) {
    const chainId = parseInt(chainIdStr);
    const chainConfig = CHAINS[chainId];
    const bridgeAddress = BRIDGE_ADDRESSES[chainId];

    console.log(`\n📍 ${chainConfig.name} (Chain ID: ${chainId})`);
    console.log('-'.repeat(80));

    const publicClient = createPublicClient({
      chain: chainConfig.chain,
      transport: http(chainConfig.rpc),
    });

    const walletClient = createWalletClient({
      account,
      chain: chainConfig.chain,
      transport: http(chainConfig.rpc),
    });

    for (const [assetName, config] of Object.entries(assets)) {
      console.log(`\n  ${assetName}:`);

      try {
        // Check if asset already exists
        const assetConfig = await publicClient.readContract({
          address: bridgeAddress,
          abi: BRIDGE_ABI,
          functionName: 'assetConfigs',
          args: [config.assetId],
        });

        // Access as object properties (viem returns tuples as objects)
        const lpTokenAddress = assetConfig.lpTokenAddress;

        if (lpTokenAddress && lpTokenAddress !== '0x0000000000000000000000000000000000000000') {
          console.log(`    ℹ️  Asset already configured (LP Token: ${lpTokenAddress})`);
          console.log(`    ⏭️  Skipping...`);
          totalSkipped++;
          continue;
        }

        // Asset needs to be added
        console.log(`    Token: ${config.tokenAddress}`);
        console.log(`    Adding asset...`);

        const hash = await walletClient.writeContract({
          address: bridgeAddress,
          abi: BRIDGE_ABI,
          functionName: 'addAsset',
          args: [config.assetId, config.tokenAddress, config.lpName, config.lpSymbol],
        });

        console.log(`    📤 Transaction: ${hash}`);
        console.log(`    ⏳ Waiting for confirmation...`);

        const receipt = await publicClient.waitForTransactionReceipt({ hash });

        if (receipt.status === 'success') {
          console.log(`    ✅ Confirmed! Gas used: ${receipt.gasUsed.toString()}`);
          totalAdded++;
        } else {
          console.log(`    ❌ Transaction reverted`);
          totalErrors++;
        }
      } catch (error) {
        console.log(`    ❌ Error: ${error.message}`);
        totalErrors++;
      }

      // Delay between transactions
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('\n📊 Summary:');
  console.log(`   ✅ Assets added: ${totalAdded}`);
  console.log(`   ⏭️  Assets skipped (already configured): ${totalSkipped}`);
  console.log(`   ❌ Errors: ${totalErrors}`);
  console.log('\n✅ Done!\n');
}

fixAssets().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

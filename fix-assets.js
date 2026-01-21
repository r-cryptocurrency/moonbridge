// Script to generate transactions for re-adding assets to all bridge contracts
import { createWalletClient, createPublicClient, http, encodeFunctionData } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arbitrumNova, arbitrum, mainnet, gnosis } from 'viem/chains';

// CONFIGURATION - You need to set your private key
const PRIVATE_KEY = process.env.PRIVATE_KEY;

if (!PRIVATE_KEY) {
  console.error('ERROR: Please set PRIVATE_KEY environment variable');
  console.error('Usage: PRIVATE_KEY=0x... node fix-assets.js');
  process.exit(1);
}

// Bridge addresses
const BRIDGE_ADDRESSES = {
  42170: '0xd7454c00e705d724140b31DDc9A63E45cC0e1b9c', // Arbitrum Nova
  42161: '0x609B1430b6575590F5C75bcb7db261007d5FED41', // Arbitrum One
  1: '0x609B1430b6575590F5C75bcb7db261007d5FED41',     // Ethereum
  100: '0x7bFF7F20Dd583e0665A5C62A06d2E78ee6f23a01',    // Gnosis
};

// Asset configurations per chain
const ASSETS_PER_CHAIN = {
  42170: { // Arbitrum Nova
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
  42161: { // Arbitrum One
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
  1: { // Ethereum
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
  100: { // Gnosis
    ETH: {
      assetId: '0x4554480000000000000000000000000000000000000000000000000000000000',
      tokenAddress: '0x6A023CCd1ff6F2045C3309768eAD9E68F978f6e1',
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

// Chain configs
const CHAINS = {
  42170: { chain: arbitrumNova, name: 'Arbitrum Nova', rpc: 'https://nova.arbitrum.io/rpc' },
  42161: { chain: arbitrum, name: 'Arbitrum One', rpc: 'https://arb1.arbitrum.io/rpc' },
  1: { chain: mainnet, name: 'Ethereum', rpc: 'https://eth.llamarpc.com' },
  100: { chain: gnosis, name: 'Gnosis', rpc: 'https://rpc.gnosischain.com' },
};

// ABI for addAsset function
const ADD_ASSET_ABI = [
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
  console.log('🔧 MoonBridge Asset Configuration Fix\n');
  console.log('This will re-add all assets to all bridge contracts.');
  console.log('You need to sign transactions on each chain.\n');

  const account = privateKeyToAccount(PRIVATE_KEY);
  console.log(`Using account: ${account.address}\n`);
  console.log('=' .repeat(80) + '\n');

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
      console.log(`\n  Adding ${assetName}...`);
      console.log(`    Token Address: ${config.tokenAddress}`);
      console.log(`    LP Name: ${config.lpName}`);
      console.log(`    LP Symbol: ${config.lpSymbol}`);

      try {
        // Encode the transaction
        const data = encodeFunctionData({
          abi: ADD_ASSET_ABI,
          functionName: 'addAsset',
          args: [config.assetId, config.tokenAddress, config.lpName, config.lpSymbol],
        });

        // Send transaction
        const hash = await walletClient.writeContract({
          address: bridgeAddress,
          abi: ADD_ASSET_ABI,
          functionName: 'addAsset',
          args: [config.assetId, config.tokenAddress, config.lpName, config.lpSymbol],
        });

        console.log(`    ✅ Transaction sent: ${hash}`);
        console.log(`    Waiting for confirmation...`);

        // Wait for transaction
        const receipt = await publicClient.waitForTransactionReceipt({ hash });

        if (receipt.status === 'success') {
          console.log(`    ✅ Confirmed! Gas used: ${receipt.gasUsed.toString()}`);
        } else {
          console.log(`    ❌ Transaction failed`);
        }
      } catch (error) {
        console.log(`    ❌ Error: ${error.message}`);
        if (error.message.includes('AssetAlreadyExists')) {
          console.log(`    ℹ️  Asset already exists, skipping...`);
        }
      }

      // Small delay between transactions
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('\n✅ Done! All assets have been re-added.\n');
  console.log('Run check-lp-tokens.js to verify the configuration.\n');
}

fixAssets().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

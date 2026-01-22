// Script to check LP token balances and configuration
const { createPublicClient, http, formatUnits } = require('viem');
const { arbitrumNova, arbitrum } = require('viem/chains');

// Your wallet address
const USER_ADDRESS = '0x536aFD811809E2Ea5d8A66FF0c42B7a5D9de2093';

// Bridge addresses
const BRIDGES = {
  42170: '0xd7454c00e705d724140b31DDc9A63E45cC0e1b9c', // Nova
  42161: '0x609B1430b6575590F5C75bcb7db261007d5FED41', // One
};

// MOON asset ID
const MOON_ASSET_ID = '0x4d4f4f4e00000000000000000000000000000000000000000000000000000000';

// ABIs - use getAssetConfig instead of assetConfigs
const BRIDGE_ABI = [
  {
    type: 'function',
    name: 'getAssetConfig',
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

const ERC20_ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'decimals',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
];

async function checkChain(chainId, chainName, client, bridgeAddress) {
  console.log(`\n🔵 ${chainName}\n`);

  try {
    // Get asset config
    const config = await client.readContract({
      address: bridgeAddress,
      abi: BRIDGE_ABI,
      functionName: 'getAssetConfig',
      args: [MOON_ASSET_ID],
    });

    console.log('Asset Config:');
    console.log(`  Enabled: ${config.enabled}`);
    console.log(`  Token Address: ${config.tokenAddress}`);
    console.log(`  LP Token Address: ${config.lpTokenAddress}`);

    const lpTokenAddress = config.lpTokenAddress;

    // Get LP token balance
    const lpBalance = await client.readContract({
      address: lpTokenAddress,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [USER_ADDRESS],
    });

    console.log(`\nLP Token Balance: ${formatUnits(lpBalance, 18)} LP tokens`);

    // Get LP token allowance
    const lpAllowance = await client.readContract({
      address: lpTokenAddress,
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [USER_ADDRESS, bridgeAddress],
    });

    console.log(`LP Token Allowance: ${formatUnits(lpAllowance, 18)} LP tokens`);

    if (lpBalance > 0n && lpAllowance === 0n) {
      console.log('\n❌ PROBLEM: You have LP tokens but NO allowance set for withdrawals!');
      console.log('   You need to approve the bridge contract to spend your LP tokens.');
    } else if (lpBalance > 0n && lpAllowance > 0n) {
      console.log('\n✅ LP tokens and allowance are set correctly.');
    } else if (lpBalance === 0n) {
      console.log('\n⚠️  No LP tokens found in this wallet.');
    }

  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    if (error.details) {
      console.error(`   Details: ${error.details}`);
    }
  }
}

async function main() {
  console.log(`\nChecking LP tokens for address: ${USER_ADDRESS}\n`);
  console.log('='.repeat(80));

  // Check Arbitrum Nova
  const novaClient = createPublicClient({
    chain: arbitrumNova,
    transport: http('https://nova.arbitrum.io/rpc'),
  });

  await checkChain(42170, 'Arbitrum Nova', novaClient, BRIDGES[42170]);

  // Check Arbitrum One
  const oneClient = createPublicClient({
    chain: arbitrum,
    transport: http('https://arb1.arbitrum.io/rpc'),
  });

  await checkChain(42161, 'Arbitrum One', oneClient, BRIDGES[42161]);

  console.log('\n' + '='.repeat(80) + '\n');
}

main().catch(console.error);

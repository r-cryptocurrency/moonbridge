// Script to check LP token balances and configuration
const { createPublicClient, http } = require('viem');
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
];

async function checkLPTokens() {
  console.log(`\nChecking LP tokens for address: ${USER_ADDRESS}\n`);
  console.log('='.repeat(80));

  // Check Arbitrum Nova
  console.log('\n🔵 Arbitrum Nova\n');
  const novaClient = createPublicClient({
    chain: arbitrumNova,
    transport: http('https://nova.arbitrum.io/rpc'),
  });

  try {
    // Get asset config
    const novaConfig = await novaClient.readContract({
      address: BRIDGES[42170],
      abi: BRIDGE_ABI,
      functionName: 'assetConfigs',
      args: [MOON_ASSET_ID],
    });

    console.log('Asset Config:');
    console.log(`  Enabled: ${novaConfig[0]}`);
    console.log(`  Token Address: ${novaConfig[1]}`);
    console.log(`  LP Token Address: ${novaConfig[2]}`);

    const lpTokenAddress = novaConfig[2];

    // Get LP token balance
    const lpBalance = await novaClient.readContract({
      address: lpTokenAddress,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [USER_ADDRESS],
    });

    console.log(`\n  LP Token Balance: ${lpBalance.toString()} (${(Number(lpBalance) / 1e18).toFixed(6)})`);

    // Get LP token allowance
    const lpAllowance = await novaClient.readContract({
      address: lpTokenAddress,
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [USER_ADDRESS, BRIDGES[42170]],
    });

    console.log(`  LP Token Allowance: ${lpAllowance.toString()} (${(Number(lpAllowance) / 1e18).toFixed(6)})`);

    if (lpBalance > 0n && lpAllowance === 0n) {
      console.log('\n  ⚠️  WARNING: You have LP tokens but no allowance set!');
    }
  } catch (error) {
    console.error(`  Error: ${error.message}`);
  }

  // Check Arbitrum One
  console.log('\n\n🔵 Arbitrum One\n');
  const oneClient = createPublicClient({
    chain: arbitrum,
    transport: http('https://arb1.arbitrum.io/rpc'),
  });

  try {
    // Get asset config
    const oneConfig = await oneClient.readContract({
      address: BRIDGES[42161],
      abi: BRIDGE_ABI,
      functionName: 'assetConfigs',
      args: [MOON_ASSET_ID],
    });

    console.log('Asset Config:');
    console.log(`  Enabled: ${oneConfig[0]}`);
    console.log(`  Token Address: ${oneConfig[1]}`);
    console.log(`  LP Token Address: ${oneConfig[2]}`);

    const lpTokenAddress = oneConfig[2];

    // Get LP token balance
    const lpBalance = await oneClient.readContract({
      address: lpTokenAddress,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [USER_ADDRESS],
    });

    console.log(`\n  LP Token Balance: ${lpBalance.toString()} (${(Number(lpBalance) / 1e18).toFixed(6)})`);

    // Get LP token allowance
    const lpAllowance = await oneClient.readContract({
      address: lpTokenAddress,
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [USER_ADDRESS, BRIDGES[42161]],
    });

    console.log(`  LP Token Allowance: ${lpAllowance.toString()} (${(Number(lpAllowance) / 1e18).toFixed(6)})`);

    if (lpBalance > 0n && lpAllowance === 0n) {
      console.log('\n  ⚠️  WARNING: You have LP tokens but no allowance set!');
    }
  } catch (error) {
    console.error(`  Error: ${error.message}`);
  }

  console.log('\n' + '='.repeat(80) + '\n');
}

checkLPTokens().catch(console.error);

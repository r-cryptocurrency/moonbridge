// Comprehensive LP token diagnostic
const { createPublicClient, http, formatUnits } = require('viem');
const { arbitrumNova, arbitrum } = require('viem/chains');

// LP Token addresses from contract
const LP_TOKENS = {
  nova: '0x3A691b89A701e3895E533204805E5975463bCbE5',
  one: '0x16088b4f47b4c68Fe0F2Bd8bcAF87DfBBA33B372',
};

// Bridge addresses
const BRIDGES = {
  nova: '0xd7454c00e705d724140b31DDc9A63E45cC0e1b9c',
  one: '0x609B1430b6575590F5C75bcb7db261007d5FED41',
};

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
    name: 'totalSupply',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'name',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
  {
    type: 'function',
    name: 'symbol',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
];

async function checkLPToken(chainName, client, lpTokenAddress, bridgeAddress) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🔵 ${chainName}`);
  console.log(`${'='.repeat(80)}\n`);

  try {
    // Get LP token info
    const name = await client.readContract({
      address: lpTokenAddress,
      abi: ERC20_ABI,
      functionName: 'name',
    });

    const symbol = await client.readContract({
      address: lpTokenAddress,
      abi: ERC20_ABI,
      functionName: 'symbol',
    });

    const totalSupply = await client.readContract({
      address: lpTokenAddress,
      abi: ERC20_ABI,
      functionName: 'totalSupply',
    });

    console.log(`LP Token Info:`);
    console.log(`  Address: ${lpTokenAddress}`);
    console.log(`  Name: ${name}`);
    console.log(`  Symbol: ${symbol}`);
    console.log(`  Total Supply: ${formatUnits(totalSupply, 18)} LP tokens\n`);

    // Prompt for wallet address
    console.log(`Please enter your wallet address (or press Enter to skip):`);

    // Check user's wallet
    const testAddresses = [
      '0xb7F4b148A08ff36D66AC6BE6D7Da0D4CF24772A0', // User wallet
      '0x536aFD811809E2Ea5d8A66FF0c42B7a5D9de2093', // Relayer
    ];

    for (const address of testAddresses) {
      const balance = await client.readContract({
        address: lpTokenAddress,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [address],
      });

      const allowance = await client.readContract({
        address: lpTokenAddress,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [address, bridgeAddress],
      });

      if (balance > 0n) {
        console.log(`\n  Wallet: ${address}`);
        console.log(`    Balance: ${formatUnits(balance, 18)} LP tokens`);
        console.log(`    Allowance: ${formatUnits(allowance, 18)} LP tokens`);

        if (allowance === 0n) {
          console.log(`    ❌ PROBLEM: Has LP tokens but NO approval!`);
        } else if (allowance < balance) {
          console.log(`    ⚠️  WARNING: Approval less than balance`);
        } else {
          console.log(`    ✅ Properly approved`);
        }
      }
    }

  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
  }
}

async function main() {
  console.log(`\nLP Token Diagnostic Tool`);
  console.log(`\nThis script will check LP token balances and approvals.`);
  console.log(`If you see your wallet with LP tokens but no approval, that's the issue!\n`);

  // Check Arbitrum Nova
  const novaClient = createPublicClient({
    chain: arbitrumNova,
    transport: http('https://nova.arbitrum.io/rpc'),
  });

  await checkLPToken('Arbitrum Nova', novaClient, LP_TOKENS.nova, BRIDGES.nova);

  // Check Arbitrum One
  const oneClient = createPublicClient({
    chain: arbitrum,
    transport: http('https://arb1.arbitrum.io/rpc'),
  });

  await checkLPToken('Arbitrum One', oneClient, LP_TOKENS.one, BRIDGES.one);

  console.log(`\n${'='.repeat(80)}`);
  console.log(`\nSUMMARY:`);
  console.log(`If you don't see your wallet address above, it means the script`);
  console.log(`only checked the relayer address. The website should be reading`);
  console.log(`your LP balance from these contract addresses:\n`);
  console.log(`  Nova LP Token: ${LP_TOKENS.nova}`);
  console.log(`  One LP Token: ${LP_TOKENS.one}\n`);
  console.log(`If the website shows 0 LP tokens but you know you have some,`);
  console.log(`the issue is likely in the frontend hooks (useLiquidity).\n`);
  console.log(`${'='.repeat(80)}\n`);
}

main().catch(console.error);

// Manual bridge fulfillment script - One to Nova
import { createWalletClient, createPublicClient, http, parseEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arbitrumNova } from 'viem/chains';
import 'dotenv/config';

const BRIDGE_ABI = [
  {
    type: 'function',
    name: 'fulfillBridge',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'bridgeId', type: 'bytes32' },
      { name: 'assetId', type: 'bytes32' },
      { name: 'recipient', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'fromChainId', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'processedBridges',
    stateMutability: 'view',
    inputs: [{ name: 'bridgeId', type: 'bytes32' }],
    outputs: [{ name: '', type: 'bool' }],
  },
];

// Stuck bridge transaction details (from One to Nova)
// Transaction: https://arbiscan.io/tx/0x3fe0417ecad6a21131a976a8299a2f55c372f6d4957a56e75f64c3ef18588f66
const BRIDGE_ID = '0x512f940903119cd54974933d8c932e22146b1442918c7018395397e52f405ec0';
const ASSET_ID = '0x4d4f4f4e00000000000000000000000000000000000000000000000000000000'; // MOON
const RECIPIENT = '0xb7F4b148A08ff36D66AC6BE6D7Da0D4CF24772A0'; // 002timmy.eth
const AMOUNT = parseEther('0.99'); // 0.99 MOON (after 1% fee)
const FROM_CHAIN_ID = 42161n; // Arbitrum One

const BRIDGE_NOVA_ADDRESS = '0xd7454c00e705d724140b31DDc9A63E45cC0e1b9c';

async function main() {
  const privateKey = process.env.RELAYER_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('RELAYER_PRIVATE_KEY required');
  }

  const account = privateKeyToAccount(privateKey);
  console.log(`Using relayer: ${account.address}\n`);

  const publicClient = createPublicClient({
    chain: arbitrumNova,
    transport: http('https://nova.arbitrum.io/rpc'),
  });

  const walletClient = createWalletClient({
    account,
    chain: arbitrumNova,
    transport: http('https://nova.arbitrum.io/rpc'),
  });

  // Check if already processed
  console.log(`Checking if bridge ${BRIDGE_ID} is already processed...`);
  const isProcessed = await publicClient.readContract({
    address: BRIDGE_NOVA_ADDRESS,
    abi: BRIDGE_ABI,
    functionName: 'processedBridges',
    args: [BRIDGE_ID],
  });

  if (isProcessed) {
    console.log('❌ Bridge already processed');
    return;
  }

  console.log('✅ Bridge not yet processed\n');

  console.log('Fulfilling bridge:');
  console.log(`  Bridge ID: ${BRIDGE_ID}`);
  console.log(`  Recipient: ${RECIPIENT}`);
  console.log(`  Amount: 0.99 MOON`);
  console.log(`  From Chain: Arbitrum One (42161)\n`);

  try {
    const hash = await walletClient.writeContract({
      address: BRIDGE_NOVA_ADDRESS,
      abi: BRIDGE_ABI,
      functionName: 'fulfillBridge',
      args: [BRIDGE_ID, ASSET_ID, RECIPIENT, AMOUNT, FROM_CHAIN_ID],
    });

    console.log(`✅ Transaction submitted: ${hash}`);
    console.log('Waiting for confirmation...\n');

    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    if (receipt.status === 'success') {
      console.log(`✅ Bridge fulfilled successfully!`);
      console.log(`   Block: ${receipt.blockNumber}`);
      console.log(`   Gas used: ${receipt.gasUsed.toString()}`);
      console.log(`\n🎉 Your 0.99 MOON should now be in your wallet on Arbitrum Nova!`);
    } else {
      console.log('❌ Transaction failed');
    }
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
  }
}

main().catch(console.error);

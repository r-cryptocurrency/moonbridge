// Manual bridge fulfillment script
import { createWalletClient, createPublicClient, http, parseEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arbitrum } from 'viem/chains';
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

// Your stuck bridge transaction details (from Nova to One)
const BRIDGE_ID = '0x293CD31849C5F9C447AFFDF83DE52AE88D0B994B61AF0EBF9AAA47CAB4856170';
const ASSET_ID = '0x4d4f4f4e00000000000000000000000000000000000000000000000000000000'; // MOON
const RECIPIENT = '0xb7F4b148A08ff36D66AC6BE6D7Da0D4CF24772A0'; // 002timmy.eth
const AMOUNT = parseEther('0.99'); // 0.99 MOON (after 1% fee)
const FROM_CHAIN_ID = 42170n; // Nova

const BRIDGE_ONE_ADDRESS = '0x609B1430b6575590F5C75bcb7db261007d5FED41';

async function main() {
  const privateKey = process.env.RELAYER_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('RELAYER_PRIVATE_KEY required');
  }

  const account = privateKeyToAccount(privateKey);
  console.log(`Using relayer: ${account.address}\n`);

  const publicClient = createPublicClient({
    chain: arbitrum,
    transport: http('https://arb1.arbitrum.io/rpc'),
  });

  const walletClient = createWalletClient({
    account,
    chain: arbitrum,
    transport: http('https://arb1.arbitrum.io/rpc'),
  });

  // Check if already processed
  console.log(`Checking if bridge ${BRIDGE_ID} is already processed...`);
  const isProcessed = await publicClient.readContract({
    address: BRIDGE_ONE_ADDRESS,
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
  console.log(`  From Chain: Nova (42170)\n`);

  try {
    const hash = await walletClient.writeContract({
      address: BRIDGE_ONE_ADDRESS,
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
      console.log(`\n🎉 Your 0.99 MOON should now be in your wallet on Arbitrum One!`);
    } else {
      console.log('❌ Transaction failed');
    }
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
  }
}

main().catch(console.error);

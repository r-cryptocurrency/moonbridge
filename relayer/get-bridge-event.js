// Get bridge event details from transaction
import { createPublicClient, http, decodeEventLog } from 'viem';
import { arbitrum } from 'viem/chains';

const BRIDGE_ABI = [
  {
    type: 'event',
    name: 'BridgeRequested',
    inputs: [
      { name: 'bridgeId', type: 'bytes32', indexed: true },
      { name: 'assetId', type: 'bytes32', indexed: true },
      { name: 'sender', type: 'address', indexed: true },
      { name: 'recipient', type: 'address', indexed: false },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'toChainId', type: 'uint256', indexed: false },
      { name: 'fee', type: 'uint256', indexed: false },
    ],
  },
];

async function main() {
  const client = createPublicClient({
    chain: arbitrum,
    transport: http('https://arb1.arbitrum.io/rpc'),
  });

  const receipt = await client.getTransactionReceipt({
    hash: '0x3fe0417ecad6a21131a976a8299a2f55c372f6d4957a56e75f64c3ef18588f66',
  });

  console.log('Transaction logs:\n');

  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({
        abi: BRIDGE_ABI,
        data: log.data,
        topics: log.topics,
      });

      console.log('BridgeRequested Event:');
      console.log(`  bridgeId: ${decoded.args.bridgeId}`);
      console.log(`  assetId: ${decoded.args.assetId}`);
      console.log(`  sender: ${decoded.args.sender}`);
      console.log(`  recipient: ${decoded.args.recipient}`);
      console.log(`  amount: ${decoded.args.amount.toString()}`);
      console.log(`  toChainId: ${decoded.args.toChainId.toString()}`);
      console.log(`  fee: ${decoded.args.fee.toString()}`);
    } catch (e) {
      // Not a BridgeRequested event, skip
    }
  }
}

main().catch(console.error);

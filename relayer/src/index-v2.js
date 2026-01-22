/**
 * MoonBridge V2 Relayer
 *
 * Monitors bridge requests across multiple chains and automatically fulfills them
 * on the destination chain when sufficient liquidity is available.
 *
 * Supported chains:
 * - Arbitrum Nova (42170)
 * - Arbitrum One (42161)
 * - Ethereum Mainnet (1)
 * - Gnosis Chain (100)
 *
 * @version 2.0.0
 */

import 'dotenv/config';
import {
  createPublicClient,
  createWalletClient,
  http,
  formatEther,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arbitrum, arbitrumNova, mainnet, gnosis } from 'viem/chains';

// =============================================================================
// Configuration
// =============================================================================

/**
 * Bridge contract addresses per chain
 */
const BRIDGE_ADDRESSES = {
  42170: '0xd7454c00e705d724140b31DDc9A63E45cC0e1b9c', // Nova
  42161: '0x609B1430b6575590F5C75bcb7db261007d5FED41', // One
  1: '0x609B1430b6575590F5C75bcb7db261007d5FED41',     // Ethereum
  100: '0x7bFF7F20Dd583e0665A5C62A06d2E78ee6f23a01',    // Gnosis
};

/**
 * Chain configurations with RPC endpoints and block limits
 */
const CHAINS = {
  42170: {
    chain: arbitrumNova,
    name: 'Arbitrum Nova',
    rpc: 'https://nova.arbitrum.io/rpc',
    confirmations: 2,
    maxHistoricalBlocks: 10000,
  },
  42161: {
    chain: arbitrum,
    name: 'Arbitrum One',
    rpc: 'https://arb1.arbitrum.io/rpc',
    confirmations: 2,
    maxHistoricalBlocks: 10000,
  },
  1: {
    chain: mainnet,
    name: 'Ethereum',
    rpc: 'https://eth.llamarpc.com',
    confirmations: 3,
    maxHistoricalBlocks: 1000, // LlamaRPC has 1k block limit
  },
  100: {
    chain: gnosis,
    name: 'Gnosis',
    rpc: 'https://gnosis.drpc.org',
    confirmations: 2,
    maxHistoricalBlocks: 10000,
  },
};

/**
 * Bridge V2 ABI - Only includes events and functions needed by relayer
 */
const BRIDGE_ABI = [
  // BridgeRequested event - Emitted when user initiates a bridge
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
  // BridgeFulfilled event - Emitted when relayer fulfills a bridge
  {
    type: 'event',
    name: 'BridgeFulfilled',
    inputs: [
      { name: 'bridgeId', type: 'bytes32', indexed: true },
      { name: 'assetId', type: 'bytes32', indexed: true },
      { name: 'recipient', type: 'address', indexed: true },
      { name: 'fulfilledAmount', type: 'uint256', indexed: false },
      { name: 'requestedAmount', type: 'uint256', indexed: false },
      { name: 'fromChainId', type: 'uint256', indexed: false },
    ],
  },
  // View function - Check if bridge has been processed
  {
    type: 'function',
    name: 'processedBridges',
    stateMutability: 'view',
    inputs: [{ name: 'bridgeId', type: 'bytes32' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  // View function - Get available liquidity for an asset
  {
    type: 'function',
    name: 'getAvailableLiquidity',
    stateMutability: 'view',
    inputs: [{ name: 'assetId', type: 'bytes32' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  // Write function - Fulfill a bridge request on destination chain
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
  // Write function - Process partial fill refund on source chain
  {
    type: 'function',
    name: 'processPartialFillRefund',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'bridgeId', type: 'bytes32' },
      { name: 'fulfilledAmount', type: 'uint256' },
    ],
    outputs: [],
  },
];

// =============================================================================
// State
// =============================================================================

/**
 * Set of bridge IDs that have been processed to prevent duplicate fulfillments
 */
const processedBridges = new Set();

// =============================================================================
// Client Initialization
// =============================================================================

/**
 * Initialize blockchain clients for all supported chains
 *
 * @returns {Object} Object containing clients and relayer account
 * @throws {Error} If RELAYER_PRIVATE_KEY is not set
 */
function initializeClients() {
  const privateKey = process.env.RELAYER_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('RELAYER_PRIVATE_KEY environment variable required');
  }

  const account = privateKeyToAccount(privateKey);
  console.log(`\n🔧 Relayer address: ${account.address}\n`);

  const clients = {};

  for (const [chainId, config] of Object.entries(CHAINS)) {
    const publicClient = createPublicClient({
      chain: config.chain,
      transport: http(config.rpc),
    });

    const walletClient = createWalletClient({
      account,
      chain: config.chain,
      transport: http(config.rpc),
    });

    clients[chainId] = {
      public: publicClient,
      wallet: walletClient,
      config,
      bridgeAddress: BRIDGE_ADDRESSES[chainId],
    };
  }

  return { clients, account };
}

// =============================================================================
// Bridge Request Processing
// =============================================================================

/**
 * Process a bridge request by fulfilling it on the destination chain
 *
 * @param {Object} clients - Map of chain clients
 * @param {Object} request - Bridge request details
 * @param {string} sourceChainId - Source chain ID where request originated
 */
async function processBridgeRequest(clients, request, sourceChainId) {
  const sourceClient = clients[sourceChainId];
  const destChainId = Number(request.toChainId);
  const destClient = clients[destChainId];

  // Validate destination chain is supported
  if (!destClient) {
    console.log(`  ⚠️  Destination chain ${destChainId} not supported by relayer`);
    return;
  }

  const bridgeId = request.bridgeId;

  // Check if already processed in memory
  if (processedBridges.has(bridgeId)) {
    return;
  }

  console.log(`\n📬 Bridge Request Detected`);
  console.log(`  Bridge ID: ${bridgeId}`);
  console.log(`  Asset: ${request.assetId}`);
  console.log(`  From: ${sourceClient.config.name} → ${destClient.config.name}`);
  console.log(`  Amount: ${formatEther(request.amount)} (after fee)`);
  console.log(`  Recipient: ${request.recipient}`);

  try {
    // Check if already fulfilled on-chain
    const isProcessed = await destClient.public.readContract({
      address: destClient.bridgeAddress,
      abi: BRIDGE_ABI,
      functionName: 'processedBridges',
      args: [bridgeId],
    });

    if (isProcessed) {
      console.log(`  ✅ Already fulfilled`);
      processedBridges.add(bridgeId);
      return;
    }

    // Check available liquidity on destination
    const availableLiquidity = await destClient.public.readContract({
      address: destClient.bridgeAddress,
      abi: BRIDGE_ABI,
      functionName: 'getAvailableLiquidity',
      args: [request.assetId],
    });

    console.log(`  💧 Available liquidity: ${formatEther(availableLiquidity)}`);

    const requestedAmount = request.amount;
    const fulfillAmount = availableLiquidity < requestedAmount ? availableLiquidity : requestedAmount;

    // Cannot fulfill if no liquidity
    if (fulfillAmount === 0n) {
      console.log(`  ❌ No liquidity available - cannot fulfill`);
      return;
    }

    // Fulfill the bridge on destination chain
    console.log(`  🚀 Fulfilling ${formatEther(fulfillAmount)}...`);

    const hash = await destClient.wallet.writeContract({
      address: destClient.bridgeAddress,
      abi: BRIDGE_ABI,
      functionName: 'fulfillBridge',
      args: [
        bridgeId,
        request.assetId,
        request.recipient,
        requestedAmount,
        BigInt(sourceChainId),
      ],
    });

    console.log(`  📤 Fulfill TX: ${hash}`);

    const receipt = await destClient.public.waitForTransactionReceipt({
      hash,
      confirmations: destClient.config.confirmations,
    });

    if (receipt.status === 'success') {
      console.log(`  ✅ Fulfilled! Block: ${receipt.blockNumber}`);
      processedBridges.add(bridgeId);

      // Handle partial fill - process refund on source chain
      if (fulfillAmount < requestedAmount) {
        console.log(`  ⚠️  Partial fill: ${formatEther(fulfillAmount)} / ${formatEther(requestedAmount)}`);
        console.log(`  🔄 Processing refund on source chain...`);

        try {
          const refundHash = await sourceClient.wallet.writeContract({
            address: sourceClient.bridgeAddress,
            abi: BRIDGE_ABI,
            functionName: 'processPartialFillRefund',
            args: [bridgeId, fulfillAmount],
          });

          console.log(`  📤 Refund TX: ${refundHash}`);

          const refundReceipt = await sourceClient.public.waitForTransactionReceipt({
            hash: refundHash,
            confirmations: sourceClient.config.confirmations,
          });

          if (refundReceipt.status === 'success') {
            console.log(`  ✅ Refund processed!`);
          } else {
            console.log(`  ❌ Refund failed`);
          }
        } catch (refundError) {
          console.error(`  ❌ Refund error: ${refundError.message}`);
        }
      }
    } else {
      console.log(`  ❌ Fulfill failed`);
    }
  } catch (error) {
    console.error(`  ❌ Error: ${error.message}`);
  }
}

// =============================================================================
// Event Watching
// =============================================================================

/**
 * Watch for new BridgeRequested events on a specific chain
 *
 * @param {Object} clients - Map of chain clients
 * @param {string} chainId - Chain ID to watch
 * @returns {Function} Unwatch function to stop watching
 */
function watchBridgeRequests(clients, chainId) {
  const client = clients[chainId];

  console.log(`👁️  Watching ${client.config.name}...`);

  const unwatch = client.public.watchContractEvent({
    address: client.bridgeAddress,
    abi: BRIDGE_ABI,
    eventName: 'BridgeRequested',
    onLogs: async (logs) => {
      for (const log of logs) {
        const request = {
          bridgeId: log.args.bridgeId,
          assetId: log.args.assetId,
          sender: log.args.sender,
          recipient: log.args.recipient,
          amount: log.args.amount,
          toChainId: log.args.toChainId,
          fee: log.args.fee,
        };

        await processBridgeRequest(clients, request, chainId);
      }
    },
    onError: (error) => {
      console.error(`❌ Error watching ${client.config.name}: ${error.message}`);
    },
  });

  return unwatch;
}

/**
 * Process historical bridge requests from recent blocks
 *
 * @param {Object} clients - Map of chain clients
 * @param {string} chainId - Chain ID to process
 */
async function processHistoricalRequests(clients, chainId) {
  const client = clients[chainId];

  console.log(`🔍 Checking historical requests on ${client.config.name}...`);

  try {
    const currentBlock = await client.public.getBlockNumber();
    const maxBlocks = BigInt(client.config.maxHistoricalBlocks || 10000);
    const fromBlock = currentBlock - maxBlocks < 0n ? 0n : currentBlock - maxBlocks;

    const logs = await client.public.getLogs({
      address: client.bridgeAddress,
      event: BRIDGE_ABI.find(item => item.name === 'BridgeRequested'),
      fromBlock,
      toBlock: currentBlock,
    });

    console.log(`  Found ${logs.length} historical requests`);

    for (const log of logs) {
      const request = {
        bridgeId: log.args.bridgeId,
        assetId: log.args.assetId,
        sender: log.args.sender,
        recipient: log.args.recipient,
        amount: log.args.amount,
        toChainId: log.args.toChainId,
        fee: log.args.fee,
      };

      await processBridgeRequest(clients, request, chainId);
    }
  } catch (error) {
    console.error(`  Error processing historical requests: ${error.message}`);
  }
}

// =============================================================================
// Main
// =============================================================================

/**
 * Main relayer loop
 * - Initialize clients for all chains
 * - Process historical bridge requests
 * - Watch for new bridge requests
 * - Handle graceful shutdown
 */
async function main() {
  console.log('🌉 MoonBridge V2 Relayer Starting...\n');

  // Initialize blockchain clients
  const { clients, account } = initializeClients();

  // Process recent historical requests on all chains
  for (const chainId of Object.keys(clients)) {
    await processHistoricalRequests(clients, chainId);
  }

  console.log('\n📡 Starting event watchers...\n');

  // Start watching for new requests on all chains
  const unwatchers = Object.keys(clients).map(chainId =>
    watchBridgeRequests(clients, chainId)
  );

  console.log('✅ Relayer running!\n');

  // Graceful shutdown handler
  process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down...');
    unwatchers.forEach(unwatch => unwatch());
    process.exit(0);
  });
}

// Start the relayer
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

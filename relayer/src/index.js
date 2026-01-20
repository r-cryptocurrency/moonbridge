import 'dotenv/config';
import {
  createPublicClient,
  createWalletClient,
  http,
  formatEther,
  parseAbiItem,
  parseEther,
  getAddress,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arbitrum, arbitrumNova, mainnet, gnosis } from 'viem/chains';
import {
  CHAIN_CONFIG,
  getAllChainConfigs,
  getChainConfig,
  getAssetAddress,
  isNativeETH,
  NATIVE_ETH_SENTINEL,
  ASSETS,
  BRIDGE_ABI,
  ERC20_ABI,
  FEES,
  RELAYER_CONFIG,
  assetIdToBytes32,
} from './config.js';

// State tracking for processed requests
const processedRequests = new Map();

// Get viem chain object by chain ID
function getViemChain(chainId) {
  switch (chainId) {
    case 42170:
      return arbitrumNova;
    case 42161:
      return arbitrum;
    case 1:
      return mainnet;
    case 100:
      return gnosis;
    default:
      throw new Error(`Unknown chain ID: ${chainId}`);
  }
}

// Initialize clients for all chains
function initializeClients() {
  const privateKey = process.env.RELAYER_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('RELAYER_PRIVATE_KEY environment variable required');
  }

  const account = privateKeyToAccount(privateKey);
  console.log(`Relayer address: ${account.address}`);

  const clients = { account };

  // Initialize clients for all configured chains
  const chainConfigs = getAllChainConfigs();
  for (const config of chainConfigs) {
    const viemChain = getViemChain(config.chainId);

    clients[config.chainId] = {
      public: createPublicClient({
        chain: viemChain,
        transport: http(config.rpcUrl),
      }),
      wallet: createWalletClient({
        account,
        chain: viemChain,
        transport: http(config.rpcUrl),
      }),
      config,
    };
  }

  return clients;
}

// Get client by chain ID
function getClientByChainId(clients, chainId) {
  const id = typeof chainId === 'bigint' ? Number(chainId) : chainId;
  const client = clients[id];
  if (!client) {
    throw new Error(`No client for chain ID: ${chainId}`);
  }
  return client;
}

// Get asset name from bytes32 ID
function getAssetNameFromBytes32(assetIdBytes32) {
  // Find matching asset
  for (const [name, asset] of Object.entries(ASSETS)) {
    if (assetIdToBytes32(name) === assetIdBytes32) {
      return name;
    }
  }
  return assetIdBytes32;
}

// Check destination liquidity for a specific asset
async function getDestinationLiquidity(clients, destChainId, assetId) {
  const destClient = getClientByChainId(clients, destChainId);
  const assetIdBytes32 = assetIdToBytes32(assetId);

  const liquidity = await destClient.public.readContract({
    address: destClient.config.bridgeAddress,
    abi: BRIDGE_ABI,
    functionName: 'getAvailableLiquidity',
    args: [assetIdBytes32],
  });

  return liquidity;
}

// Check if bridge is already processed on destination
async function isBridgeProcessed(clients, destChainId, bridgeId) {
  const destClient = getClientByChainId(clients, destChainId);

  try {
    const processed = await destClient.public.readContract({
      address: destClient.config.bridgeAddress,
      abi: BRIDGE_ABI,
      functionName: 'processedBridges',
      args: [bridgeId],
    });

    return processed;
  } catch {
    return false;
  }
}

// Execute fulfillBridge on destination chain
async function executeFulfillBridge(clients, bridgeRequest) {
  const destClient = getClientByChainId(clients, bridgeRequest.toChainId);

  console.log(`Executing fulfillBridge on ${destClient.config.name}...`);
  console.log(`  Bridge ID: ${bridgeRequest.bridgeId}`);
  console.log(`  Asset: ${bridgeRequest.assetId}`);
  console.log(`  Amount: ${formatEther(bridgeRequest.amount)}`);

  try {
    const assetIdBytes32 = assetIdToBytes32(bridgeRequest.assetId);
    const assetAddress = getAssetAddress(bridgeRequest.assetId, bridgeRequest.toChainId);
    const isNativeAsset = isNativeETH(assetAddress);

    // For native ETH, we need to send ETH value
    const txOptions = {
      address: destClient.config.bridgeAddress,
      abi: BRIDGE_ABI,
      functionName: 'fulfillBridge',
      args: [
        bridgeRequest.bridgeId,
        assetIdBytes32,
        bridgeRequest.recipient,
        bridgeRequest.amount,
        bridgeRequest.fromChainId,
      ],
      account: clients.account,
    };

    if (isNativeAsset) {
      txOptions.value = bridgeRequest.amount;
    }

    const { request: txRequest } = await destClient.public.simulateContract(txOptions);

    const hash = await destClient.wallet.writeContract(txRequest);
    console.log(`  FulfillBridge TX: ${hash}`);

    // Wait for confirmation
    const receipt = await destClient.public.waitForTransactionReceipt({
      hash,
      confirmations: destClient.config.confirmations,
    });

    console.log(`  FulfillBridge confirmed in block ${receipt.blockNumber}`);
    return { success: true, hash, receipt };
  } catch (error) {
    console.error(`  FulfillBridge failed: ${error.message}`);
    return { success: false, error };
  }
}

// Process a bridge request
async function processBridgeRequest(clients, bridgeRequest) {
  const requestKey = `${bridgeRequest.bridgeId}`;

  // Skip if already processing
  if (processedRequests.has(requestKey)) {
    return;
  }
  processedRequests.set(requestKey, { status: 'processing', timestamp: Date.now() });

  console.log('\n========================================');
  console.log('Processing Bridge Request');
  console.log('========================================');
  console.log(`Bridge ID: ${bridgeRequest.bridgeId}`);
  console.log(`Asset: ${bridgeRequest.assetId}`);
  console.log(`From: ${getChainConfig(bridgeRequest.fromChainId).name}`);
  console.log(`To: ${getChainConfig(bridgeRequest.toChainId).name}`);
  console.log(`Requester: ${bridgeRequest.requester}`);
  console.log(`Recipient: ${bridgeRequest.recipient}`);
  console.log(`Amount: ${formatEther(bridgeRequest.amount)}`);

  try {
    // Check if already processed on destination
    const alreadyProcessed = await isBridgeProcessed(clients, bridgeRequest.toChainId, bridgeRequest.bridgeId);
    if (alreadyProcessed) {
      console.log('Bridge already processed on destination, skipping.');
      processedRequests.set(requestKey, { status: 'completed', timestamp: Date.now() });
      return;
    }

    // Get destination liquidity for this asset
    const liquidity = await getDestinationLiquidity(
      clients,
      bridgeRequest.toChainId,
      bridgeRequest.assetId
    );
    console.log(`Destination Liquidity: ${formatEther(liquidity)} ${bridgeRequest.assetId}`);

    // Check if we have enough liquidity
    if (liquidity < bridgeRequest.amount) {
      console.log(`Insufficient liquidity. Need ${formatEther(bridgeRequest.amount)}, have ${formatEther(liquidity)}`);
      console.log('Skipping this bridge request. Will be queued for LPs to withdraw.');
      processedRequests.set(requestKey, { status: 'insufficient_liquidity', timestamp: Date.now() });
      return;
    }

    // Execute fulfill
    const fulfillResult = await executeFulfillBridge(clients, bridgeRequest);
    if (!fulfillResult.success) {
      // Check if it's because someone else fulfilled
      const nowProcessed = await isBridgeProcessed(clients, bridgeRequest.toChainId, bridgeRequest.bridgeId);
      if (nowProcessed) {
        console.log('Bridge was fulfilled by another relayer');
        processedRequests.set(requestKey, { status: 'completed', timestamp: Date.now() });
        return;
      } else {
        throw new Error(`FulfillBridge failed: ${fulfillResult.error.message}`);
      }
    }

    processedRequests.set(requestKey, { status: 'completed', timestamp: Date.now() });
    console.log('Bridge request processed successfully!');

  } catch (error) {
    console.error(`Error processing bridge request: ${error.message}`);
    processedRequests.set(requestKey, { status: 'error', error: error.message, timestamp: Date.now() });
  }
}

// Watch for bridge requests on a chain
async function watchChain(clients, chain) {
  console.log(`Watching for BridgeRequested events on ${chain.config.name}...`);

  const unwatch = chain.public.watchContractEvent({
    address: chain.config.bridgeAddress,
    abi: BRIDGE_ABI,
    eventName: 'BridgeRequested',
    onLogs: async (logs) => {
      for (const log of logs) {
        // Convert assetId from bytes32 to string
        const assetId = getAssetNameFromBytes32(log.args.assetId);

        const bridgeRequest = {
          bridgeId: log.args.bridgeId,
          assetId: assetId,
          fromChainId: log.args.fromChainId,
          toChainId: log.args.toChainId,
          requester: log.args.requester,
          recipient: log.args.recipient,
          amount: log.args.amount,
          blockNumber: log.blockNumber,
          txHash: log.transactionHash,
        };

        // Wait for confirmations
        const currentBlock = await chain.public.getBlockNumber();
        const confirmations = currentBlock - log.blockNumber;

        if (confirmations >= chain.config.confirmations) {
          await processBridgeRequest(clients, bridgeRequest);
        } else {
          console.log(`Waiting for ${Number(chain.config.confirmations) - Number(confirmations)} more confirmations...`);
          // Schedule recheck
          setTimeout(async () => {
            await processBridgeRequest(clients, bridgeRequest);
          }, (Number(chain.config.confirmations) - Number(confirmations)) * 2000);
        }
      }
    },
    onError: (error) => {
      console.error(`Error watching ${chain.config.name}: ${error.message}`);
    },
  });

  return unwatch;
}

// Process historical bridge requests
async function processHistoricalRequests(clients, chain) {
  console.log(`Checking historical bridge requests on ${chain.config.name}...`);

  try {
    // Get recent BridgeRequested events
    const currentBlock = await chain.public.getBlockNumber();
    const fromBlock = currentBlock - 10000n; // Last ~10000 blocks

    const logs = await chain.public.getLogs({
      address: chain.config.bridgeAddress,
      event: parseAbiItem('event BridgeRequested(bytes32 indexed bridgeId, bytes32 indexed assetId, uint256 indexed fromChainId, uint256 toChainId, address requester, address recipient, uint256 amount)'),
      fromBlock: fromBlock > 0n ? fromBlock : 0n,
      toBlock: currentBlock,
    });

    console.log(`Found ${logs.length} historical bridge requests`);

    for (const log of logs) {
      // Convert assetId from bytes32 to string
      const assetId = getAssetNameFromBytes32(log.args.assetId);

      const bridgeRequest = {
        bridgeId: log.args.bridgeId,
        assetId: assetId,
        fromChainId: log.args.fromChainId,
        toChainId: log.args.toChainId,
        requester: log.args.requester,
        recipient: log.args.recipient,
        amount: log.args.amount,
        blockNumber: log.blockNumber,
        txHash: log.transactionHash,
      };

      // Check if already fulfilled
      const alreadyProcessed = await isBridgeProcessed(clients, bridgeRequest.toChainId, bridgeRequest.bridgeId);
      if (!alreadyProcessed) {
        await processBridgeRequest(clients, bridgeRequest);
      }
    }
  } catch (error) {
    console.error(`Error processing historical bridge requests: ${error.message}`);
  }
}

// Main function
async function main() {
  console.log('========================================');
  console.log('MoonBridge V2 Relayer Starting...');
  console.log('========================================');

  // Validate environment
  const requiredEnvVars = [
    'RELAYER_PRIVATE_KEY',
    'ARBITRUM_NOVA_RPC_URL',
    'ARBITRUM_ONE_RPC_URL',
    'ETHEREUM_RPC_URL',
    'GNOSIS_RPC_URL',
    'BRIDGE_NOVA_ADDRESS',
    'BRIDGE_ONE_ADDRESS',
    'BRIDGE_ETHEREUM_ADDRESS',
    'BRIDGE_GNOSIS_ADDRESS',
  ];

  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      throw new Error(`Missing required environment variable: ${envVar}`);
    }
  }

  // Initialize clients
  const clients = initializeClients();

  // Check relayer balances on all chains
  console.log('\nChecking relayer balances...');

  const chainConfigs = getAllChainConfigs();
  for (const config of chainConfigs) {
    const client = clients[config.chainId];
    const balance = await client.public.getBalance({
      address: clients.account.address,
    });
    console.log(`${config.name} ETH Balance: ${formatEther(balance)} ETH`);
  }

  // Check bridge liquidity for each asset on each chain
  console.log('\nChecking bridge liquidity...');

  for (const config of chainConfigs) {
    console.log(`\n${config.name}:`);
    for (const [assetName, asset] of Object.entries(ASSETS)) {
      // Skip if asset not available on this chain
      if (!asset.addresses[config.chainId]) {
        continue;
      }

      try {
        const liquidity = await getDestinationLiquidity(clients, config.chainId, assetName);
        console.log(`  ${assetName}: ${formatEther(liquidity)}`);
      } catch (error) {
        console.log(`  ${assetName}: Error - ${error.message}`);
      }
    }
  }

  // Process historical requests for all chains
  console.log('\nProcessing historical bridge requests...');
  for (const config of chainConfigs) {
    await processHistoricalRequests(clients, clients[config.chainId]);
  }

  // Start watching all chains
  console.log('\nStarting event watchers...');

  const unwatchers = [];
  for (const config of chainConfigs) {
    const unwatch = await watchChain(clients, clients[config.chainId]);
    unwatchers.push(unwatch);
  }

  console.log('\nRelayer running on 4 chains. Press Ctrl+C to stop.');

  // Handle shutdown
  process.on('SIGINT', () => {
    console.log('\nShutting down...');
    unwatchers.forEach(unwatch => unwatch());
    process.exit(0);
  });

  // Keep process alive
  await new Promise(() => {});
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

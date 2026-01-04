import 'dotenv/config';
import {
  createPublicClient,
  createWalletClient,
  http,
  formatEther,
  parseAbiItem,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arbitrum, arbitrumNova } from 'viem/chains';
import {
  CHAIN_CONFIG,
  getChainConfig,
  getDestinationChain,
  BRIDGE_ABI,
  RequestStatus,
  FEES,
  RELAYER_CONFIG,
} from './config.js';

// State tracking for processed requests
const processedRequests = new Map();

// Initialize clients
function initializeClients() {
  const privateKey = process.env.RELAYER_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('RELAYER_PRIVATE_KEY environment variable required');
  }

  const account = privateKeyToAccount(privateKey);
  console.log(`Relayer address: ${account.address}`);

  // Nova clients
  const novaPublicClient = createPublicClient({
    chain: arbitrumNova,
    transport: http(CHAIN_CONFIG.arbitrumNova.rpcUrl),
  });

  const novaWalletClient = createWalletClient({
    account,
    chain: arbitrumNova,
    transport: http(CHAIN_CONFIG.arbitrumNova.rpcUrl),
  });

  // One clients
  const onePublicClient = createPublicClient({
    chain: arbitrum,
    transport: http(CHAIN_CONFIG.arbitrumOne.rpcUrl),
  });

  const oneWalletClient = createWalletClient({
    account,
    chain: arbitrum,
    transport: http(CHAIN_CONFIG.arbitrumOne.rpcUrl),
  });

  return {
    nova: {
      public: novaPublicClient,
      wallet: novaWalletClient,
      config: CHAIN_CONFIG.arbitrumNova,
    },
    one: {
      public: onePublicClient,
      wallet: oneWalletClient,
      config: CHAIN_CONFIG.arbitrumOne,
    },
    account,
  };
}

// Get client by chain ID
function getClientByChainId(clients, chainId) {
  const id = BigInt(chainId);
  if (id === 42170n) return clients.nova;
  if (id === 42161n) return clients.one;
  throw new Error(`Unknown chain ID: ${chainId}`);
}

// Calculate fees
function calculateFees(fulfillAmount, refundAmount) {
  const fulfillFee = (fulfillAmount * FEES.FULFILL_FEE_BPS) / FEES.BPS_DENOMINATOR;
  let refundFee = (refundAmount * FEES.REFUND_FEE_BPS) / FEES.BPS_DENOMINATOR;
  if (refundFee > FEES.MAX_REFUND_FEE) {
    refundFee = FEES.MAX_REFUND_FEE;
  }
  return { fulfillFee, refundFee };
}

// Check destination liquidity
async function getDestinationLiquidity(clients, destChainId) {
  const destClient = getClientByChainId(clients, destChainId);
  
  const liquidity = await destClient.public.readContract({
    address: destClient.config.bridgeAddress,
    abi: BRIDGE_ABI,
    functionName: 'getAvailableLiquidity',
  });

  return liquidity;
}

// Check if request is already processed on destination
async function isRequestProcessedOnDest(clients, destChainId, requestId) {
  const destClient = getClientByChainId(clients, destChainId);
  
  try {
    const status = await destClient.public.readContract({
      address: destClient.config.bridgeAddress,
      abi: BRIDGE_ABI,
      functionName: 'requestStatus',
      args: [requestId],
    });
    
    return status !== RequestStatus.None && status !== RequestStatus.PartialFilled;
  } catch {
    return false;
  }
}

// Check if request is already processed on source
async function isRequestProcessedOnSource(clients, sourceChainId, requestId) {
  const sourceClient = getClientByChainId(clients, sourceChainId);
  
  try {
    const [, status] = await sourceClient.public.readContract({
      address: sourceClient.config.bridgeAddress,
      abi: BRIDGE_ABI,
      functionName: 'getRequest',
      args: [requestId],
    });
    
    return (
      status === RequestStatus.Completed ||
      status === RequestStatus.Refunded ||
      status === RequestStatus.Cancelled
    );
  } catch {
    return false;
  }
}

// Execute fulfill on destination chain
async function executeFulfill(clients, request, fulfillAmount) {
  const destClient = getClientByChainId(clients, request.destChainId);
  
  console.log(`Executing fulfill on ${destClient.config.name}...`);
  console.log(`  Request ID: ${request.requestId}`);
  console.log(`  Fulfill Amount: ${formatEther(fulfillAmount)} MOON`);

  try {
    const { request: txRequest } = await destClient.public.simulateContract({
      address: destClient.config.bridgeAddress,
      abi: BRIDGE_ABI,
      functionName: 'fulfill',
      args: [
        request.requestId,
        request.sourceChainId,
        request.requester,
        request.recipient,
        request.amount,
        fulfillAmount,
        request.nonce,
      ],
      account: clients.account,
    });

    const hash = await destClient.wallet.writeContract(txRequest);
    console.log(`  Fulfill TX: ${hash}`);

    // Wait for confirmation
    const receipt = await destClient.public.waitForTransactionReceipt({
      hash,
      confirmations: destClient.config.confirmations,
    });

    console.log(`  Fulfill confirmed in block ${receipt.blockNumber}`);
    return { success: true, hash, receipt };
  } catch (error) {
    console.error(`  Fulfill failed: ${error.message}`);
    return { success: false, error };
  }
}

// Execute refund on source chain
async function executeRefund(clients, request, refundAmount) {
  const sourceClient = getClientByChainId(clients, request.sourceChainId);
  
  console.log(`Executing refund on ${sourceClient.config.name}...`);
  console.log(`  Request ID: ${request.requestId}`);
  console.log(`  Refund Amount: ${formatEther(refundAmount)} MOON`);

  try {
    const { request: txRequest } = await sourceClient.public.simulateContract({
      address: sourceClient.config.bridgeAddress,
      abi: BRIDGE_ABI,
      functionName: 'refund',
      args: [request.requestId, refundAmount],
      account: clients.account,
    });

    const hash = await sourceClient.wallet.writeContract(txRequest);
    console.log(`  Refund TX: ${hash}`);

    // Wait for confirmation
    const receipt = await sourceClient.public.waitForTransactionReceipt({
      hash,
      confirmations: sourceClient.config.confirmations,
    });

    console.log(`  Refund confirmed in block ${receipt.blockNumber}`);
    return { success: true, hash, receipt };
  } catch (error) {
    console.error(`  Refund failed: ${error.message}`);
    return { success: false, error };
  }
}

// Execute markCompleted on source chain (for full fulfills)
async function executeMarkCompleted(clients, request) {
  const sourceClient = getClientByChainId(clients, request.sourceChainId);
  
  console.log(`Marking request completed on ${sourceClient.config.name}...`);
  console.log(`  Request ID: ${request.requestId}`);

  try {
    const { request: txRequest } = await sourceClient.public.simulateContract({
      address: sourceClient.config.bridgeAddress,
      abi: BRIDGE_ABI,
      functionName: 'markCompleted',
      args: [request.requestId],
      account: clients.account,
    });

    const hash = await sourceClient.wallet.writeContract(txRequest);
    console.log(`  MarkCompleted TX: ${hash}`);

    const receipt = await sourceClient.public.waitForTransactionReceipt({
      hash,
      confirmations: sourceClient.config.confirmations,
    });

    console.log(`  MarkCompleted confirmed in block ${receipt.blockNumber}`);
    return { success: true, hash, receipt };
  } catch (error) {
    console.error(`  MarkCompleted failed: ${error.message}`);
    return { success: false, error };
  }
}

// Process a bridge request
async function processRequest(clients, request) {
  const requestKey = `${request.requestId}-${request.sourceChainId}`;
  
  // Skip if already processing
  if (processedRequests.has(requestKey)) {
    return;
  }
  processedRequests.set(requestKey, { status: 'processing', timestamp: Date.now() });

  console.log('\n========================================');
  console.log('Processing Bridge Request');
  console.log('========================================');
  console.log(`Request ID: ${request.requestId}`);
  console.log(`From: ${getChainConfig(request.sourceChainId).name}`);
  console.log(`To: ${getChainConfig(request.destChainId).name}`);
  console.log(`Requester: ${request.requester}`);
  console.log(`Recipient: ${request.recipient}`);
  console.log(`Amount: ${formatEther(request.amount)} MOON`);
  console.log(`ETH Fee: ${formatEther(request.ethFee)} ETH`);

  try {
    // Check if already processed on destination
    const destProcessed = await isRequestProcessedOnDest(clients, request.destChainId, request.requestId);
    if (destProcessed) {
      console.log('Request already processed on destination, checking source...');
      
      // Check source status
      const sourceProcessed = await isRequestProcessedOnSource(clients, request.sourceChainId, request.requestId);
      if (sourceProcessed) {
        console.log('Request fully processed, skipping.');
        processedRequests.set(requestKey, { status: 'completed', timestamp: Date.now() });
        return;
      }
    }

    // Get destination liquidity
    const liquidity = await getDestinationLiquidity(clients, request.destChainId);
    console.log(`Destination Liquidity: ${formatEther(liquidity)} MOON`);

    // Calculate how much we can fulfill
    const fulfillAmount = liquidity >= request.amount ? request.amount : liquidity;
    const refundAmount = request.amount - fulfillAmount;

    console.log(`Fulfill Amount: ${formatEther(fulfillAmount)} MOON`);
    console.log(`Refund Amount: ${formatEther(refundAmount)} MOON`);

    // Calculate fees
    const { fulfillFee, refundFee } = calculateFees(fulfillAmount, refundAmount);
    console.log(`Fulfill Fee: ${formatEther(fulfillFee)} MOON (1%)`);
    if (refundAmount > 0n) {
      console.log(`Refund Fee: ${formatEther(refundFee)} MOON (1%, max 100)`);
    }

    // Execute fulfill if there's liquidity
    if (fulfillAmount > 0n) {
      const fulfillResult = await executeFulfill(clients, request, fulfillAmount);
      if (!fulfillResult.success) {
        // Check if it's because someone else fulfilled
        const alreadyFulfilled = await isRequestProcessedOnDest(clients, request.destChainId, request.requestId);
        if (alreadyFulfilled) {
          console.log('Request was fulfilled by another relayer');
        } else {
          throw new Error(`Fulfill failed: ${fulfillResult.error.message}`);
        }
      }
    }

    // Execute refund if partial fill or zero liquidity
    if (refundAmount > 0n) {
      const refundResult = await executeRefund(clients, request, refundAmount);
      if (!refundResult.success) {
        // Check if it's because someone else refunded
        const sourceProcessed = await isRequestProcessedOnSource(clients, request.sourceChainId, request.requestId);
        if (sourceProcessed) {
          console.log('Request was refunded by another relayer');
        } else {
          throw new Error(`Refund failed: ${refundResult.error.message}`);
        }
      }
    } else if (fulfillAmount === request.amount) {
      // Full fulfill - mark completed on source to pay ETH fee
      const markResult = await executeMarkCompleted(clients, request);
      if (!markResult.success) {
        // Not critical, ETH fee just won't be paid
        console.log('Warning: Could not mark completed on source');
      }
    }

    processedRequests.set(requestKey, { status: 'completed', timestamp: Date.now() });
    console.log('Request processed successfully!');

  } catch (error) {
    console.error(`Error processing request: ${error.message}`);
    processedRequests.set(requestKey, { status: 'error', error: error.message, timestamp: Date.now() });
  }
}

// Watch for bridge requests on a chain
async function watchChain(clients, chain) {
  console.log(`Watching for requests on ${chain.config.name}...`);

  const unwatch = chain.public.watchContractEvent({
    address: chain.config.bridgeAddress,
    abi: BRIDGE_ABI,
    eventName: 'BridgeRequested',
    onLogs: async (logs) => {
      for (const log of logs) {
        const request = {
          requestId: log.args.requestId,
          sourceChainId: log.args.sourceChainId,
          destChainId: log.args.destChainId,
          requester: log.args.requester,
          recipient: log.args.recipient,
          amount: log.args.amount,
          ethFee: log.args.ethFeeWei,
          nonce: log.args.nonce,
          blockNumber: log.blockNumber,
          txHash: log.transactionHash,
        };

        // Wait for confirmations
        const currentBlock = await chain.public.getBlockNumber();
        const confirmations = currentBlock - log.blockNumber;
        
        if (confirmations >= chain.config.confirmations) {
          await processRequest(clients, request);
        } else {
          console.log(`Waiting for ${Number(chain.config.confirmations) - Number(confirmations)} more confirmations...`);
          // Schedule recheck
          setTimeout(async () => {
            await processRequest(clients, request);
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

// Process historical pending requests
async function processHistoricalRequests(clients, chain) {
  console.log(`Checking historical requests on ${chain.config.name}...`);

  try {
    // Get recent BridgeRequested events
    const currentBlock = await chain.public.getBlockNumber();
    const fromBlock = currentBlock - 10000n; // Last ~10000 blocks

    const logs = await chain.public.getLogs({
      address: chain.config.bridgeAddress,
      event: parseAbiItem('event BridgeRequested(bytes32 indexed requestId, uint256 indexed sourceChainId, uint256 indexed destChainId, address requester, address recipient, uint256 amount, uint256 ethFeeWei, uint256 nonce)'),
      fromBlock: fromBlock > 0n ? fromBlock : 0n,
      toBlock: currentBlock,
    });

    console.log(`Found ${logs.length} historical requests`);

    for (const log of logs) {
      const request = {
        requestId: log.args.requestId,
        sourceChainId: log.args.sourceChainId,
        destChainId: log.args.destChainId,
        requester: log.args.requester,
        recipient: log.args.recipient,
        amount: log.args.amount,
        ethFee: log.args.ethFeeWei,
        nonce: log.args.nonce,
        blockNumber: log.blockNumber,
        txHash: log.transactionHash,
      };

      // Check if pending
      const sourceProcessed = await isRequestProcessedOnSource(clients, request.sourceChainId, request.requestId);
      if (!sourceProcessed) {
        await processRequest(clients, request);
      }
    }
  } catch (error) {
    console.error(`Error processing historical requests: ${error.message}`);
  }
}

// Main function
async function main() {
  console.log('========================================');
  console.log('MoonBridge Relayer Starting...');
  console.log('========================================');

  // Validate environment
  const requiredEnvVars = [
    'RELAYER_PRIVATE_KEY',
    'ARBITRUM_NOVA_RPC_URL',
    'ARBITRUM_ONE_RPC_URL',
    'BRIDGE_NOVA_ADDRESS',
    'BRIDGE_ONE_ADDRESS',
    'MOON_TOKEN_NOVA',
    'MOON_TOKEN_ONE',
  ];

  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      throw new Error(`Missing required environment variable: ${envVar}`);
    }
  }

  // Initialize clients
  const clients = initializeClients();

  // Check relayer balances
  console.log('\nChecking relayer balances...');
  
  const novaBalance = await clients.nova.public.getBalance({
    address: clients.account.address,
  });
  console.log(`Nova ETH Balance: ${formatEther(novaBalance)} ETH`);

  const oneBalance = await clients.one.public.getBalance({
    address: clients.account.address,
  });
  console.log(`One ETH Balance: ${formatEther(oneBalance)} ETH`);

  // Check bridge liquidity
  console.log('\nChecking bridge liquidity...');
  
  const novaLiquidity = await getDestinationLiquidity(clients, 42170n);
  console.log(`Nova Bridge Liquidity: ${formatEther(novaLiquidity)} MOON`);

  const oneLiquidity = await getDestinationLiquidity(clients, 42161n);
  console.log(`One Bridge Liquidity: ${formatEther(oneLiquidity)} MOON`);

  // Process historical requests first
  await processHistoricalRequests(clients, clients.nova);
  await processHistoricalRequests(clients, clients.one);

  // Start watching both chains
  console.log('\nStarting event watchers...');
  
  const unwatchNova = await watchChain(clients, clients.nova);
  const unwatchOne = await watchChain(clients, clients.one);

  console.log('\nRelayer running. Press Ctrl+C to stop.');

  // Handle shutdown
  process.on('SIGINT', () => {
    console.log('\nShutting down...');
    unwatchNova();
    unwatchOne();
    process.exit(0);
  });

  // Keep process alive
  await new Promise(() => {});
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

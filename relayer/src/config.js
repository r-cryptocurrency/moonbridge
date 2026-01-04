// Chain configuration
export const CHAIN_CONFIG = {
  arbitrumNova: {
    chainId: 42170,
    name: 'Arbitrum Nova',
    rpcUrl: process.env.ARBITRUM_NOVA_RPC_URL,
    bridgeAddress: process.env.BRIDGE_NOVA_ADDRESS,
    moonTokenAddress: process.env.MOON_TOKEN_NOVA,
    confirmations: 2, // Wait for 2 block confirmations
  },
  arbitrumOne: {
    chainId: 42161,
    name: 'Arbitrum One',
    rpcUrl: process.env.ARBITRUM_ONE_RPC_URL,
    bridgeAddress: process.env.BRIDGE_ONE_ADDRESS,
    moonTokenAddress: process.env.MOON_TOKEN_ONE,
    confirmations: 2,
  },
};

// Get chain config by ID
export function getChainConfig(chainId) {
  if (chainId === 42170n || chainId === 42170) {
    return CHAIN_CONFIG.arbitrumNova;
  }
  if (chainId === 42161n || chainId === 42161) {
    return CHAIN_CONFIG.arbitrumOne;
  }
  throw new Error(`Unknown chain ID: ${chainId}`);
}

// Get destination chain config
export function getDestinationChain(sourceChainId) {
  const sourceId = BigInt(sourceChainId);
  if (sourceId === 42170n) {
    return CHAIN_CONFIG.arbitrumOne;
  }
  if (sourceId === 42161n) {
    return CHAIN_CONFIG.arbitrumNova;
  }
  throw new Error(`Unknown source chain ID: ${sourceChainId}`);
}

// Relayer configuration
export const RELAYER_CONFIG = {
  pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS || '5000'),
  maxRetries: parseInt(process.env.MAX_RETRIES || '3'),
  retryDelayMs: parseInt(process.env.RETRY_DELAY_MS || '10000'),
  gasMultiplier: parseFloat(process.env.GAS_MULTIPLIER || '1.2'),
};

// Bridge ABI (events and functions we need)
export const BRIDGE_ABI = [
  // Events
  {
    type: 'event',
    name: 'BridgeRequested',
    inputs: [
      { name: 'requestId', type: 'bytes32', indexed: true },
      { name: 'sourceChainId', type: 'uint256', indexed: true },
      { name: 'destChainId', type: 'uint256', indexed: true },
      { name: 'requester', type: 'address', indexed: false },
      { name: 'recipient', type: 'address', indexed: false },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'ethFeeWei', type: 'uint256', indexed: false },
      { name: 'nonce', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'BridgeFulfilled',
    inputs: [
      { name: 'requestId', type: 'bytes32', indexed: true },
      { name: 'relayer', type: 'address', indexed: true },
      { name: 'fulfilledAmount', type: 'uint256', indexed: false },
      { name: 'fulfilledFee', type: 'uint256', indexed: false },
      { name: 'recipientReceived', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'BridgeRefunded',
    inputs: [
      { name: 'requestId', type: 'bytes32', indexed: true },
      { name: 'relayer', type: 'address', indexed: true },
      { name: 'refundAmount', type: 'uint256', indexed: false },
      { name: 'refundFee', type: 'uint256', indexed: false },
      { name: 'requesterReceived', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'RequestCancelled',
    inputs: [
      { name: 'requestId', type: 'bytes32', indexed: true },
      { name: 'requester', type: 'address', indexed: true },
    ],
  },
  // View functions
  {
    type: 'function',
    name: 'getRequest',
    stateMutability: 'view',
    inputs: [{ name: 'requestId', type: 'bytes32' }],
    outputs: [
      {
        name: 'request',
        type: 'tuple',
        components: [
          { name: 'sourceChainId', type: 'uint256' },
          { name: 'destChainId', type: 'uint256' },
          { name: 'requester', type: 'address' },
          { name: 'recipient', type: 'address' },
          { name: 'amount', type: 'uint256' },
          { name: 'ethFee', type: 'uint256' },
          { name: 'nonce', type: 'uint256' },
          { name: 'fulfilledAmount', type: 'uint256' },
          { name: 'refundedAmount', type: 'uint256' },
          { name: 'ethFeePaid', type: 'bool' },
        ],
      },
      { name: 'status', type: 'uint8' },
    ],
  },
  {
    type: 'function',
    name: 'getAvailableLiquidity',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'requestStatus',
    stateMutability: 'view',
    inputs: [{ name: 'requestId', type: 'bytes32' }],
    outputs: [{ name: '', type: 'uint8' }],
  },
  // Write functions
  {
    type: 'function',
    name: 'fulfill',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'requestId', type: 'bytes32' },
      { name: 'sourceChainId', type: 'uint256' },
      { name: 'requester', type: 'address' },
      { name: 'recipient', type: 'address' },
      { name: 'totalAmount', type: 'uint256' },
      { name: 'fulfillAmount', type: 'uint256' },
      { name: 'nonce', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'refund',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'requestId', type: 'bytes32' },
      { name: 'refundAmount', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'markCompleted',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'requestId', type: 'bytes32' }],
    outputs: [],
  },
];

// ERC20 ABI for balance checks
export const ERC20_ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
];

// Request status enum matching contract
export const RequestStatus = {
  None: 0,
  Pending: 1,
  Fulfilled: 2,
  PartialFilled: 3,
  Refunded: 4,
  Completed: 5,
  Cancelled: 6,
};

// Fee constants
export const FEES = {
  FULFILL_FEE_BPS: 100n, // 1%
  REFUND_FEE_BPS: 100n, // 1%
  MAX_REFUND_FEE: BigInt(100) * BigInt(10 ** 18), // 100 MOON
  BPS_DENOMINATOR: 10000n,
};

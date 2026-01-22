// Chain configuration
export const CHAIN_CONFIG = {
  arbitrumNova: {
    chainId: 42170,
    name: 'Arbitrum Nova',
    rpcUrl: process.env.ARBITRUM_NOVA_RPC_URL,
    bridgeAddress: process.env.BRIDGE_NOVA_ADDRESS,
    confirmations: 2, // Wait for 2 block confirmations
  },
  arbitrumOne: {
    chainId: 42161,
    name: 'Arbitrum One',
    rpcUrl: process.env.ARBITRUM_ONE_RPC_URL,
    bridgeAddress: process.env.BRIDGE_ONE_ADDRESS,
    confirmations: 2,
  },
  ethereum: {
    chainId: 1,
    name: 'Ethereum',
    rpcUrl: process.env.ETHEREUM_RPC_URL,
    bridgeAddress: process.env.BRIDGE_ETHEREUM_ADDRESS,
    confirmations: 3, // More confirmations for mainnet
  },
  gnosis: {
    chainId: 100,
    name: 'Gnosis',
    rpcUrl: process.env.GNOSIS_RPC_URL,
    bridgeAddress: process.env.BRIDGE_GNOSIS_ADDRESS,
    confirmations: 2,
  },
};

// Asset configuration
export const ASSETS = {
  MOON: {
    id: 'MOON',
    name: 'Moon',
    addresses: {
      42170: '0x0057Ac2d777797d31CD3f8f13bF5e927571D6Ad0', // Nova
      42161: '0x24404DC041d74cd03cFE28855F555559390C931b', // Arbitrum One
      1: '0xb2490e357980cE57bF5745e181e537a64Eb367B1',     // Ethereum
      100: null, // Not available on Gnosis
    },
  },
  ETH: {
    id: 'ETH',
    name: 'Ethereum',
    addresses: {
      42170: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', // Native ETH sentinel
      42161: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', // Native ETH sentinel
      1: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',     // Native ETH sentinel
      100: '0x6A023CCd1ff6F2045C3309768eAD9E68F978f6e1',   // WETH on Gnosis
    },
  },
  USDC: {
    id: 'USDC',
    name: 'USD Coin',
    addresses: {
      42170: '0x750ba8b76187092b0d1e87e28daaf484d1b5273b', // Nova
      42161: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', // Arbitrum One
      1: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',     // Ethereum
      100: '0xDDAfbb505ad214D7b80b1f830fcCc89B60fb7A83',   // Gnosis
    },
  },
  DONUT: {
    id: 'DONUT',
    name: 'Donut',
    addresses: {
      42170: null, // Not available on Nova
      42161: '0xF42e2B8bc2aF8B110b65be98dB1321B1ab8D44f5', // Arbitrum One
      1: '0xC0F9bD5Fa5698B6505F643900FFA515Ea5dF54A9',     // Ethereum
      100: '0x524B969793a64a602342d89BC2789D43a016B13A',   // Gnosis
    },
  },
};

// Native ETH sentinel address
export const NATIVE_ETH_SENTINEL = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

// Get chain config by ID
export function getChainConfig(chainId) {
  const id = typeof chainId === 'bigint' ? Number(chainId) : chainId;

  switch (id) {
    case 42170:
      return CHAIN_CONFIG.arbitrumNova;
    case 42161:
      return CHAIN_CONFIG.arbitrumOne;
    case 1:
      return CHAIN_CONFIG.ethereum;
    case 100:
      return CHAIN_CONFIG.gnosis;
    default:
      throw new Error(`Unknown chain ID: ${chainId}`);
  }
}

// Get all chain configs
export function getAllChainConfigs() {
  return Object.values(CHAIN_CONFIG);
}

// Get asset address for a specific chain
export function getAssetAddress(assetId, chainId) {
  const id = typeof chainId === 'bigint' ? Number(chainId) : chainId;
  const asset = ASSETS[assetId];

  if (!asset) {
    throw new Error(`Unknown asset ID: ${assetId}`);
  }

  const address = asset.addresses[id];
  if (!address) {
    throw new Error(`Asset ${assetId} not available on chain ${chainId}`);
  }

  return address;
}

// Check if asset address is native ETH
export function isNativeETH(address) {
  return address.toLowerCase() === NATIVE_ETH_SENTINEL.toLowerCase();
}

// Relayer configuration
export const RELAYER_CONFIG = {
  pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS || '5000'),
  maxRetries: parseInt(process.env.MAX_RETRIES || '3'),
  retryDelayMs: parseInt(process.env.RETRY_DELAY_MS || '10000'),
  gasMultiplier: parseFloat(process.env.GAS_MULTIPLIER || '1.2'),
};

// Bridge V2 ABI (events and functions we need)
export const BRIDGE_ABI = [
  // Events
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
  {
    type: 'event',
    name: 'PartialFillRefunded',
    inputs: [
      { name: 'bridgeId', type: 'bytes32', indexed: true },
      { name: 'assetId', type: 'bytes32', indexed: true },
      { name: 'sender', type: 'address', indexed: true },
      { name: 'fulfilledAmount', type: 'uint256', indexed: false },
      { name: 'refundAmount', type: 'uint256', indexed: false },
      { name: 'refundFee', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'LiquidityDeposited',
    inputs: [
      { name: 'assetId', type: 'bytes32', indexed: true },
      { name: 'depositor', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'lpTokensMinted', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'LiquidityWithdrawn',
    inputs: [
      { name: 'assetId', type: 'bytes32', indexed: true },
      { name: 'withdrawer', type: 'address', indexed: true },
      { name: 'lpTokensBurned', type: 'uint256', indexed: false },
      { name: 'amountReceived', type: 'uint256', indexed: false },
      { name: 'amountQueued', type: 'uint256', indexed: false },
    ],
  },
  // View functions
  {
    type: 'function',
    name: 'getAvailableLiquidity',
    stateMutability: 'view',
    inputs: [{ name: 'assetId', type: 'bytes32' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'processedBridges',
    stateMutability: 'view',
    inputs: [{ name: 'bridgeId', type: 'bytes32' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  // Write functions
  {
    type: 'function',
    name: 'fulfillBridge',
    stateMutability: 'payable',
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
    name: 'deposit',
    stateMutability: 'payable',
    inputs: [
      { name: 'assetId', type: 'bytes32' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'withdraw',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'assetId', type: 'bytes32' },
      { name: 'lpTokenAmount', type: 'uint256' },
    ],
    outputs: [],
  },
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

// Fee constants for V2
export const FEES = {
  TOTAL_FEE_BPS: 100n, // 1% total fee
  LP_FEE_BPS: 80n, // 0.8% to LPs
  DAO_FEE_BPS: 20n, // 0.2% to DAO
  BPS_DENOMINATOR: 10000n,
};

// Asset ID helper - converts string to bytes32
export function assetIdToBytes32(assetId) {
  // Convert "MOON", "ETH", etc. to bytes32
  const bytes = new TextEncoder().encode(assetId);
  const hex = '0x' + Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .padEnd(64, '0');
  return hex;
}

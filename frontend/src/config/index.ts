import { arbitrum, arbitrumNova, mainnet, gnosis } from 'viem/chains';
import type { Address } from 'viem';
import { parseEther } from 'viem';

// Chain IDs
export const CHAIN_IDS = {
  ARBITRUM_NOVA: 42170,
  ARBITRUM_ONE: 42161,
  ETHEREUM: 1,
  GNOSIS: 100,
} as const;

// Asset IDs
export const ASSET_IDS = {
  MOON: 'MOON',
  ETH: 'ETH',
  USDC: 'USDC',
  DONUT: 'DONUT',
} as const;

// Native ETH sentinel address
export const NATIVE_ETH_SENTINEL = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE' as Address;

// Asset configuration
export const ASSETS = {
  [ASSET_IDS.MOON]: {
    id: ASSET_IDS.MOON,
    name: 'Moon',
    symbol: 'MOON',
    decimals: 18,
    addresses: {
      [CHAIN_IDS.ARBITRUM_NOVA]: '0x0057Ac2d777797d31CD3f8f13bF5e927571D6Ad0' as Address,
      [CHAIN_IDS.ARBITRUM_ONE]: '0x24404DC041d74cd03cFE28855F555559390C931b' as Address,
      [CHAIN_IDS.ETHEREUM]: '0xb2490e357980cE57bF5745e181e537a64Eb367B1' as Address,
      [CHAIN_IDS.GNOSIS]: null,
    },
  },
  [ASSET_IDS.ETH]: {
    id: ASSET_IDS.ETH,
    name: 'Ethereum',
    symbol: 'ETH',
    decimals: 18,
    addresses: {
      [CHAIN_IDS.ARBITRUM_NOVA]: NATIVE_ETH_SENTINEL,
      [CHAIN_IDS.ARBITRUM_ONE]: NATIVE_ETH_SENTINEL,
      [CHAIN_IDS.ETHEREUM]: NATIVE_ETH_SENTINEL,
      [CHAIN_IDS.GNOSIS]: '0x6A023CCd1ff6F2045C3309768eAd9E68F978f6e1' as Address, // WETH
    },
  },
  [ASSET_IDS.USDC]: {
    id: ASSET_IDS.USDC,
    name: 'USD Coin',
    symbol: 'USDC',
    decimals: 6,
    addresses: {
      [CHAIN_IDS.ARBITRUM_NOVA]: '0x750ba8b76187092b0d1e87e28daaf484d1b5273b' as Address,
      [CHAIN_IDS.ARBITRUM_ONE]: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as Address,
      [CHAIN_IDS.ETHEREUM]: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Address,
      [CHAIN_IDS.GNOSIS]: '0xDDAfbb505ad214D7b80b1f830fcCc89B60fb7A83' as Address,
    },
  },
  [ASSET_IDS.DONUT]: {
    id: ASSET_IDS.DONUT,
    name: 'Donut',
    symbol: 'DONUT',
    decimals: 18,
    addresses: {
      [CHAIN_IDS.ARBITRUM_NOVA]: null,
      [CHAIN_IDS.ARBITRUM_ONE]: '0xF42e2B8bc2aF8B110b65be98dB1321B1ab8D44f5' as Address,
      [CHAIN_IDS.ETHEREUM]: '0xC0F9bD5Fa5698B6505F643900FFA515Ea5dF54A9' as Address,
      [CHAIN_IDS.GNOSIS]: '0x524B969793a64a602342d89BC2789D43a016B13A' as Address,
    },
  },
} as const;

// BridgeV2 contract addresses
export const BRIDGE_ADDRESSES = {
  [CHAIN_IDS.ARBITRUM_NOVA]: '0xd7454c00e705d724140b31DDc9A63E45cC0e1b9c' as Address,
  [CHAIN_IDS.ARBITRUM_ONE]: '0x609B1430b6575590F5C75bcb7db261007d5FED41' as Address,
  [CHAIN_IDS.ETHEREUM]: '0x609B1430b6575590F5C75bcb7db261007d5FED41' as Address,
  [CHAIN_IDS.GNOSIS]: '0x7bFF7F20Dd583e0665A5C62A06d2E78ee6f23a01' as Address,
} as const;

// Chain metadata
export const CHAIN_META = {
  [CHAIN_IDS.ARBITRUM_NOVA]: {
    id: CHAIN_IDS.ARBITRUM_NOVA,
    name: 'Arbitrum Nova',
    shortName: 'Nova',
    chain: arbitrumNova,
    explorer: 'https://nova.arbiscan.io',
  },
  [CHAIN_IDS.ARBITRUM_ONE]: {
    id: CHAIN_IDS.ARBITRUM_ONE,
    name: 'Arbitrum One',
    shortName: 'One',
    chain: arbitrum,
    explorer: 'https://arbiscan.io',
  },
  [CHAIN_IDS.ETHEREUM]: {
    id: CHAIN_IDS.ETHEREUM,
    name: 'Ethereum',
    shortName: 'Ethereum',
    chain: mainnet,
    explorer: 'https://etherscan.io',
  },
  [CHAIN_IDS.GNOSIS]: {
    id: CHAIN_IDS.GNOSIS,
    name: 'Gnosis',
    shortName: 'Gnosis',
    chain: gnosis,
    explorer: 'https://gnosisscan.io',
  },
} as const;

// Helper functions
export function getAssetAddress(assetId: string, chainId: number): Address | null {
  const asset = ASSETS[assetId as keyof typeof ASSETS];
  if (!asset) return null;
  return asset.addresses[chainId as keyof typeof asset.addresses] || null;
}

export function isNativeETH(address: Address | null): boolean {
  return address?.toLowerCase() === NATIVE_ETH_SENTINEL.toLowerCase();
}

export function assetIdToBytes32(assetId: string): `0x${string}` {
  const bytes = new TextEncoder().encode(assetId);
  const hex = '0x' + Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .padEnd(64, '0');
  return hex as `0x${string}`;
}

export function getAvailableAssets(chainId: number): string[] {
  return Object.keys(ASSETS).filter(assetId => {
    const address = getAssetAddress(assetId, chainId);
    return address !== null;
  });
}

export function getAvailableDestinations(sourceChainId: number, assetId: string): number[] {
  const asset = ASSETS[assetId as keyof typeof ASSETS];
  if (!asset) return [];

  return Object.entries(asset.addresses)
    .filter(([chainId, address]) => {
      const id = Number(chainId);
      return id !== sourceChainId && address !== null;
    })
    .map(([chainId]) => Number(chainId));
}

export function getDestinationChainId(sourceChainId: number): number {
  // Return a default destination chain based on source
  // Priority: Nova <-> One, Ethereum <-> One, Gnosis <-> One
  switch (sourceChainId) {
    case CHAIN_IDS.ARBITRUM_NOVA:
      return CHAIN_IDS.ARBITRUM_ONE;
    case CHAIN_IDS.ARBITRUM_ONE:
      return CHAIN_IDS.ARBITRUM_NOVA;
    case CHAIN_IDS.ETHEREUM:
      return CHAIN_IDS.ARBITRUM_ONE;
    case CHAIN_IDS.GNOSIS:
      return CHAIN_IDS.ARBITRUM_ONE;
    default:
      return CHAIN_IDS.ARBITRUM_ONE;
  }
}

// Fee constants for V2
export const FEES = {
  TOTAL_FEE_BPS: 100n, // 1% total fee
  LP_FEE_BPS: 80n, // 0.8% to LPs
  DAO_FEE_BPS: 20n, // 0.2% to DAO
  BPS_DENOMINATOR: 10000n,
} as const;

// Relayer fees per chain (in wei/native token)
export const RELAYER_FEES = {
  [CHAIN_IDS.ARBITRUM_NOVA]: BigInt('100000000000000'), // 0.0001 ETH
  [CHAIN_IDS.ARBITRUM_ONE]: BigInt('100000000000000'), // 0.0001 ETH
  [CHAIN_IDS.ETHEREUM]: BigInt('1000000000000000'), // 0.001 ETH
  [CHAIN_IDS.GNOSIS]: BigInt('300000000000000000'), // 0.3 xDAI
} as const;

// Get relayer fee for a chain
export function getRelayerFee(chainId: number): bigint {
  return RELAYER_FEES[chainId as keyof typeof RELAYER_FEES] || 0n;
}

// Calculate fees for V2 with partial fill support
export function calculateFees(amount: bigint, availableLiquidity?: bigint) {
  // User sends 'amount'. Contract takes 1% fee from it.
  const totalFee = (amount * FEES.TOTAL_FEE_BPS) / FEES.BPS_DENOMINATOR;
  const lpFee = (amount * FEES.LP_FEE_BPS) / FEES.BPS_DENOMINATOR;
  const daoFee = (amount * FEES.DAO_FEE_BPS) / FEES.BPS_DENOMINATOR;
  const bridgeAmount = amount - totalFee; // Amount that crosses chains

  // Check for partial fill scenario
  if (availableLiquidity !== undefined && availableLiquidity < bridgeAmount) {
    // Partial fill: only availableLiquidity can be fulfilled
    const fulfillAmount = availableLiquidity;
    const refundAmount = bridgeAmount - fulfillAmount;

    // Refund fee: 1% capped at 100 tokens
    const MAX_REFUND_FEE_CAP = BigInt('100000000000000000000'); // 100 tokens (18 decimals)
    const calculatedRefundFee = (refundAmount * FEES.TOTAL_FEE_BPS) / FEES.BPS_DENOMINATOR;
    const refundFee = calculatedRefundFee > MAX_REFUND_FEE_CAP ? MAX_REFUND_FEE_CAP : calculatedRefundFee;
    const requesterRefund = refundAmount - refundFee;

    return {
      totalFee,
      lpFee,
      daoFee,
      recipientReceives: fulfillAmount, // Only what's available
      fulfillAmount,
      fulfillFee: totalFee,
      refundAmount,
      refundFee,
      requesterRefund,
      hasInsufficientLiquidity: true,
    };
  }

  // Full fill: enough liquidity available
  return {
    totalFee,
    lpFee,
    daoFee,
    recipientReceives: bridgeAmount,
    fulfillAmount: bridgeAmount,
    fulfillFee: totalFee,
    refundAmount: 0n,
    refundFee: 0n,
    requesterRefund: 0n,
    hasInsufficientLiquidity: false,
  };
}

// BridgeV2 ABI
export const BRIDGE_ABI = [
  // User functions
  {
    type: 'function',
    name: 'requestBridge',
    stateMutability: 'payable',
    inputs: [
      { name: 'assetId', type: 'bytes32' },
      { name: 'amount', type: 'uint256' },
      { name: 'toChainId', type: 'uint256' },
      { name: 'recipient', type: 'address' },
    ],
    outputs: [{ name: 'bridgeId', type: 'bytes32' }],
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
  {
    type: 'function',
    name: 'getAssetConfig',
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
  // Events
  {
    type: 'event',
    name: 'BridgeRequested',
    inputs: [
      { name: 'bridgeId', type: 'bytes32', indexed: true },
      { name: 'assetId', type: 'bytes32', indexed: true },
      { name: 'fromChainId', type: 'uint256', indexed: true },
      { name: 'toChainId', type: 'uint256', indexed: false },
      { name: 'requester', type: 'address', indexed: false },
      { name: 'recipient', type: 'address', indexed: false },
      { name: 'amount', type: 'uint256', indexed: false },
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
] as const;

// ERC20 ABI
export const ERC20_ABI = [
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
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'decimals',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
  {
    type: 'function',
    name: 'symbol',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
] as const;

// LP Token ABI (for reading LP balances and allowances)
export const LP_TOKEN_ABI = [
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
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'totalSupply',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

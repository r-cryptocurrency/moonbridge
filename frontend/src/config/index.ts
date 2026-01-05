import { arbitrum, arbitrumNova } from 'viem/chains';
import type { Address } from 'viem';

// Chain IDs
export const CHAIN_IDS = {
  ARBITRUM_NOVA: 42170,
  ARBITRUM_ONE: 42161,
} as const;

// Contract addresses - UPDATE AFTER DEPLOYMENT
export const CONTRACTS = {
  [CHAIN_IDS.ARBITRUM_NOVA]: {
    bridge: '0x2a0a8e541623411Fc16233B35BDC539f51939716f' as Address,
    moonToken: '0x0057Ac2d777797d31CD3f8f13bF5e927571D6Ad0' as Address,
  },
  [CHAIN_IDS.ARBITRUM_ONE]: {
    bridge: '0x2a0a8e541623411Fc16233B35BDC539f51939716f' as Address,
    moonToken: '0x24404DC041d74cd03cFE28855F555559390C931b' as Address,
  },
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
} as const;

// Get destination chain ID
export function getDestinationChainId(sourceChainId: number): number {
  return sourceChainId === CHAIN_IDS.ARBITRUM_NOVA
    ? CHAIN_IDS.ARBITRUM_ONE
    : CHAIN_IDS.ARBITRUM_NOVA;
}

// Fee constants
export const FEES = {
  FULFILL_FEE_BPS: 100n,
  REFUND_FEE_BPS: 100n,
  MAX_REFUND_FEE: BigInt(100) * BigInt(10 ** 18),
  BPS_DENOMINATOR: 10000n,
} as const;

// Calculate fees
export function calculateFees(amount: bigint, destinationLiquidity: bigint) {
  const fulfillAmount = amount <= destinationLiquidity ? amount : destinationLiquidity;
  const refundAmount = amount - fulfillAmount;
  const fulfillFee = (fulfillAmount * FEES.FULFILL_FEE_BPS) / FEES.BPS_DENOMINATOR;
  let refundFee = (refundAmount * FEES.REFUND_FEE_BPS) / FEES.BPS_DENOMINATOR;
  if (refundFee > FEES.MAX_REFUND_FEE) refundFee = FEES.MAX_REFUND_FEE;
  return {
    fulfillAmount,
    refundAmount,
    fulfillFee,
    refundFee,
    recipientReceives: fulfillAmount - fulfillFee,
    requesterRefund: refundAmount - refundFee,
  };
}

// Bridge ABI
export const BRIDGE_ABI = [
  {
    type: 'function',
    name: 'requestBridge',
    stateMutability: 'payable',
    inputs: [
      { name: 'amount', type: 'uint256' },
      { name: 'destChainId', type: 'uint256' },
      { name: 'recipient', type: 'address' },
    ],
    outputs: [{ name: 'requestId', type: 'bytes32' }],
  },
  {
    type: 'function',
    name: 'cancelRequest',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'requestId', type: 'bytes32' }],
    outputs: [],
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
    name: 'relayerFeeWei',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'paused',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'bool' }],
  },
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
    name: 'requestStatus',
    stateMutability: 'view',
    inputs: [{ name: 'requestId', type: 'bytes32' }],
    outputs: [{ name: '', type: 'uint8' }],
  },
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

// Request status enum
export enum RequestStatus {
  None = 0,
  Pending = 1,
  Fulfilled = 2,
  PartialFilled = 3,
  Refunded = 4,
  Completed = 5,
  Cancelled = 6,
}

export function getStatusLabel(status: RequestStatus): string {
  const labels: Record<RequestStatus, string> = {
    [RequestStatus.None]: 'Unknown',
    [RequestStatus.Pending]: 'Pending',
    [RequestStatus.Fulfilled]: 'Fulfilled',
    [RequestStatus.PartialFilled]: 'Partial Fill',
    [RequestStatus.Refunded]: 'Refunded',
    [RequestStatus.Completed]: 'Completed',
    [RequestStatus.Cancelled]: 'Cancelled',
  };
  return labels[status] || 'Unknown';
}

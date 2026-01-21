import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, useBalance } from 'wagmi';
import { type Address } from 'viem';
import {
  BRIDGE_ABI,
  ERC20_ABI,
  LP_TOKEN_ABI,
  BRIDGE_ADDRESSES,
  ASSETS,
  getAssetAddress,
  isNativeETH,
  assetIdToBytes32,
  getRelayerFee,
} from '@/config';

// Hook for bridging assets
export function useBridge(chainId: number, assetId: string) {
  const { address } = useAccount();
  const bridgeAddress = BRIDGE_ADDRESSES[chainId as keyof typeof BRIDGE_ADDRESSES];
  const assetAddress = getAssetAddress(assetId, chainId);
  const assetBytes32 = assetIdToBytes32(assetId);
  const isNative = isNativeETH(assetAddress);

  // Asset balance (ERC20 or native ETH)
  const { data: erc20Balance, refetch: refetchERC20Balance } = useReadContract({
    address: assetAddress || undefined,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: chainId,
    query: { enabled: !!address && !!assetAddress && !isNative },
  });

  const { data: nativeBalance, refetch: refetchNativeBalance } = useBalance({
    address: address,
    chainId: chainId,
    query: { enabled: !!address && isNative },
  });

  // Asset allowance (for ERC20 tokens only)
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: assetAddress || undefined,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address && bridgeAddress ? [address, bridgeAddress] : undefined,
    chainId: chainId,
    query: { enabled: !!address && !!assetAddress && !!bridgeAddress && !isNative },
  });

  // Available liquidity on this chain
  const { data: liquidity, refetch: refetchLiquidity } = useReadContract({
    address: bridgeAddress,
    abi: BRIDGE_ABI,
    functionName: 'getAvailableLiquidity',
    args: [assetBytes32],
    chainId: chainId,
    query: { enabled: !!bridgeAddress },
  });

  // Write contracts
  const { writeContract: writeApprove, data: approveHash, isPending: isApproving } = useWriteContract();
  const { writeContract: writeBridge, data: bridgeHash, isPending: isBridging } = useWriteContract();

  // Transaction confirmations
  const { isLoading: isApproveConfirming, isSuccess: isApproveSuccess } = useWaitForTransactionReceipt({
    hash: approveHash,
  });

  const { isLoading: isBridgeConfirming, isSuccess: isBridgeSuccess } = useWaitForTransactionReceipt({
    hash: bridgeHash,
  });

  // Approve token spending
  const approve = async (amount?: bigint) => {
    if (!assetAddress || !bridgeAddress || isNative) return;
    const approveAmount = amount || BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
    writeApprove({
      address: assetAddress,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [bridgeAddress, approveAmount],
    });
  };

  // Request bridge transfer
  const requestBridge = async (amount: bigint, toChainId: number, recipient: Address) => {
    if (!bridgeAddress) return;

    // Get relayer fee for current chain
    const relayerFee = getRelayerFee(chainId);

    // Calculate msg.value
    // For native ETH: amount + relayerFee
    // For ERC20: relayerFee only
    const msgValue = isNative ? amount + relayerFee : relayerFee;

    writeBridge({
      address: bridgeAddress,
      abi: BRIDGE_ABI,
      functionName: 'requestBridge',
      args: [assetBytes32, amount, BigInt(toChainId), recipient],
      value: msgValue,
    });
  };

  const assetBalance = isNative ? nativeBalance?.value : erc20Balance;
  const refetchBalance = isNative ? refetchNativeBalance : refetchERC20Balance;

  return {
    assetBalance: assetBalance as bigint | undefined,
    allowance: allowance as bigint | undefined,
    liquidity: liquidity as bigint | undefined,
    approve,
    requestBridge,
    refetchBalance,
    refetchAllowance,
    refetchLiquidity,
    isApproving: isApproving || isApproveConfirming,
    isBridging: isBridging || isBridgeConfirming,
    isApproveSuccess,
    isBridgeSuccess,
    approveHash,
    bridgeHash,
    isNativeAsset: isNative,
  };
}

// Hook for LP operations
export function useLiquidity(chainId: number, assetId: string) {
  const { address } = useAccount();
  const bridgeAddress = BRIDGE_ADDRESSES[chainId as keyof typeof BRIDGE_ADDRESSES];
  const assetAddress = getAssetAddress(assetId, chainId);
  const assetBytes32 = assetIdToBytes32(assetId);
  const isNative = isNativeETH(assetAddress);

  // Get LP token address from asset config
  const { data: assetConfig } = useReadContract({
    address: bridgeAddress,
    abi: BRIDGE_ABI,
    functionName: 'assetConfigs',
    args: [assetBytes32],
    chainId: chainId,
    query: { enabled: !!bridgeAddress },
  });

  // AssetConfig struct: [enabled, tokenAddress, lpTokenAddress, lpFeeBps, daoFeeBps, minBridgeAmount, maxBridgeAmount]
  const lpTokenAddress = assetConfig ? (assetConfig as any)[2] : undefined;

  // LP token balance
  const { data: lpBalance, refetch: refetchLPBalance } = useReadContract({
    address: lpTokenAddress,
    abi: LP_TOKEN_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: chainId,
    query: { enabled: !!address && !!lpTokenAddress },
  });

  // LP token total supply
  const { data: lpTotalSupply } = useReadContract({
    address: lpTokenAddress,
    abi: LP_TOKEN_ABI,
    functionName: 'totalSupply',
    chainId: chainId,
    query: { enabled: !!lpTokenAddress },
  });

  // Asset balance (for deposits)
  const { data: erc20Balance, refetch: refetchERC20Balance } = useReadContract({
    address: assetAddress || undefined,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: chainId,
    query: { enabled: !!address && !!assetAddress && !isNative },
  });

  const { data: nativeBalance, refetch: refetchNativeBalance } = useBalance({
    address: address,
    chainId: chainId,
    query: { enabled: !!address && isNative },
  });

  // Asset allowance (for ERC20 deposits)
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: assetAddress || undefined,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address && bridgeAddress ? [address, bridgeAddress] : undefined,
    chainId: chainId,
    query: { enabled: !!address && !!assetAddress && !!bridgeAddress && !isNative },
  });

  // LP token allowance (for withdrawals)
  const { data: lpAllowance, refetch: refetchLPAllowance } = useReadContract({
    address: lpTokenAddress,
    abi: LP_TOKEN_ABI,
    functionName: 'allowance',
    args: address && bridgeAddress ? [address, bridgeAddress] : undefined,
    chainId: chainId,
    query: { enabled: !!address && !!lpTokenAddress && !!bridgeAddress },
  });

  // Available liquidity in pool
  const { data: poolLiquidity, refetch: refetchPoolLiquidity } = useReadContract({
    address: bridgeAddress,
    abi: BRIDGE_ABI,
    functionName: 'getAvailableLiquidity',
    args: [assetBytes32],
    chainId: chainId,
    query: { enabled: !!bridgeAddress },
  });

  // Write contracts
  const { writeContract: writeApprove, data: approveHash, isPending: isApproving } = useWriteContract();
  const { writeContract: writeApproveLPToken, data: approveLPHash, isPending: isApprovingLP } = useWriteContract();
  const { writeContract: writeDeposit, data: depositHash, isPending: isDepositing } = useWriteContract();
  const { writeContract: writeWithdraw, data: withdrawHash, isPending: isWithdrawing } = useWriteContract();

  // Transaction confirmations
  const { isLoading: isApproveConfirming, isSuccess: isApproveSuccess } = useWaitForTransactionReceipt({
    hash: approveHash,
  });

  const { isLoading: isApproveLPConfirming, isSuccess: isApproveLPSuccess } = useWaitForTransactionReceipt({
    hash: approveLPHash,
  });

  const { isLoading: isDepositConfirming, isSuccess: isDepositSuccess } = useWaitForTransactionReceipt({
    hash: depositHash,
  });

  const { isLoading: isWithdrawConfirming, isSuccess: isWithdrawSuccess } = useWaitForTransactionReceipt({
    hash: withdrawHash,
  });

  // Approve asset for deposit
  const approveAsset = async (amount?: bigint) => {
    if (!assetAddress || !bridgeAddress || isNative) return;
    const approveAmount = amount || BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
    writeApprove({
      address: assetAddress,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [bridgeAddress, approveAmount],
    });
  };

  // Approve LP tokens for withdrawal
  const approveLPToken = async (amount?: bigint) => {
    if (!lpTokenAddress || !bridgeAddress) return;
    const approveAmount = amount || BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
    writeApproveLPToken({
      address: lpTokenAddress,
      abi: LP_TOKEN_ABI,
      functionName: 'approve',
      args: [bridgeAddress, approveAmount],
    });
  };

  // Deposit liquidity
  const deposit = async (amount: bigint) => {
    if (!bridgeAddress) return;
    writeDeposit({
      address: bridgeAddress,
      abi: BRIDGE_ABI,
      functionName: 'deposit',
      args: [assetBytes32, amount],
      value: isNative ? amount : undefined,
    });
  };

  // Withdraw liquidity
  const withdraw = async (lpTokenAmount: bigint) => {
    if (!bridgeAddress) return;
    writeWithdraw({
      address: bridgeAddress,
      abi: BRIDGE_ABI,
      functionName: 'withdraw',
      args: [assetBytes32, lpTokenAmount],
    });
  };

  const assetBalance = isNative ? nativeBalance?.value : erc20Balance;
  const refetchAssetBalance = isNative ? refetchNativeBalance : refetchERC20Balance;

  return {
    // Balances
    assetBalance: assetBalance as bigint | undefined,
    lpBalance: lpBalance as bigint | undefined,
    lpTotalSupply: lpTotalSupply as bigint | undefined,
    poolLiquidity: poolLiquidity as bigint | undefined,

    // Allowances
    allowance: allowance as bigint | undefined,
    lpAllowance: lpAllowance as bigint | undefined,

    // Actions
    approveAsset,
    approveLPToken,
    deposit,
    withdraw,

    // Refetch functions
    refetchAssetBalance,
    refetchLPBalance,
    refetchAllowance,
    refetchLPAllowance,
    refetchPoolLiquidity,

    // Loading states
    isApproving: isApproving || isApproveConfirming,
    isApprovingLP: isApprovingLP || isApproveLPConfirming,
    isDepositing: isDepositing || isDepositConfirming,
    isWithdrawing: isWithdrawing || isWithdrawConfirming,

    // Success states
    isApproveSuccess,
    isApproveLPSuccess,
    isDepositSuccess,
    isWithdrawSuccess,

    // Transaction hashes
    approveHash,
    approveLPHash,
    depositHash,
    withdrawHash,

    // Other
    lpTokenAddress,
    isNativeAsset: isNative,
  };
}
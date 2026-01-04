import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { type Address } from 'viem';
import { BRIDGE_ABI, ERC20_ABI, CONTRACTS, getDestinationChainId } from '@/config';

export function useBridge(sourceChainId: number) {
  const { address } = useAccount();
  const destChainId = getDestinationChainId(sourceChainId);
  
  const sourceContracts = CONTRACTS[sourceChainId as keyof typeof CONTRACTS];
  const destContracts = CONTRACTS[destChainId as keyof typeof CONTRACTS];

  const { data: moonBalance, refetch: refetchBalance } = useReadContract({
    address: sourceContracts?.moonToken,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!sourceContracts?.moonToken },
  });

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: sourceContracts?.moonToken,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address && sourceContracts?.bridge ? [address, sourceContracts.bridge] : undefined,
    query: { enabled: !!address && !!sourceContracts?.moonToken && !!sourceContracts?.bridge },
  });

  const { data: relayerFee } = useReadContract({
    address: sourceContracts?.bridge,
    abi: BRIDGE_ABI,
    functionName: 'relayerFeeWei',
    query: { enabled: !!sourceContracts?.bridge },
  });

  const { data: isPaused } = useReadContract({
    address: sourceContracts?.bridge,
    abi: BRIDGE_ABI,
    functionName: 'paused',
    query: { enabled: !!sourceContracts?.bridge },
  });

  const { data: destLiquidity, refetch: refetchLiquidity } = useReadContract({
    address: destContracts?.moonToken,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: destContracts?.bridge ? [destContracts.bridge] : undefined,
    chainId: destChainId,
    query: { enabled: !!destContracts?.bridge && !!destContracts?.moonToken },
  });

  const { writeContract: writeApprove, data: approveHash, isPending: isApproving } = useWriteContract();
  const { writeContract: writeBridge, data: bridgeHash, isPending: isBridging } = useWriteContract();
  const { writeContract: writeCancel, data: cancelHash, isPending: isCancelling } = useWriteContract();

  const { isLoading: isApproveConfirming, isSuccess: isApproveSuccess } = useWaitForTransactionReceipt({
    hash: approveHash,
  });

  const { isLoading: isBridgeConfirming, isSuccess: isBridgeSuccess } = useWaitForTransactionReceipt({
    hash: bridgeHash,
  });

  const { isLoading: isCancelConfirming, isSuccess: isCancelSuccess } = useWaitForTransactionReceipt({
    hash: cancelHash,
  });

  const approve = async () => {
    if (!sourceContracts?.moonToken || !sourceContracts?.bridge) return;
    const maxUint256 = BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
    writeApprove({
      address: sourceContracts.moonToken,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [sourceContracts.bridge, maxUint256],
    });
  };

  const requestBridge = async (amount: bigint, recipient: Address) => {
    if (!sourceContracts?.bridge || !relayerFee) return;
    writeBridge({
      address: sourceContracts.bridge,
      abi: BRIDGE_ABI,
      functionName: 'requestBridge',
      args: [amount, BigInt(destChainId), recipient],
      value: relayerFee as bigint,
    });
  };

  const cancelRequest = async (requestId: `0x${string}`) => {
    if (!sourceContracts?.bridge) return;
    writeCancel({
      address: sourceContracts.bridge,
      abi: BRIDGE_ABI,
      functionName: 'cancelRequest',
      args: [requestId],
    });
  };

  return {
    moonBalance: moonBalance as bigint | undefined,
    allowance: allowance as bigint | undefined,
    relayerFee: relayerFee as bigint | undefined,
    destLiquidity: destLiquidity as bigint | undefined,
    isPaused: isPaused as boolean | undefined,
    approve,
    requestBridge,
    cancelRequest,
    refetchBalance,
    refetchAllowance,
    refetchLiquidity,
    isApproving: isApproving || isApproveConfirming,
    isBridging: isBridging || isBridgeConfirming,
    isCancelling: isCancelling || isCancelConfirming,
    isApproveSuccess,
    isBridgeSuccess,
    isCancelSuccess,
    approveHash,
    bridgeHash,
    cancelHash,
  };
}
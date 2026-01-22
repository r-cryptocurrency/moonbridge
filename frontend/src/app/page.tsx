'use client';

import { useState, useEffect, useMemo } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useChainId, useSwitchChain } from 'wagmi';
import { formatEther, parseEther, formatUnits, parseUnits, type Address } from 'viem';
import { useBridge, useLiquidity } from '@/hooks/useBridge';
import {
  CHAIN_IDS,
  CHAIN_META,
  ASSETS,
  ASSET_IDS,
  calculateFees,
  getRelayerFee,
  getAvailableAssets,
  getAvailableDestinations,
} from '@/config';
import Image from 'next/image';

type Tab = 'bridge' | 'liquidity';

// Fee breakdown component
function FeeBreakdown({
  amount,
  effectiveDestLiquidity,
  relayerFee,
  assetSymbol,
  decimals,
  chainId,
}: {
  amount: bigint;
  effectiveDestLiquidity: bigint;
  relayerFee: bigint;
  assetSymbol: string;
  decimals: number;
  chainId: number;
}) {
  // Get native currency symbol for the chain
  const nativeCurrency = chainId === 100 ? 'xDAI' : 'ETH';
  const fees = useMemo(() => {
    if (amount <= BigInt(0)) return null;
    return calculateFees(amount, effectiveDestLiquidity);
  }, [amount, effectiveDestLiquidity]);

  if (!fees || amount <= BigInt(0)) return null;

  const isPartialFill = fees.refundAmount > BigInt(0);
  const formatAmount = (val: bigint) => parseFloat(formatUnits(val, decimals)).toFixed(decimals === 6 ? 2 : 4);

  return (
    <div className="mt-4 p-4 bg-space-900/50 rounded-xl border border-space-600">
      <div className="text-sm font-medium text-gray-400 mb-3">Fee Breakdown</div>

      <div className="space-y-2 text-sm">
        {fees.fulfillAmount > BigInt(0) && (
          <>
            <div className="flex justify-between">
              <span className="text-gray-500">Fulfill Amount:</span>
              <span className="text-white font-mono">
                {formatAmount(fees.fulfillAmount)} {assetSymbol}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Fulfill Fee (1%):</span>
              <span className="text-moon-400 font-mono">
                -{formatAmount(fees.fulfillFee)} {assetSymbol}
              </span>
            </div>
            <div className="flex justify-between font-medium">
              <span className="text-gray-400">You Receive:</span>
              <span className="text-green-400 font-mono">
                {formatAmount(fees.recipientReceives)} {assetSymbol}
              </span>
            </div>
          </>
        )}

        {isPartialFill && (
          <>
            <div className="border-t border-space-600 my-2" />
            <div className="flex justify-between">
              <span className="text-gray-500">Refund Amount:</span>
              <span className="text-white font-mono">
                {formatAmount(fees.refundAmount)} {assetSymbol}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Refund Fee (1%, max 100):</span>
              <span className="text-moon-400 font-mono">
                -{formatAmount(fees.refundFee)} {assetSymbol}
              </span>
            </div>
            <div className="flex justify-between font-medium">
              <span className="text-gray-400">Refund Received:</span>
              <span className="text-blue-400 font-mono">
                {formatAmount(fees.requesterRefund)} {assetSymbol}
              </span>
            </div>
          </>
        )}

        <div className="border-t border-space-600 my-2" />
        <div className="flex justify-between">
          <span className="text-gray-500">{nativeCurrency} Relayer Fee:</span>
          <span className="text-white font-mono">
            {parseFloat(formatEther(relayerFee)).toFixed(6)} {nativeCurrency}
          </span>
        </div>
      </div>
    </div>
  );
}

// Bridge tab component
function BridgeTab({
  sourceChain,
  destChain,
  selectedAsset,
  onSourceChainChange,
  onDestChainChange,
}: {
  sourceChain: number;
  destChain: number;
  selectedAsset: string;
  onSourceChainChange: (chainId: number) => void;
  onDestChainChange: (chainId: number) => void;
}) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();

  const [amount, setAmount] = useState('');
  const [recipient, setRecipient] = useState('');
  const [useOwnAddress, setUseOwnAddress] = useState(true);

  const sourceMeta = CHAIN_META[sourceChain as keyof typeof CHAIN_META];
  const destMeta = CHAIN_META[destChain as keyof typeof CHAIN_META];
  const asset = ASSETS[selectedAsset as keyof typeof ASSETS];

  const {
    assetBalance,
    allowance,
    approve,
    requestBridge,
    isApproving,
    isBridging,
    isApproveSuccess,
    isBridgeSuccess,
    refetchBalance,
    refetchAllowance,
    refetchLiquidity: refetchSourceLiquidity,
    isNativeAsset,
  } = useBridge(sourceChain, selectedAsset);

  // Fetch destination liquidity separately
  const {
    liquidity: destLiquidity,
    refetchLiquidity: refetchDestLiquidity,
    isLiquidityError: isDestLiquidityError,
  } = useBridge(destChain, selectedAsset);

  // If there's an error fetching dest liquidity, treat it as 0
  const effectiveDestLiquidity = isDestLiquidityError ? BigInt(0) : destLiquidity;

  const refetchLiquidity = () => {
    refetchSourceLiquidity();
    refetchDestLiquidity();
  };

  const relayerFee = getRelayerFee(sourceChain);
  const isPaused = false;

  // Parse amount to bigint
  const amountBigInt = useMemo(() => {
    try {
      return amount ? parseUnits(amount, asset.decimals) : BigInt(0);
    } catch {
      return BigInt(0);
    }
  }, [amount, asset.decimals]);

  // Determine recipient address
  const recipientAddress = useMemo(() => {
    if (useOwnAddress && address) return address;
    try {
      return recipient as Address;
    } catch {
      return undefined;
    }
  }, [useOwnAddress, address, recipient]);

  // Check if approval needed
  const needsApproval = useMemo(() => {
    if (isNativeAsset) return false;
    if (amountBigInt <= BigInt(0)) return false;
    if (allowance === undefined) return true;
    return allowance < amountBigInt;
  }, [allowance, amountBigInt, isNativeAsset]);

  // Check if can bridge
  const canBridge = useMemo(() => {
    if (!isConnected) return false;
    if (isPaused) return false;
    if (amountBigInt <= BigInt(0)) return false;
    if (!recipientAddress) return false;
    if (needsApproval) return false;
    if (assetBalance && amountBigInt > assetBalance) return false;
    return true;
  }, [isConnected, isPaused, amountBigInt, recipientAddress, needsApproval, assetBalance]);

  // Check liquidity warning
  const liquidityWarning = useMemo(() => {
    // Debug logging
    console.log('[Liquidity Warning Debug]', {
      sourceChain,
      destChain,
      amountBigInt: amountBigInt.toString(),
      effectiveDestLiquidity: effectiveDestLiquidity?.toString() ?? 'undefined',
      assetSymbol: asset.symbol,
    });

    // Don't show warning if user hasn't entered an amount yet
    if (amountBigInt <= BigInt(0)) {
      console.log('[Liquidity Warning] No amount entered');
      return null;
    }

    // If effectiveDestLiquidity is undefined, we're still loading - don't show warning yet
    if (effectiveDestLiquidity === undefined) {
      console.log('[Liquidity Warning] Dest liquidity still loading for chain', destChain);
      return null;
    }

    // Calculate the amount that will cross to destination (after source chain fee)
    const fees = calculateFees(amountBigInt);
    const bridgeAmount = fees.recipientReceives; // Amount after 1% fee on source

    console.log('[Liquidity Warning] Comparison:', {
      bridgeAmount: bridgeAmount.toString(),
      effectiveDestLiquidity: effectiveDestLiquidity.toString(),
      willWarn: bridgeAmount > effectiveDestLiquidity,
    });

    // Compare what crosses to what's available on destination
    if (bridgeAmount > effectiveDestLiquidity) {
      if (effectiveDestLiquidity === BigInt(0)) {
        return `No liquidity available on destination chain. Transaction will be refunded (minus fees).`;
      }
      return `Only ${parseFloat(formatUnits(effectiveDestLiquidity, asset.decimals)).toFixed(2)} ${asset.symbol} available on destination. You will receive a partial fill with refund.`;
    }
    return null;
  }, [effectiveDestLiquidity, amountBigInt, asset, destChain, sourceChain]);

  // Refetch data on success
  useEffect(() => {
    if (isApproveSuccess) {
      refetchAllowance();
    }
  }, [isApproveSuccess, refetchAllowance]);

  useEffect(() => {
    if (isBridgeSuccess) {
      refetchBalance();
      refetchLiquidity();
      setAmount('');
    }
  }, [isBridgeSuccess, refetchBalance, refetchLiquidity]);

  // Handle bridge action
  const handleBridge = async () => {
    if (!canBridge || !recipientAddress) return;
    await requestBridge(amountBigInt, destChain, recipientAddress);
  };

  // Handle approve action
  const handleApprove = async () => {
    await approve();
  };

  // Set max amount
  const handleSetMax = () => {
    if (assetBalance) {
      setAmount(formatUnits(assetBalance, asset.decimals));
    }
  };

  return (
    <>
      {/* Paused warning */}
      {isPaused && (
        <div className="mb-4 p-3 bg-red-500/20 border border-red-500/50 rounded-xl text-red-400 text-sm">
          ⚠️ Bridge is currently paused
        </div>
      )}

      {/* Amount input */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm text-gray-400">Amount</label>
          {assetBalance !== undefined && (
            <button
              onClick={handleSetMax}
              className="text-xs text-moon-400 hover:text-moon-300"
            >
              Balance: {parseFloat(formatUnits(assetBalance, asset.decimals)).toFixed(4)} {asset.symbol}
            </button>
          )}
        </div>
        <div className="relative">
          <input
            type="text"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="input-field pr-24"
          />
          <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
            <span className="text-gray-400 font-medium">{asset.symbol}</span>
          </div>
        </div>
      </div>

      {/* Destination liquidity */}
      <div className="mb-4 p-3 bg-space-900/50 rounded-xl border border-space-600">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">Destination Liquidity:</span>
          <span className="text-white font-mono">
            {effectiveDestLiquidity !== undefined
              ? `${parseFloat(formatUnits(effectiveDestLiquidity, asset.decimals)).toFixed(2)} ${asset.symbol}`
              : '...'}
          </span>
        </div>
      </div>

      {/* Liquidity warning */}
      {liquidityWarning && (
        <div className="mb-4 p-3 bg-yellow-500/20 border border-yellow-500/50 rounded-xl text-yellow-400 text-sm">
          ⚠️ {liquidityWarning}
        </div>
      )}

      {/* Recipient */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm text-gray-400">Recipient</label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={useOwnAddress}
              onChange={(e) => setUseOwnAddress(e.target.checked)}
              className="rounded"
            />
            <span className="text-gray-400">Use my address</span>
          </label>
        </div>
        {!useOwnAddress && (
          <input
            type="text"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            placeholder="0x..."
            className="input-field font-mono text-sm"
          />
        )}
        {useOwnAddress && address && (
          <div className="p-3 bg-space-900/50 rounded-xl border border-space-600 font-mono text-sm text-gray-400 truncate">
            {address}
          </div>
        )}
      </div>

      {/* Fee breakdown */}
      {amountBigInt > BigInt(0) && effectiveDestLiquidity !== undefined && (
        <FeeBreakdown
          amount={amountBigInt}
          effectiveDestLiquidity={effectiveDestLiquidity}
          relayerFee={relayerFee}
          assetSymbol={asset.symbol}
          decimals={asset.decimals}
          chainId={sourceChain}
        />
      )}

      {/* Action buttons */}
      <div className="mt-6">
        {!isConnected ? (
          <ConnectButton.Custom>
            {({ openConnectModal }) => (
              <button onClick={openConnectModal} className="btn-primary w-full">
                Connect Wallet
              </button>
            )}
          </ConnectButton.Custom>
        ) : chainId !== sourceChain ? (
          <button
            onClick={() => switchChain({ chainId: sourceChain })}
            className="btn-primary w-full"
          >
            Switch to {sourceMeta.shortName}
          </button>
        ) : needsApproval ? (
          <button
            onClick={handleApprove}
            disabled={isApproving || amountBigInt <= BigInt(0)}
            className="btn-primary w-full"
          >
            {isApproving ? 'Approving...' : `Approve ${asset.symbol}`}
          </button>
        ) : (
          <button
            onClick={handleBridge}
            disabled={!canBridge || isBridging}
            className="btn-primary w-full"
          >
            {isBridging ? 'Bridging...' : `Bridge ${asset.symbol}`}
          </button>
        )}
      </div>

      {/* Relayer fee note */}
      <p className="mt-3 text-xs text-center text-gray-500">
        Relayer fee: {parseFloat(formatEther(relayerFee)).toFixed(6)} {sourceChain === 100 ? 'xDAI' : 'ETH'}
      </p>
    </>
  );
}

// Liquidity tab component
function LiquidityTab({
  sourceChain,
  selectedAsset,
}: {
  sourceChain: number;
  selectedAsset: string;
}) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();

  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');

  const sourceMeta = CHAIN_META[sourceChain as keyof typeof CHAIN_META];
  const asset = ASSETS[selectedAsset as keyof typeof ASSETS];

  const {
    assetBalance,
    lpBalance,
    lpTotalSupply,
    poolLiquidity,
    allowance,
    lpAllowance,
    approveAsset,
    approveLPToken,
    deposit,
    withdraw,
    refetchAssetBalance,
    refetchLPBalance,
    refetchAllowance,
    refetchLPAllowance,
    refetchPoolLiquidity,
    isApproving,
    isApprovingLP,
    isDepositing,
    isWithdrawing,
    isApproveSuccess,
    isApproveLPSuccess,
    isDepositSuccess,
    isWithdrawSuccess,
    isNativeAsset,
  } = useLiquidity(sourceChain, selectedAsset);

  // Parse amounts
  const depositBigInt = useMemo(() => {
    try {
      return depositAmount ? parseUnits(depositAmount, asset.decimals) : BigInt(0);
    } catch {
      return BigInt(0);
    }
  }, [depositAmount, asset.decimals]);

  const withdrawBigInt = useMemo(() => {
    try {
      return withdrawAmount ? parseUnits(withdrawAmount, asset.decimals) : BigInt(0);
    } catch {
      return BigInt(0);
    }
  }, [withdrawAmount, asset.decimals]);

  // Check if approvals needed
  const needsDepositApproval = useMemo(() => {
    if (isNativeAsset) return false;
    if (depositBigInt <= BigInt(0)) return false;
    if (allowance === undefined) return true;
    return allowance < depositBigInt;
  }, [allowance, depositBigInt, isNativeAsset]);

  const needsWithdrawApproval = useMemo(() => {
    if (withdrawBigInt <= BigInt(0)) return false;
    if (lpAllowance === undefined) return true;
    return lpAllowance < withdrawBigInt;
  }, [lpAllowance, withdrawBigInt]);

  // Refetch on success
  useEffect(() => {
    if (isApproveSuccess) refetchAllowance();
  }, [isApproveSuccess, refetchAllowance]);

  useEffect(() => {
    if (isApproveLPSuccess) refetchLPAllowance();
  }, [isApproveLPSuccess, refetchLPAllowance]);

  useEffect(() => {
    if (isDepositSuccess) {
      refetchAssetBalance();
      refetchLPBalance();
      refetchPoolLiquidity();
      setDepositAmount('');
    }
  }, [isDepositSuccess, refetchAssetBalance, refetchLPBalance, refetchPoolLiquidity]);

  useEffect(() => {
    if (isWithdrawSuccess) {
      refetchAssetBalance();
      refetchLPBalance();
      refetchPoolLiquidity();
      setWithdrawAmount('');
    }
  }, [isWithdrawSuccess, refetchAssetBalance, refetchLPBalance, refetchPoolLiquidity]);

  return (
    <>
      {/* Pool stats */}
      <div className="mb-6 p-4 bg-space-900/50 rounded-xl border border-space-600">
        <div className="text-sm font-medium text-gray-400 mb-3">Pool Stats</div>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">Total Liquidity:</span>
            <span className="text-white font-mono">
              {poolLiquidity !== undefined
                ? `${parseFloat(formatUnits(poolLiquidity, asset.decimals)).toFixed(2)} ${asset.symbol}`
                : '...'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Your LP Balance:</span>
            <span className="text-moon-400 font-mono">
              {lpBalance !== undefined
                ? parseFloat(formatUnits(lpBalance, asset.decimals)).toFixed(4)
                : '...'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Your Asset Balance:</span>
            <span className="text-white font-mono">
              {assetBalance !== undefined
                ? `${parseFloat(formatUnits(assetBalance, asset.decimals)).toFixed(4)} ${asset.symbol}`
                : '...'}
            </span>
          </div>
        </div>
      </div>

      {/* Deposit section */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-white mb-3">Deposit Liquidity</h3>
        <div className="mb-3">
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm text-gray-400">Amount to Deposit</label>
            {assetBalance !== undefined && (
              <button
                onClick={() => setDepositAmount(formatUnits(assetBalance, asset.decimals))}
                className="text-xs text-moon-400 hover:text-moon-300"
              >
                Max: {parseFloat(formatUnits(assetBalance, asset.decimals)).toFixed(4)} {asset.symbol}
              </button>
            )}
          </div>
          <input
            type="text"
            value={depositAmount}
            onChange={(e) => setDepositAmount(e.target.value)}
            placeholder="0.00"
            className="input-field"
          />
        </div>

        {!isConnected ? (
          <ConnectButton.Custom>
            {({ openConnectModal }) => (
              <button onClick={openConnectModal} className="btn-primary w-full">
                Connect Wallet
              </button>
            )}
          </ConnectButton.Custom>
        ) : chainId !== sourceChain ? (
          <button
            onClick={() => switchChain({ chainId: sourceChain })}
            className="btn-primary w-full"
          >
            Switch to {sourceMeta.shortName}
          </button>
        ) : needsDepositApproval ? (
          <button
            onClick={() => approveAsset()}
            disabled={isApproving || depositBigInt <= BigInt(0)}
            className="btn-primary w-full"
          >
            {isApproving ? 'Approving...' : `Approve ${asset.symbol}`}
          </button>
        ) : (
          <button
            onClick={() => deposit(depositBigInt)}
            disabled={isDepositing || depositBigInt <= BigInt(0) || !assetBalance || depositBigInt > assetBalance}
            className="btn-primary w-full"
          >
            {isDepositing ? 'Depositing...' : 'Deposit Liquidity'}
          </button>
        )}
      </div>

      {/* Withdraw section */}
      <div>
        <h3 className="text-lg font-semibold text-white mb-3">Withdraw Liquidity</h3>
        <div className="mb-3">
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm text-gray-400">LP Tokens to Burn</label>
            {lpBalance !== undefined && (
              <button
                onClick={() => setWithdrawAmount(formatUnits(lpBalance, asset.decimals))}
                className="text-xs text-moon-400 hover:text-moon-300"
              >
                Max: {parseFloat(formatUnits(lpBalance, asset.decimals)).toFixed(4)}
              </button>
            )}
          </div>
          <input
            type="text"
            value={withdrawAmount}
            onChange={(e) => setWithdrawAmount(e.target.value)}
            placeholder="0.00"
            className="input-field"
          />
        </div>

        {!isConnected ? (
          <ConnectButton.Custom>
            {({ openConnectModal }) => (
              <button onClick={openConnectModal} className="btn-primary w-full">
                Connect Wallet
              </button>
            )}
          </ConnectButton.Custom>
        ) : chainId !== sourceChain ? (
          <button
            onClick={() => switchChain({ chainId: sourceChain })}
            className="btn-primary w-full"
          >
            Switch to {sourceMeta.shortName}
          </button>
        ) : needsWithdrawApproval ? (
          <button
            onClick={() => approveLPToken()}
            disabled={isApprovingLP || withdrawBigInt <= BigInt(0)}
            className="btn-primary w-full"
          >
            {isApprovingLP ? 'Approving...' : 'Approve LP Tokens'}
          </button>
        ) : (
          <button
            onClick={() => withdraw(withdrawBigInt)}
            disabled={isWithdrawing || withdrawBigInt <= BigInt(0) || !lpBalance || withdrawBigInt > lpBalance}
            className="btn-primary w-full"
          >
            {isWithdrawing ? 'Withdrawing...' : 'Withdraw Liquidity'}
          </button>
        )}
      </div>
    </>
  );
}

// Main page component
export default function HomePage() {
  const [activeTab, setActiveTab] = useState<Tab>('bridge');
  const [sourceChain, setSourceChain] = useState<number>(CHAIN_IDS.ARBITRUM_NOVA);
  const [destChain, setDestChain] = useState<number>(CHAIN_IDS.ARBITRUM_ONE);
  const [selectedAsset, setSelectedAsset] = useState<string>(ASSET_IDS.MOON);

  // Get available assets and destinations
  const availableAssets = useMemo(() => getAvailableAssets(sourceChain), [sourceChain]);
  const availableDestinations = useMemo(() =>
    getAvailableDestinations(sourceChain, selectedAsset),
    [sourceChain, selectedAsset]
  );

  // Update selected asset if it's not available on the new chain
  useEffect(() => {
    if (!availableAssets.includes(selectedAsset)) {
      setSelectedAsset(availableAssets[0] || ASSET_IDS.MOON);
    }
  }, [availableAssets, selectedAsset]);

  // Update dest chain if current selection is invalid
  useEffect(() => {
    if (!availableDestinations.includes(destChain)) {
      setDestChain(availableDestinations[0] || CHAIN_IDS.ARBITRUM_ONE);
    }
  }, [availableDestinations, destChain]);

  const handleSourceChainChange = (newChain: number) => {
    setSourceChain(newChain);
  };

  const handleSwapChains = () => {
    const temp = sourceChain;
    setSourceChain(destChain);
    setDestChain(temp);
  };

  return (
    <div className="min-h-screen">
      {/* Background effects */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-moon-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-moon-600/10 rounded-full blur-3xl" />
      </div>

      {/* Header */}
      <header className="relative z-10 border-b border-space-700">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Image
              src="/moon-logo.png"
              alt="MOON"
              width={40}
              height={40}
              className="moon-float"
            />
            <div>
              <h1 className="text-2xl font-bold text-white">MoonBridge</h1>
              <p className="text-xs text-gray-500">Cross-chain bridge for community tokens</p>
            </div>
          </div>
          <ConnectButton />
        </div>
      </header>

      {/* Main content */}
      <main className="relative z-10 max-w-xl mx-auto px-4 py-12">
        <div className="card glow-orange">
          {/* Tabs */}
          <div className="flex gap-2 mb-6 p-1 bg-space-900/50 rounded-xl">
            <button
              onClick={() => setActiveTab('bridge')}
              className={`flex-1 py-2 px-4 rounded-lg font-medium transition-all ${
                activeTab === 'bridge'
                  ? 'bg-moon-500/20 text-moon-400 border border-moon-500'
                  : 'text-gray-500 hover:text-gray-400'
              }`}
            >
              Bridge
            </button>
            <button
              onClick={() => setActiveTab('liquidity')}
              className={`flex-1 py-2 px-4 rounded-lg font-medium transition-all ${
                activeTab === 'liquidity'
                  ? 'bg-moon-500/20 text-moon-400 border border-moon-500'
                  : 'text-gray-500 hover:text-gray-400'
              }`}
            >
              Provide Liquidity
            </button>
          </div>

          {/* Chain selector (only for bridge tab) */}
          {activeTab === 'bridge' && (
            <div className="mb-6">
              <label className="text-sm text-gray-400 mb-2 block">Select Chains</label>
              <div className="flex items-center gap-3">
                <select
                  value={sourceChain}
                  onChange={(e) => handleSourceChainChange(Number(e.target.value))}
                  className="flex-1 input-field"
                >
                  {Object.values(CHAIN_IDS).map((chainId) => (
                    <option key={chainId} value={chainId}>
                      {CHAIN_META[chainId as keyof typeof CHAIN_META].name}
                    </option>
                  ))}
                </select>

                <button
                  onClick={handleSwapChains}
                  className="p-2 bg-space-700 rounded-xl border border-space-600 hover:border-moon-500/50 transition-all hover:scale-105"
                  title="Swap chains"
                >
                  <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                  </svg>
                </button>

                <select
                  value={destChain}
                  onChange={(e) => setDestChain(Number(e.target.value))}
                  className="flex-1 input-field"
                >
                  {availableDestinations.map((chainId) => (
                    <option key={chainId} value={chainId}>
                      {CHAIN_META[chainId as keyof typeof CHAIN_META].name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Chain selector (liquidity tab - source only) */}
          {activeTab === 'liquidity' && (
            <div className="mb-6">
              <label className="text-sm text-gray-400 mb-2 block">Select Chain</label>
              <select
                value={sourceChain}
                onChange={(e) => handleSourceChainChange(Number(e.target.value))}
                className="input-field w-full"
              >
                {Object.values(CHAIN_IDS).map((chainId) => (
                  <option key={chainId} value={chainId}>
                    {CHAIN_META[chainId as keyof typeof CHAIN_META].name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Asset selector */}
          <div className="mb-6">
            <label className="text-sm text-gray-400 mb-2 block">Select Asset</label>
            <select
              value={selectedAsset}
              onChange={(e) => setSelectedAsset(e.target.value)}
              className="input-field w-full"
            >
              {availableAssets.map((assetId) => {
                const asset = ASSETS[assetId as keyof typeof ASSETS];
                return (
                  <option key={assetId} value={assetId}>
                    {asset.name} ({asset.symbol})
                  </option>
                );
              })}
            </select>
          </div>

          {/* Tab content */}
          {activeTab === 'bridge' ? (
            <BridgeTab
              sourceChain={sourceChain}
              destChain={destChain}
              selectedAsset={selectedAsset}
              onSourceChainChange={handleSourceChainChange}
              onDestChainChange={setDestChain}
            />
          ) : (
            <LiquidityTab
              sourceChain={sourceChain}
              selectedAsset={selectedAsset}
            />
          )}
        </div>

        {/* Info section */}
        <div className="mt-8 text-center text-sm text-gray-500">
          <p>DAO-owned bridge • No per-transaction limits</p>
          <p className="mt-1">1% fee on fulfilled amount • 1% fee on refunds (max 100 tokens)</p>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-space-700 py-6">
        <div className="max-w-6xl mx-auto px-4 text-center text-sm text-gray-500">
          <p>MoonBridge by CCMOON DAO</p>
          {/* Future navigation can be added here */}
        </div>
      </footer>
    </div>
  );
}

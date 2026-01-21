'use client';

import { useState, useEffect, useMemo } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useChainId, useSwitchChain } from 'wagmi';
import { formatEther, parseEther, type Address } from 'viem';
import { useBridge } from '@/hooks/useBridge';
import {
  CHAIN_IDS,
  CHAIN_META,
  ASSET_IDS,
  calculateFees,
  getDestinationChainId,
  getRelayerFee,
} from '@/config';
import Image from 'next/image';

// Chain selector button
function ChainButton({
  chainId,
  isSource,
  isActive,
  onClick,
}: {
  chainId: number;
  isSource: boolean;
  isActive: boolean;
  onClick: () => void;
}) {
  const meta = CHAIN_META[chainId as keyof typeof CHAIN_META];
  
  return (
    <button
      onClick={onClick}
      className={`
        flex-1 py-4 px-6 rounded-xl font-semibold transition-all duration-200
        ${isActive
          ? 'bg-moon-500/20 border-2 border-moon-500 text-moon-400'
          : 'bg-space-700 border-2 border-space-600 text-gray-400 hover:border-space-500'
        }
      `}
    >
      <div className="text-xs uppercase tracking-wider mb-1 opacity-70">
        {isSource ? 'From' : 'To'}
      </div>
      <div className="text-lg">{meta.shortName}</div>
    </button>
  );
}

// Fee breakdown component
function FeeBreakdown({
  amount,
  destLiquidity,
  relayerFee,
}: {
  amount: bigint;
  destLiquidity: bigint;
  relayerFee: bigint;
}) {
  const fees = useMemo(() => {
    if (amount <= BigInt(0)) return null;
    return calculateFees(amount, destLiquidity);
  }, [amount, destLiquidity]);

  if (!fees || amount <= BigInt(0)) return null;

  const isPartialFill = fees.refundAmount > BigInt(0);

  return (
    <div className="mt-4 p-4 bg-space-900/50 rounded-xl border border-space-600">
      <div className="text-sm font-medium text-gray-400 mb-3">Fee Breakdown</div>
      
      <div className="space-y-2 text-sm">
        {fees.fulfillAmount > BigInt(0) && (
          <>
            <div className="flex justify-between">
              <span className="text-gray-500">Fulfill Amount:</span>
              <span className="text-white font-mono">
                {parseFloat(formatEther(fees.fulfillAmount)).toFixed(2)} MOON
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Fulfill Fee (1%):</span>
              <span className="text-moon-400 font-mono">
                -{parseFloat(formatEther(fees.fulfillFee)).toFixed(2)} MOON
              </span>
            </div>
            <div className="flex justify-between font-medium">
              <span className="text-gray-400">You Receive:</span>
              <span className="text-green-400 font-mono">
                {parseFloat(formatEther(fees.recipientReceives)).toFixed(2)} MOON
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
                {parseFloat(formatEther(fees.refundAmount)).toFixed(2)} MOON
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Refund Fee (1%, max 100):</span>
              <span className="text-moon-400 font-mono">
                -{parseFloat(formatEther(fees.refundFee)).toFixed(2)} MOON
              </span>
            </div>
            <div className="flex justify-between font-medium">
              <span className="text-gray-400">Refund Received:</span>
              <span className="text-blue-400 font-mono">
                {parseFloat(formatEther(fees.requesterRefund)).toFixed(2)} MOON
              </span>
            </div>
          </>
        )}

        <div className="border-t border-space-600 my-2" />
        <div className="flex justify-between">
          <span className="text-gray-500">ETH Relayer Fee:</span>
          <span className="text-white font-mono">
            {parseFloat(formatEther(relayerFee)).toFixed(6)} ETH
          </span>
        </div>
      </div>
    </div>
  );
}

// Main bridge component
export default function BridgePage() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  
  const [sourceChain, setSourceChain] = useState<number>(CHAIN_IDS.ARBITRUM_NOVA);
  const [amount, setAmount] = useState('');
  const [recipient, setRecipient] = useState('');
  const [useOwnAddress, setUseOwnAddress] = useState(true);

  const destChain = getDestinationChainId(sourceChain);
  const sourceMeta = CHAIN_META[sourceChain as keyof typeof CHAIN_META];
  const destMeta = CHAIN_META[destChain as keyof typeof CHAIN_META];

  const {
    assetBalance: moonBalance,
    allowance,
    liquidity: destLiquidity,
    approve,
    requestBridge,
    isApproving,
    isBridging,
    isApproveSuccess,
    isBridgeSuccess,
    refetchBalance,
    refetchAllowance,
    refetchLiquidity,
  } = useBridge(sourceChain, ASSET_IDS.MOON);

  // Get relayer fee for source chain
  const relayerFee = getRelayerFee(sourceChain);

  // For now, assume bridge is not paused (you can add isPaused to the hook later if needed)
  const isPaused = false;

  // Parse amount to bigint
  const amountBigInt = useMemo(() => {
    try {
      return amount ? parseEther(amount) : BigInt(0);
    } catch {
      return BigInt(0);
    }
  }, [amount]);

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
    if (amountBigInt <= BigInt(0)) return false;
    if (allowance === undefined) return true;
    return allowance < amountBigInt;
  }, [allowance, amountBigInt]);

  // Check if can bridge
  const canBridge = useMemo(() => {
    if (!isConnected) return false;
    if (isPaused) return false;
    if (amountBigInt <= BigInt(0)) return false;
    if (!recipientAddress) return false;
    if (needsApproval) return false;
    if (moonBalance && amountBigInt > moonBalance) return false;
    return true;
  }, [isConnected, isPaused, amountBigInt, recipientAddress, needsApproval, moonBalance]);

  // Check liquidity warning
  const liquidityWarning = useMemo(() => {
    if (!destLiquidity || amountBigInt <= BigInt(0)) return null;
    if (amountBigInt > destLiquidity) {
      return `Only ${parseFloat(formatEther(destLiquidity)).toFixed(2)} MOON available. You will receive a partial fill with refund.`;
    }
    return null;
  }, [destLiquidity, amountBigInt]);

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

  // Switch chains
  const handleSourceChainChange = (newSourceChain: number) => {
    setSourceChain(newSourceChain);
    if (chainId !== newSourceChain) {
      switchChain({ chainId: newSourceChain as 42170 | 42161 });
    }
  };

  // Swap chains
  const handleSwapChains = () => {
    setAmount(''); // Clear amount to reset button state
    handleSourceChainChange(destChain);
    // Refetch data after chain swap
    setTimeout(() => {
      refetchBalance();
      refetchAllowance();
      refetchLiquidity();
    }, 1000);
  };

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
    if (moonBalance) {
      setAmount(formatEther(moonBalance));
    }
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
              <p className="text-xs text-gray-500">Arbitrum Nova ↔ One</p>
            </div>
          </div>
          <ConnectButton />
        </div>
      </header>

      {/* Main content */}
      <main className="relative z-10 max-w-xl mx-auto px-4 py-12">
        <div className="card glow-orange">
          {/* Chain selector */}
          <div className="flex items-center gap-4 mb-6">
            <ChainButton
              chainId={sourceChain}
              isSource={true}
              isActive={true}
              onClick={() => {}}
            />
            
            <button
              onClick={handleSwapChains}
              className="p-2 bg-space-700 rounded-xl border border-space-600 hover:border-moon-500/50 transition-all hover:scale-105"
            >
              <Image 
                src="/swap-arrow.png" 
                alt="Swap" 
                width={32} 
                height={32}
              />
            </button>

            <ChainButton
              chainId={destChain}
              isSource={false}
              isActive={false}
              onClick={handleSwapChains}
            />
          </div>

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
              {moonBalance !== undefined && (
                <button
                  onClick={handleSetMax}
                  className="text-xs text-moon-400 hover:text-moon-300"
                >
                  Balance: {parseFloat(formatEther(moonBalance)).toFixed(2)} MOON
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
                <Image 
                  src="/moon-logo.png" 
                  alt="MOON" 
                  width={20} 
                  height={20}
                />
                <span className="text-gray-400 font-medium">MOON</span>
              </div>
            </div>
          </div>

          {/* Destination liquidity */}
          <div className="mb-4 p-3 bg-space-900/50 rounded-xl border border-space-600">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Destination Liquidity:</span>
              <span className="text-white font-mono">
                {destLiquidity !== undefined
                  ? `${parseFloat(formatEther(destLiquidity)).toFixed(2)} MOON`
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
          {amountBigInt > BigInt(0) && destLiquidity !== undefined && (
            <FeeBreakdown
              amount={amountBigInt}
              destLiquidity={destLiquidity}
              relayerFee={relayerFee}
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
                {isApproving ? 'Approving...' : 'Approve MOON'}
              </button>
            ) : (
              <button
                onClick={handleBridge}
                disabled={!canBridge || isBridging}
                className="btn-primary w-full"
              >
                {isBridging ? 'Bridging...' : 'Bridge MOON'}
              </button>
            )}
          </div>

          {/* ETH fee note */}
          <p className="mt-3 text-xs text-center text-gray-500">
            Relayer fee: {parseFloat(formatEther(relayerFee)).toFixed(6)} ETH
          </p>
        </div>

        {/* Info section */}
        <div className="mt-8 text-center text-sm text-gray-500">
          <p>DAO-owned bridge • No per-transaction limits</p>
          <p className="mt-1">1% fee on fulfilled amount • 1% fee on refunds (max 100 MOON)</p>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-space-700 py-6">
        <div className="max-w-6xl mx-auto px-4 text-center text-sm text-gray-500">
          <p>MoonBridge by CCMOON DAO</p>
        </div>
      </footer>
    </div>
  );
}

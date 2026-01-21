// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title BridgeTypes
 * @notice Shared types and constants for MoonBridge V2
 */
library BridgeTypes {
    // ============ Constants ============

    /// @notice Sentinel address for native ETH
    address constant NATIVE_ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    // Chain IDs
    uint256 constant CHAIN_ARBITRUM_NOVA = 42170;
    uint256 constant CHAIN_ARBITRUM_ONE = 42161;
    uint256 constant CHAIN_ETHEREUM = 1;
    uint256 constant CHAIN_GNOSIS = 100;
    uint256 constant CHAIN_BASE = 8453;
    uint256 constant CHAIN_POLYGON = 137;

    // Asset identifiers (keccak256 hashes for gas efficiency)
    bytes32 constant ASSET_MOON = keccak256("MOON");
    bytes32 constant ASSET_ETH = keccak256("ETH");
    bytes32 constant ASSET_USDC = keccak256("USDC");
    bytes32 constant ASSET_DONUT = keccak256("DONUT");

    // Fee configuration (basis points)
    uint16 constant DEFAULT_LP_FEE_BPS = 80; // 0.8%
    uint16 constant DEFAULT_DAO_FEE_BPS = 20; // 0.2%
    uint16 constant TOTAL_FEE_BPS = 100; // 1%
    uint16 constant BPS_DENOMINATOR = 10000;

    // Refund fee configuration for partial fills
    uint16 constant MAX_REFUND_FEE_BPS = 100; // 1% max refund fee
    uint256 constant MAX_REFUND_FEE_CAP = 100 ether; // Capped at 100 tokens

    // ============ Structs ============

    /// @notice Configuration for a supported asset
    struct AssetConfig {
        bool enabled; // Whether the asset is enabled for bridging
        address tokenAddress; // Token contract address (NATIVE_ETH for native)
        address lpTokenAddress; // LP token contract for this asset
        uint16 lpFeeBps; // Fee to LP pool (default 80 = 0.8%)
        uint16 daoFeeBps; // Fee to DAO wallet (default 20 = 0.2%)
        uint256 minBridgeAmount; // Minimum bridge amount (0 = no minimum)
        uint256 maxBridgeAmount; // Maximum bridge amount (0 = unlimited)
    }

    /// @notice Configuration for a supported chain
    struct ChainConfig {
        bool enabled; // Whether the chain is enabled
        uint256 gasSubsidyFee; // Flat fee for ETH bridges (in wei)
        uint256 relayerFee; // Relayer compensation per bridge
    }

    /// @notice State of a liquidity pool for an asset
    struct PoolState {
        uint256 totalDeposited; // Total LP deposits (principal)
        uint256 accumulatedFees; // Fees accumulated for LPs
        uint256 totalQueuedWithdrawals; // Amount waiting in withdrawal queue
    }

    /// @notice A queued withdrawal request
    struct WithdrawalRequest {
        address recipient; // Who receives the withdrawal
        uint256 amount; // Amount of underlying asset owed
        uint256 lpTokensBurned; // LP tokens already burned for this request
        uint64 timestamp; // When the request was created
        uint64 nextId; // Next request in linked list (0 = end)
    }

    /// @notice Queue pointers for an asset's withdrawal queue
    struct QueuePointers {
        uint64 head; // First request in queue
        uint64 tail; // Last request in queue
        uint64 nextRequestId; // Counter for generating request IDs
    }

    /// @notice A pending bridge request (stored on source chain)
    struct BridgeRequest {
        bytes32 assetId; // Which asset is being bridged
        address sender; // Who initiated the bridge (for refunds)
        address recipient; // Who receives on destination
        uint256 originalAmount; // Full amount user sent
        uint256 bridgeAmount; // Amount after initial fee (crosses chains)
        uint256 bridgeFee; // Initial bridge fee taken
        uint256 lpFee; // Portion to LP pool
        uint256 daoFee; // Portion to DAO
        uint256 fulfilledAmount; // Tracks how much was actually fulfilled
        uint256 toChainId; // Destination chain
        uint256 relayerFee; // ETH relayer fee paid
        uint64 timestamp; // When request was created
        uint64 nonce; // Unique nonce for this request
        bool fulfilled; // Whether fully fulfilled
        bool refunded; // Whether refund was processed
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {BridgeTypes} from "../libraries/BridgeTypes.sol";

/**
 * @title IBridgeV2
 * @notice Interface for MoonBridge V2
 */
interface IBridgeV2 {
    // ============ Events ============

    event AssetAdded(
        bytes32 indexed assetId,
        address tokenAddress,
        address lpTokenAddress
    );

    event AssetUpdated(bytes32 indexed assetId);

    event ChainConfigured(uint256 indexed chainId, bool enabled);

    event RouteConfigured(
        bytes32 indexed assetId,
        uint256 indexed chainId,
        bool enabled
    );

    event LiquidityDeposited(
        bytes32 indexed assetId,
        address indexed provider,
        uint256 amount,
        uint256 lpTokensMinted
    );

    event WithdrawalRequested(
        bytes32 indexed assetId,
        address indexed provider,
        uint256 lpTokensBurned,
        uint256 immediateAmount,
        uint256 queuedAmount,
        uint256 requestId
    );

    event WithdrawalFulfilled(
        bytes32 indexed assetId,
        address indexed recipient,
        uint256 amount,
        uint256 requestId
    );

    event BridgeRequested(
        bytes32 indexed bridgeId,
        bytes32 indexed assetId,
        address indexed sender,
        address recipient,
        uint256 amount,
        uint256 toChainId,
        uint256 fee
    );

    event BridgeFulfilled(
        bytes32 indexed bridgeId,
        bytes32 indexed assetId,
        address indexed recipient,
        uint256 amount,
        uint256 fromChainId
    );

    event BridgeRefunded(
        bytes32 indexed bridgeId,
        bytes32 indexed assetId,
        address indexed sender,
        uint256 amount
    );

    event FeesDistributed(
        bytes32 indexed assetId,
        uint256 lpFee,
        uint256 daoFee
    );

    event RelayerFeeCollected(
        bytes32 indexed bridgeId,
        address indexed relayer,
        uint256 amount
    );

    // ============ Errors ============

    error AssetNotEnabled();
    error AssetAlreadyExists();
    error ChainNotEnabled();
    error RouteNotEnabled();
    error InsufficientLiquidity();
    error InvalidAmount();
    error InvalidAddress();
    error InvalidFeeConfiguration();
    error BridgeAlreadyProcessed();
    error BridgeNotFound();
    error OnlyRelayer();
    error OnlyOwner();
    error TransferFailed();
    error Paused();
    error InsufficientRelayerFee();

    // ============ User Functions ============

    /// @notice Deposit liquidity and receive LP tokens
    /// @param assetId The asset to deposit
    /// @param amount Amount to deposit
    function deposit(bytes32 assetId, uint256 amount) external payable;

    /// @notice Withdraw liquidity by burning LP tokens
    /// @param assetId The asset to withdraw
    /// @param lpTokenAmount Amount of LP tokens to burn
    function withdraw(bytes32 assetId, uint256 lpTokenAmount) external;

    /// @notice Request a bridge to another chain
    /// @param assetId The asset to bridge
    /// @param amount Amount to bridge
    /// @param toChainId Destination chain ID
    /// @param recipient Address to receive on destination
    function requestBridge(
        bytes32 assetId,
        uint256 amount,
        uint256 toChainId,
        address recipient
    ) external payable;

    /// @notice Cancel a pending bridge request and receive refund
    /// @param bridgeId The bridge request ID to cancel
    function cancelBridge(bytes32 bridgeId) external;

    // ============ Relayer Functions ============

    /// @notice Fulfill a bridge request on destination chain
    /// @param bridgeId The bridge request ID
    /// @param assetId The asset being bridged
    /// @param recipient Recipient address
    /// @param amount Amount to transfer
    /// @param fromChainId Source chain ID
    function fulfillBridge(
        bytes32 bridgeId,
        bytes32 assetId,
        address recipient,
        uint256 amount,
        uint256 fromChainId
    ) external;

    /// @notice Mark a bridge as completed on source chain (relayer fee payout)
    /// @param bridgeId The bridge request ID
    function markBridgeCompleted(bytes32 bridgeId) external;

    /// @notice Process pending withdrawal queue
    /// @param assetId The asset's queue to process
    function processWithdrawalQueue(bytes32 assetId) external;

    // ============ Admin Functions ============

    /// @notice Add a new supported asset
    function addAsset(
        bytes32 assetId,
        address tokenAddress,
        string calldata lpName,
        string calldata lpSymbol
    ) external;

    /// @notice Update asset configuration
    function updateAssetConfig(
        bytes32 assetId,
        bool enabled,
        uint16 lpFeeBps,
        uint16 daoFeeBps,
        uint256 minAmount,
        uint256 maxAmount
    ) external;

    /// @notice Configure a chain
    function configureChain(
        uint256 chainId,
        bool enabled,
        uint256 gasSubsidyFee,
        uint256 relayerFee
    ) external;

    /// @notice Configure a route
    function configureRoute(
        bytes32 assetId,
        uint256 chainId,
        bool enabled
    ) external;

    /// @notice Set the DAO wallet address
    function setDaoWallet(address _daoWallet) external;

    /// @notice Set the relayer address
    function setRelayer(address _relayer) external;

    /// @notice Pause the bridge
    function pause() external;

    /// @notice Unpause the bridge
    function unpause() external;

    // ============ View Functions ============

    /// @notice Get LP token value in underlying asset
    function getLPTokenValue(
        bytes32 assetId,
        uint256 lpTokenAmount
    ) external view returns (uint256);

    /// @notice Get available liquidity for an asset
    function getAvailableLiquidity(
        bytes32 assetId
    ) external view returns (uint256);

    /// @notice Get total pool value for an asset
    function getTotalPoolValue(bytes32 assetId) external view returns (uint256);

    /// @notice Get withdrawal queue length for an asset
    function getQueueLength(bytes32 assetId) external view returns (uint256);

    /// @notice Get asset configuration
    function getAssetConfig(
        bytes32 assetId
    ) external view returns (BridgeTypes.AssetConfig memory);

    /// @notice Get chain configuration
    function getChainConfig(
        uint256 chainId
    ) external view returns (BridgeTypes.ChainConfig memory);

    /// @notice Check if a route is enabled
    function isRouteEnabled(
        bytes32 assetId,
        uint256 chainId
    ) external view returns (bool);

    /// @notice Calculate bridge fees for an amount
    function calculateFees(
        bytes32 assetId,
        uint256 amount
    ) external view returns (uint256 totalFee, uint256 lpFee, uint256 daoFee);
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

import {BridgeTypes} from "./libraries/BridgeTypes.sol";
import {IBridgeV2} from "./interfaces/IBridgeV2.sol";
import {ILPToken} from "./interfaces/ILPToken.sol";
import {LPTokenFactory} from "./LPTokenFactory.sol";

/**
 * @title BridgeV2
 * @notice Multi-chain, multi-asset bridge with liquidity provider functionality
 * @dev UUPS upgradeable contract with native ETH support and LP token system
 *
 * Key features:
 * - 4+ supported chains (Nova, Arbitrum One, Ethereum, Gnosis)
 * - 4+ supported assets (MOON, ETH, USDC, DONUT)
 * - ERC20 LP tokens with pro-rata share model
 * - Fixed relayer fees in native gas tokens for operational independence
 * - FIFO withdrawal queue for liquidity shortfalls
 * - Fee split: 0.8% to LPs, 0.2% to DAO
 */
contract BridgeV2 is
    Initializable,
    OwnableUpgradeable,
    ReentrancyGuardUpgradeable,
    UUPSUpgradeable,
    IBridgeV2
{
    using SafeERC20 for IERC20;

    // ============ Constants ============

    uint16 public constant BPS_DENOMINATOR = 10000;

    // ============ State Variables ============

    /// @notice Factory for deploying LP tokens
    LPTokenFactory public lpTokenFactory;

    /// @notice DAO wallet for fee collection
    address public daoWallet;

    /// @notice Authorized relayer address
    address public relayer;

    /// @notice Whether the bridge is paused
    bool public paused;

    /// @notice Nonce for generating bridge IDs
    uint256 public bridgeNonce;

    /// @notice Asset configurations
    mapping(bytes32 => BridgeTypes.AssetConfig) public assetConfigs;

    /// @notice Chain configurations with relayer fees
    mapping(uint256 => BridgeTypes.ChainConfig) public chainConfigs;

    /// @notice Route enablement (assetId => chainId => enabled)
    mapping(bytes32 => mapping(uint256 => bool)) public routes;

    /// @notice Pool states per asset
    mapping(bytes32 => BridgeTypes.PoolState) public poolStates;

    /// @notice Processed bridge IDs (prevents replay)
    mapping(bytes32 => bool) public processedBridges;

    /// @notice Bridge requests (stored on source chain)
    mapping(bytes32 => BridgeTypes.BridgeRequest) public bridgeRequests;

    /// @notice Withdrawal queue pointers per asset
    mapping(bytes32 => BridgeTypes.QueuePointers) public queuePointers;

    /// @notice Withdrawal requests per asset
    mapping(bytes32 => mapping(uint64 => BridgeTypes.WithdrawalRequest)) public withdrawalQueues;

    /// @notice Accumulated relayer fees (in native gas token)
    uint256 public relayerFeeBalance;

    // ============ Modifiers ============

    modifier whenNotPaused() {
        if (paused) revert Paused();
        _;
    }

    modifier onlyRelayer() {
        if (msg.sender != relayer) revert OnlyRelayer();
        _;
    }

    // ============ Constructor ============

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    // ============ Initialization ============

    function initialize(
        address _owner,
        address _daoWallet,
        address _relayer,
        address _lpTokenFactory
    ) external initializer {
        if (_owner == address(0)) revert InvalidAddress();
        if (_daoWallet == address(0)) revert InvalidAddress();
        if (_relayer == address(0)) revert InvalidAddress();
        if (_lpTokenFactory == address(0)) revert InvalidAddress();

        __Ownable_init(_owner);
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();

        daoWallet = _daoWallet;
        relayer = _relayer;
        lpTokenFactory = LPTokenFactory(_lpTokenFactory);

        // Initialize chain configs with default relayer fees
        // Arbitrum Nova: 0.0001 ETH
        chainConfigs[42170] = BridgeTypes.ChainConfig({
            enabled: true,
            gasSubsidyFee: 0,
            relayerFee: 0.0001 ether
        });

        // Arbitrum One: 0.0001 ETH
        chainConfigs[42161] = BridgeTypes.ChainConfig({
            enabled: true,
            gasSubsidyFee: 0,
            relayerFee: 0.0001 ether
        });

        // Ethereum: 0.001 ETH
        chainConfigs[1] = BridgeTypes.ChainConfig({
            enabled: true,
            gasSubsidyFee: 0,
            relayerFee: 0.001 ether
        });

        // Gnosis: 0.3 xDAI
        chainConfigs[100] = BridgeTypes.ChainConfig({
            enabled: true,
            gasSubsidyFee: 0,
            relayerFee: 0.3 ether
        });
    }

    // ============ User Functions ============

    /// @inheritdoc IBridgeV2
    function deposit(
        bytes32 assetId,
        uint256 amount
    ) external payable whenNotPaused nonReentrant {
        BridgeTypes.AssetConfig storage config = assetConfigs[assetId];
        if (!config.enabled) revert AssetNotEnabled();
        if (amount == 0) revert InvalidAmount();

        address tokenAddress = config.tokenAddress;
        bool isNative = tokenAddress == BridgeTypes.NATIVE_ETH;

        // Handle asset transfer
        if (isNative) {
            if (msg.value != amount) revert InvalidAmount();
        } else {
            if (msg.value != 0) revert InvalidAmount();
            IERC20(tokenAddress).safeTransferFrom(msg.sender, address(this), amount);
        }

        // Calculate LP tokens to mint
        ILPToken lpToken = ILPToken(config.lpTokenAddress);
        uint256 lpTokensToMint;

        uint256 totalSupply = lpToken.totalSupply();
        BridgeTypes.PoolState storage pool = poolStates[assetId];

        if (totalSupply == 0) {
            // First deposit: 1:1 ratio
            lpTokensToMint = amount;
        } else {
            // Subsequent deposits: pro-rata based on pool value
            uint256 totalPoolValue = pool.totalDeposited + pool.accumulatedFees;
            lpTokensToMint = (amount * totalSupply) / totalPoolValue;
        }

        // Update pool state
        pool.totalDeposited += amount;

        // Mint LP tokens
        lpToken.mint(msg.sender, lpTokensToMint);

        emit LiquidityDeposited(assetId, msg.sender, amount, lpTokensToMint);
    }

    /// @inheritdoc IBridgeV2
    function withdraw(
        bytes32 assetId,
        uint256 lpTokenAmount
    ) external whenNotPaused nonReentrant {
        BridgeTypes.AssetConfig storage config = assetConfigs[assetId];
        if (!config.enabled) revert AssetNotEnabled();
        if (lpTokenAmount == 0) revert InvalidAmount();

        ILPToken lpToken = ILPToken(config.lpTokenAddress);
        uint256 lpBalance = lpToken.balanceOf(msg.sender);
        if (lpTokenAmount > lpBalance) revert InvalidAmount();

        // Calculate underlying asset amount (pro-rata)
        uint256 totalSupply = lpToken.totalSupply();
        BridgeTypes.PoolState storage pool = poolStates[assetId];
        uint256 totalPoolValue = pool.totalDeposited + pool.accumulatedFees;
        uint256 assetAmount = (lpTokenAmount * totalPoolValue) / totalSupply;

        // Burn LP tokens first
        lpToken.burn(msg.sender, lpTokenAmount);

        // Update pool state
        pool.totalDeposited = (pool.totalDeposited * (totalSupply - lpTokenAmount)) / totalSupply;
        pool.accumulatedFees = (pool.accumulatedFees * (totalSupply - lpTokenAmount)) / totalSupply;

        // Calculate available liquidity
        uint256 available = getAvailableLiquidity(assetId);
        uint256 immediateAmount;
        uint256 queuedAmount;

        if (available >= assetAmount) {
            // Full immediate withdrawal
            immediateAmount = assetAmount;
            queuedAmount = 0;
            _transferAsset(config.tokenAddress, msg.sender, assetAmount);
        } else {
            // Partial immediate, rest queued
            immediateAmount = available;
            queuedAmount = assetAmount - available;

            if (immediateAmount > 0) {
                _transferAsset(config.tokenAddress, msg.sender, immediateAmount);
            }

            // Add to withdrawal queue
            BridgeTypes.QueuePointers storage pointers = queuePointers[assetId];
            uint64 requestId = pointers.nextRequestId++;

            withdrawalQueues[assetId][requestId] = BridgeTypes.WithdrawalRequest({
                recipient: msg.sender,
                amount: queuedAmount,
                lpTokensBurned: lpTokenAmount,
                timestamp: uint64(block.timestamp),
                nextId: 0
            });

            // Update queue pointers
            if (pointers.head == 0) {
                pointers.head = requestId;
            } else {
                withdrawalQueues[assetId][pointers.tail].nextId = requestId;
            }
            pointers.tail = requestId;

            pool.totalQueuedWithdrawals += queuedAmount;

            emit WithdrawalRequested(assetId, msg.sender, lpTokenAmount, immediateAmount, queuedAmount, requestId);
        }
    }

    /// @inheritdoc IBridgeV2
    function requestBridge(
        bytes32 assetId,
        uint256 amount,
        uint256 toChainId,
        address recipient
    ) external payable whenNotPaused nonReentrant {
        BridgeTypes.AssetConfig storage config = assetConfigs[assetId];
        if (!config.enabled) revert AssetNotEnabled();
        if (!routes[assetId][toChainId]) revert RouteNotEnabled();
        if (amount == 0) revert InvalidAmount();
        if (recipient == address(0)) revert InvalidAddress();
        if (toChainId == block.chainid) revert ChainNotEnabled();

        // Validate amount limits
        if (config.minBridgeAmount > 0 && amount < config.minBridgeAmount) revert InvalidAmount();
        if (config.maxBridgeAmount > 0 && amount > config.maxBridgeAmount) revert InvalidAmount();

        // Check relayer fee
        uint256 requiredRelayerFee = chainConfigs[block.chainid].relayerFee;
        address tokenAddress = config.tokenAddress;
        bool isNative = tokenAddress == BridgeTypes.NATIVE_ETH;

        if (isNative) {
            // For native ETH: msg.value must be amount + relayerFee
            if (msg.value < amount + requiredRelayerFee) revert InsufficientRelayerFee();
        } else {
            // For ERC20: msg.value must be relayerFee only
            if (msg.value < requiredRelayerFee) revert InsufficientRelayerFee();
            // Transfer ERC20 tokens
            IERC20(tokenAddress).safeTransferFrom(msg.sender, address(this), amount);
        }

        // Accumulate relayer fee
        relayerFeeBalance += requiredRelayerFee;

        // Calculate fees
        uint256 lpFee = (amount * config.lpFeeBps) / BPS_DENOMINATOR;
        uint256 daoFee = (amount * config.daoFeeBps) / BPS_DENOMINATOR;
        uint256 totalFee = lpFee + daoFee;
        uint256 bridgeAmount = amount - totalFee;

        // Distribute fees
        poolStates[assetId].accumulatedFees += lpFee;
        if (daoFee > 0) {
            _transferAsset(tokenAddress, daoWallet, daoFee);
        }

        // Generate bridge ID
        bytes32 bridgeId = keccak256(abi.encodePacked(
            block.chainid,
            toChainId,
            assetId,
            msg.sender,
            recipient,
            amount,
            bridgeNonce++
        ));

        // Store bridge request
        bridgeRequests[bridgeId] = BridgeTypes.BridgeRequest({
            assetId: assetId,
            sender: msg.sender,
            recipient: recipient,
            originalAmount: amount,
            bridgeAmount: bridgeAmount,
            bridgeFee: totalFee,
            lpFee: lpFee,
            daoFee: daoFee,
            fulfilledAmount: 0,
            toChainId: toChainId,
            relayerFee: requiredRelayerFee,
            timestamp: uint64(block.timestamp),
            nonce: uint64(bridgeNonce),
            fulfilled: false,
            refunded: false
        });

        emit BridgeRequested(
            bridgeId,
            assetId,
            msg.sender,
            recipient,
            bridgeAmount,
            toChainId,
            totalFee
        );
    }

    /// @inheritdoc IBridgeV2
    function cancelBridge(bytes32 bridgeId) external whenNotPaused nonReentrant {
        BridgeTypes.BridgeRequest storage request = bridgeRequests[bridgeId];
        if (request.sender != msg.sender) revert OnlyOwner();
        if (request.fulfilled) revert BridgeAlreadyProcessed();
        if (request.refunded) revert BridgeAlreadyProcessed();

        // Mark as refunded
        request.refunded = true;

        // Return bridgeAmount (fees already distributed, NOT refunded)
        BridgeTypes.AssetConfig storage config = assetConfigs[request.assetId];
        _transferAsset(config.tokenAddress, msg.sender, request.bridgeAmount);

        // Relayer fee is NOT refunded (already in relayerFeeBalance)

        emit BridgeRefunded(bridgeId, request.assetId, msg.sender, request.bridgeAmount);
    }

    // ============ Relayer Functions ============

    /// @inheritdoc IBridgeV2
    function fulfillBridge(
        bytes32 bridgeId,
        bytes32 assetId,
        address recipient,
        uint256 requestedAmount,
        uint256 fromChainId
    ) external onlyRelayer whenNotPaused nonReentrant {
        if (processedBridges[bridgeId]) revert BridgeAlreadyProcessed();
        if (recipient == address(0)) revert InvalidAddress();
        if (requestedAmount == 0) revert InvalidAmount();

        BridgeTypes.AssetConfig storage config = assetConfigs[assetId];
        if (!config.enabled) revert AssetNotEnabled();

        // Check available liquidity
        uint256 available = getAvailableLiquidity(assetId);

        // Fulfill whatever amount is available (partial fill support)
        uint256 amountToFulfill = available < requestedAmount ? available : requestedAmount;

        if (amountToFulfill == 0) revert InsufficientLiquidity();

        // Mark as processed (prevent replay)
        processedBridges[bridgeId] = true;

        // Transfer available amount to recipient
        _transferAsset(config.tokenAddress, recipient, amountToFulfill);

        emit BridgeFulfilled(bridgeId, assetId, recipient, amountToFulfill, requestedAmount, fromChainId);
    }

    /// @inheritdoc IBridgeV2
    function markBridgeCompleted(bytes32 bridgeId) external onlyRelayer whenNotPaused nonReentrant {
        BridgeTypes.BridgeRequest storage request = bridgeRequests[bridgeId];
        if (request.sender == address(0)) revert BridgeNotFound();
        if (request.fulfilled) revert BridgeAlreadyProcessed();

        // Mark as fulfilled
        request.fulfilled = true;

        // Relayer fee was already accumulated in relayerFeeBalance during requestBridge
        // No additional action needed here
    }

    /// @inheritdoc IBridgeV2
    function processPartialFillRefund(
        bytes32 bridgeId,
        uint256 fulfilledAmount
    ) external onlyRelayer whenNotPaused nonReentrant {
        BridgeTypes.BridgeRequest storage request = bridgeRequests[bridgeId];
        if (request.sender == address(0)) revert BridgeNotFound();
        if (request.refunded) revert BridgeAlreadyProcessed();

        uint256 bridgeAmount = request.bridgeAmount;

        // If fully fulfilled, just mark complete
        if (fulfilledAmount >= bridgeAmount) {
            request.fulfilled = true;
            request.fulfilledAmount = fulfilledAmount;
            return;
        }

        // Partial fill - calculate refund
        uint256 refundAmount = bridgeAmount - fulfilledAmount;

        // Calculate refund fee: 1% of refund, capped at 100 tokens
        uint256 refundFee = (refundAmount * BridgeTypes.MAX_REFUND_FEE_BPS) / BPS_DENOMINATOR;
        if (refundFee > BridgeTypes.MAX_REFUND_FEE_CAP) {
            refundFee = BridgeTypes.MAX_REFUND_FEE_CAP;
        }

        uint256 userRefund = refundAmount - refundFee;

        // Distribute refund fee (same 80/20 split as bridge fee)
        uint256 lpRefundFee = (refundFee * 80) / 100;
        uint256 daoRefundFee = refundFee - lpRefundFee;

        BridgeTypes.AssetConfig storage config = assetConfigs[request.assetId];
        poolStates[request.assetId].accumulatedFees += lpRefundFee;

        if (daoRefundFee > 0) {
            _transferAsset(config.tokenAddress, daoWallet, daoRefundFee);
        }

        // Refund user
        _transferAsset(config.tokenAddress, request.sender, userRefund);

        // Mark as refunded
        request.refunded = true;
        request.fulfilledAmount = fulfilledAmount;

        emit PartialFillRefunded(bridgeId, request.assetId, request.sender, fulfilledAmount, userRefund, refundFee);
    }

    /// @notice Claim accumulated relayer fees (only relayer can call)
    function claimRelayerFees() external onlyRelayer nonReentrant {
        uint256 amount = relayerFeeBalance;
        if (amount == 0) revert InvalidAmount();

        relayerFeeBalance = 0;

        (bool success, ) = payable(relayer).call{value: amount}("");
        if (!success) revert TransferFailed();
    }

    /// @inheritdoc IBridgeV2
    function processWithdrawalQueue(bytes32 assetId) external whenNotPaused nonReentrant {
        BridgeTypes.AssetConfig storage config = assetConfigs[assetId];
        if (!config.enabled) revert AssetNotEnabled();

        BridgeTypes.QueuePointers storage pointers = queuePointers[assetId];
        uint64 currentId = pointers.head;

        if (currentId == 0) return; // Queue is empty

        uint256 available = getAvailableLiquidity(assetId);
        BridgeTypes.PoolState storage pool = poolStates[assetId];

        while (currentId != 0 && available > 0) {
            BridgeTypes.WithdrawalRequest storage request = withdrawalQueues[assetId][currentId];

            if (request.amount <= available) {
                // Fulfill entire request
                available -= request.amount;
                pool.totalQueuedWithdrawals -= request.amount;

                _transferAsset(config.tokenAddress, request.recipient, request.amount);

                emit WithdrawalFulfilled(assetId, request.recipient, request.amount, currentId);

                // Move to next
                uint64 nextId = request.nextId;
                delete withdrawalQueues[assetId][currentId];
                currentId = nextId;
            } else {
                // Partial fulfillment
                request.amount -= available;
                pool.totalQueuedWithdrawals -= available;

                _transferAsset(config.tokenAddress, request.recipient, available);

                emit WithdrawalFulfilled(assetId, request.recipient, available, currentId);

                available = 0;
                break;
            }
        }

        // Update queue head
        pointers.head = currentId;
        if (currentId == 0) {
            pointers.tail = 0;
        }
    }

    // ============ Admin Functions ============

    /// @inheritdoc IBridgeV2
    function addAsset(
        bytes32 assetId,
        address tokenAddress,
        string calldata lpName,
        string calldata lpSymbol
    ) external onlyOwner {
        if (assetConfigs[assetId].lpTokenAddress != address(0)) revert AssetAlreadyExists();

        // Deploy LP token
        address lpTokenAddress = lpTokenFactory.deployLPToken(lpName, lpSymbol, address(this));

        // Configure asset
        assetConfigs[assetId] = BridgeTypes.AssetConfig({
            enabled: true,
            tokenAddress: tokenAddress,
            lpTokenAddress: lpTokenAddress,
            lpFeeBps: BridgeTypes.DEFAULT_LP_FEE_BPS,
            daoFeeBps: BridgeTypes.DEFAULT_DAO_FEE_BPS,
            minBridgeAmount: 0,
            maxBridgeAmount: 0
        });

        emit AssetAdded(assetId, tokenAddress, lpTokenAddress);
    }

    /// @inheritdoc IBridgeV2
    function updateAssetConfig(
        bytes32 assetId,
        bool enabled,
        uint16 lpFeeBps,
        uint16 daoFeeBps,
        uint256 minAmount,
        uint256 maxAmount
    ) external onlyOwner {
        BridgeTypes.AssetConfig storage config = assetConfigs[assetId];
        if (config.lpTokenAddress == address(0)) revert AssetNotEnabled();
        if (lpFeeBps + daoFeeBps > BPS_DENOMINATOR) revert InvalidFeeConfiguration();

        config.enabled = enabled;
        config.lpFeeBps = lpFeeBps;
        config.daoFeeBps = daoFeeBps;
        config.minBridgeAmount = minAmount;
        config.maxBridgeAmount = maxAmount;

        emit AssetUpdated(assetId);
    }

    /// @inheritdoc IBridgeV2
    function configureChain(
        uint256 chainId,
        bool enabled,
        uint256 gasSubsidyFee,
        uint256 relayerFee
    ) external onlyOwner {
        chainConfigs[chainId] = BridgeTypes.ChainConfig({
            enabled: enabled,
            gasSubsidyFee: gasSubsidyFee,
            relayerFee: relayerFee
        });

        emit ChainConfigured(chainId, enabled);
    }

    /// @inheritdoc IBridgeV2
    function configureRoute(
        bytes32 assetId,
        uint256 chainId,
        bool enabled
    ) external onlyOwner {
        routes[assetId][chainId] = enabled;
        emit RouteConfigured(assetId, chainId, enabled);
    }

    /// @inheritdoc IBridgeV2
    function setDaoWallet(address _daoWallet) external onlyOwner {
        if (_daoWallet == address(0)) revert InvalidAddress();
        daoWallet = _daoWallet;
    }

    /// @inheritdoc IBridgeV2
    function setRelayer(address _relayer) external onlyOwner {
        if (_relayer == address(0)) revert InvalidAddress();
        relayer = _relayer;
    }

    /// @inheritdoc IBridgeV2
    function pause() external onlyOwner {
        paused = true;
    }

    /// @inheritdoc IBridgeV2
    function unpause() external onlyOwner {
        paused = false;
    }

    // ============ View Functions ============

    /// @inheritdoc IBridgeV2
    function getLPTokenValue(
        bytes32 assetId,
        uint256 lpTokenAmount
    ) external view returns (uint256) {
        BridgeTypes.AssetConfig storage config = assetConfigs[assetId];
        ILPToken lpToken = ILPToken(config.lpTokenAddress);
        uint256 totalSupply = lpToken.totalSupply();

        if (totalSupply == 0) return 0;

        BridgeTypes.PoolState storage pool = poolStates[assetId];
        uint256 totalPoolValue = pool.totalDeposited + pool.accumulatedFees;

        return (lpTokenAmount * totalPoolValue) / totalSupply;
    }

    /// @inheritdoc IBridgeV2
    function getAvailableLiquidity(bytes32 assetId) public view returns (uint256) {
        BridgeTypes.AssetConfig storage config = assetConfigs[assetId];
        address tokenAddress = config.tokenAddress;

        uint256 balance;
        if (tokenAddress == BridgeTypes.NATIVE_ETH) {
            balance = address(this).balance - relayerFeeBalance;
        } else {
            balance = IERC20(tokenAddress).balanceOf(address(this));
        }

        BridgeTypes.PoolState storage pool = poolStates[assetId];
        uint256 reserved = pool.totalQueuedWithdrawals;

        return balance > reserved ? balance - reserved : 0;
    }

    /// @inheritdoc IBridgeV2
    function getTotalPoolValue(bytes32 assetId) external view returns (uint256) {
        BridgeTypes.PoolState storage pool = poolStates[assetId];
        return pool.totalDeposited + pool.accumulatedFees;
    }

    /// @inheritdoc IBridgeV2
    function getQueueLength(bytes32 assetId) external view returns (uint256) {
        BridgeTypes.QueuePointers storage pointers = queuePointers[assetId];
        uint64 currentId = pointers.head;
        uint256 count = 0;

        while (currentId != 0) {
            count++;
            currentId = withdrawalQueues[assetId][currentId].nextId;
        }

        return count;
    }

    /// @inheritdoc IBridgeV2
    function getAssetConfig(bytes32 assetId) external view returns (BridgeTypes.AssetConfig memory) {
        return assetConfigs[assetId];
    }

    /// @inheritdoc IBridgeV2
    function getChainConfig(uint256 chainId) external view returns (BridgeTypes.ChainConfig memory) {
        return chainConfigs[chainId];
    }

    /// @inheritdoc IBridgeV2
    function isRouteEnabled(bytes32 assetId, uint256 chainId) external view returns (bool) {
        return routes[assetId][chainId];
    }

    /// @inheritdoc IBridgeV2
    function calculateFees(
        bytes32 assetId,
        uint256 amount
    ) external view returns (uint256 totalFee, uint256 lpFee, uint256 daoFee) {
        BridgeTypes.AssetConfig storage config = assetConfigs[assetId];
        lpFee = (amount * config.lpFeeBps) / BPS_DENOMINATOR;
        daoFee = (amount * config.daoFeeBps) / BPS_DENOMINATOR;
        totalFee = lpFee + daoFee;
    }

    // ============ Internal Functions ============

    function _transferAsset(address tokenAddress, address to, uint256 amount) internal {
        if (tokenAddress == BridgeTypes.NATIVE_ETH) {
            (bool success, ) = payable(to).call{value: amount}("");
            if (!success) revert TransferFailed();
        } else {
            IERC20(tokenAddress).safeTransfer(to, amount);
        }
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    // Allow receiving ETH
    receive() external payable {}
}

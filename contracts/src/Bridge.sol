// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title MoonBridge
 * @notice DAO-owned liquidity-backed fast bridge for MOON between Arbitrum Nova and Arbitrum One
 * @dev Deployed on both chains. Relayers watch events and execute cross-chain transfers.
 * 
 * Security model:
 * - Onchain replay protection via requestId mapping
 * - Pause switch controlled by multisig
 * - Relayer allowlist for authorized fulfillment
 * - User funds custodied during pending requests
 * - Reentrancy protection on all state-changing functions
 */
contract MoonBridge is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============ Constants ============
    
    uint256 public constant FULFILL_FEE_BPS = 100; // 1%
    uint256 public constant REFUND_FEE_BPS = 100; // 1%
    uint256 public constant MAX_REFUND_FEE = 100 * 1e18; // 100 MOON cap
    uint256 public constant BPS_DENOMINATOR = 10000;

    // ============ Immutables ============
    
    IERC20 public immutable moonToken;
    uint256 public immutable chainId;

    // ============ State Variables ============
    
    address public multisig;
    uint256 public relayerFeeWei;
    bool public paused;
    
    // Relayer allowlist
    mapping(address => bool) public isRelayer;
    
    // Request tracking
    uint256 public nextNonce;
    mapping(bytes32 => Request) public requests;
    mapping(bytes32 => RequestStatus) public requestStatus;
    
    // ============ Enums ============
    
    enum RequestStatus {
        None,           // Request doesn't exist
        Pending,        // Request created, awaiting fulfillment
        Fulfilled,      // Fully fulfilled on destination
        PartialFilled,  // Partially fulfilled, refund pending
        Refunded,       // Refund completed (after partial or zero fill)
        Completed,      // Fully processed (fulfilled + refunded if needed)
        Cancelled       // Cancelled by user before fulfillment started
    }

    // ============ Structs ============
    
    struct Request {
        uint256 sourceChainId;
        uint256 destChainId;
        address requester;
        address recipient;
        uint256 amount;
        uint256 ethFee;
        uint256 nonce;
        uint256 fulfilledAmount;
        uint256 refundedAmount;
        bool ethFeePaid;
    }

    // ============ Events ============
    
    event BridgeRequested(
        bytes32 indexed requestId,
        uint256 indexed sourceChainId,
        uint256 indexed destChainId,
        address requester,
        address recipient,
        uint256 amount,
        uint256 ethFeeWei,
        uint256 nonce
    );

    event RequestCancelled(
        bytes32 indexed requestId,
        address indexed requester
    );

    event BridgeFulfilled(
        bytes32 indexed requestId,
        address indexed relayer,
        uint256 fulfilledAmount,
        uint256 fulfilledFee,
        uint256 recipientReceived
    );

    event BridgeRefunded(
        bytes32 indexed requestId,
        address indexed relayer,
        uint256 refundAmount,
        uint256 refundFee,
        uint256 requesterReceived
    );

    event EthFeePaid(
        bytes32 indexed requestId,
        address indexed relayer,
        uint256 amount
    );

    event PauseChanged(bool paused);
    event RelayerSet(address indexed relayer, bool allowed);
    event RelayerFeeSet(uint256 newFeeWei);
    event MultisigChanged(address indexed oldMultisig, address indexed newMultisig);
    event LiquidityWithdrawn(address indexed to, uint256 amount);
    event LiquidityDeposited(address indexed from, uint256 amount);

    // ============ Errors ============
    
    error Paused();
    error NotPaused();
    error OnlyMultisig();
    error OnlyRelayer();
    error OnlyRequester();
    error InvalidAmount();
    error InvalidRecipient();
    error InvalidDestChain();
    error InsufficientEthFee();
    error RequestNotFound();
    error RequestNotPending();
    error RequestAlreadyProcessed();
    error FulfillmentAlreadyStarted();
    error InsufficientLiquidity();
    error InvalidFulfillAmount();
    error InvalidRefundAmount();
    error RefundAlreadyDone();
    error EthFeeAlreadyPaid();
    error EthTransferFailed();
    error ZeroAddress();

    // ============ Modifiers ============
    
    modifier onlyMultisig() {
        if (msg.sender != multisig) revert OnlyMultisig();
        _;
    }

    modifier onlyRelayer() {
        if (!isRelayer[msg.sender]) revert OnlyRelayer();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert Paused();
        _;
    }

    modifier whenPaused() {
        if (!paused) revert NotPaused();
        _;
    }

    // ============ Constructor ============
    
    constructor(
        address _moonToken,
        address _multisig,
        uint256 _relayerFeeWei,
        address[] memory _relayers
    ) {
        if (_moonToken == address(0)) revert ZeroAddress();
        if (_multisig == address(0)) revert ZeroAddress();
        
        moonToken = IERC20(_moonToken);
        multisig = _multisig;
        relayerFeeWei = _relayerFeeWei;
        chainId = block.chainid;
        
        for (uint256 i = 0; i < _relayers.length; i++) {
            if (_relayers[i] != address(0)) {
                isRelayer[_relayers[i]] = true;
                emit RelayerSet(_relayers[i], true);
            }
        }
    }

    // ============ User Functions ============

    /**
     * @notice Request a bridge transfer to another chain
     * @param amount Amount of MOON to bridge
     * @param destChainId Destination chain ID (42161 for One, 42170 for Nova)
     * @param recipient Address to receive MOON on destination chain
     * @return requestId Unique identifier for this request
     */
    function requestBridge(
        uint256 amount,
        uint256 destChainId,
        address recipient
    ) external payable whenNotPaused nonReentrant returns (bytes32 requestId) {
        if (amount == 0) revert InvalidAmount();
        if (recipient == address(0)) revert InvalidRecipient();
        if (destChainId == chainId) revert InvalidDestChain();
        if (msg.value < relayerFeeWei) revert InsufficientEthFee();

        // Generate unique request ID
        uint256 nonce = nextNonce++;
        requestId = keccak256(abi.encodePacked(
            chainId,
            destChainId,
            msg.sender,
            recipient,
            amount,
            nonce
        ));

        // Store request details
        requests[requestId] = Request({
            sourceChainId: chainId,
            destChainId: destChainId,
            requester: msg.sender,
            recipient: recipient,
            amount: amount,
            ethFee: msg.value,
            nonce: nonce,
            fulfilledAmount: 0,
            refundedAmount: 0,
            ethFeePaid: false
        });
        requestStatus[requestId] = RequestStatus.Pending;

        // Custody user's MOON tokens
        moonToken.safeTransferFrom(msg.sender, address(this), amount);

        emit BridgeRequested(
            requestId,
            chainId,
            destChainId,
            msg.sender,
            recipient,
            amount,
            msg.value,
            nonce
        );
    }

    /**
     * @notice Cancel a pending request before fulfillment starts
     * @param requestId The request to cancel
     * @dev ETH relayer fee is NOT refunded on cancellation
     */
    function cancelRequest(bytes32 requestId) external whenNotPaused nonReentrant {
        Request storage req = requests[requestId];
        
        if (req.requester == address(0)) revert RequestNotFound();
        if (msg.sender != req.requester) revert OnlyRequester();
        if (requestStatus[requestId] != RequestStatus.Pending) revert RequestNotPending();
        if (req.fulfilledAmount > 0) revert FulfillmentAlreadyStarted();

        // Update status
        requestStatus[requestId] = RequestStatus.Cancelled;

        // Return MOON to user (ETH fee is NOT refunded)
        moonToken.safeTransfer(req.requester, req.amount);

        emit RequestCancelled(requestId, msg.sender);
    }

    // ============ Relayer Functions ============

    /**
     * @notice Fulfill a bridge request on the destination chain
     * @param requestId The request to fulfill
     * @param sourceChainId Source chain ID (for verification)
     * @param requester Original requester address
     * @param recipient Recipient address
     * @param totalAmount Total requested amount
     * @param fulfillAmount Amount to fulfill (may be partial)
     * @param nonce Request nonce
     * @dev Called on DESTINATION chain. Fulfills up to available liquidity.
     */
    function fulfill(
        bytes32 requestId,
        uint256 sourceChainId,
        address requester,
        address recipient,
        uint256 totalAmount,
        uint256 fulfillAmount,
        uint256 nonce
    ) external onlyRelayer whenNotPaused nonReentrant {
        // Verify request ID matches parameters
        bytes32 computedId = keccak256(abi.encodePacked(
            sourceChainId,
            chainId, // This chain is the destination
            requester,
            recipient,
            totalAmount,
            nonce
        ));
        if (computedId != requestId) revert RequestNotFound();

        // Check status - must be None (first fulfill on dest) or already in progress
        RequestStatus status = requestStatus[requestId];
        if (status == RequestStatus.Completed || status == RequestStatus.Cancelled) {
            revert RequestAlreadyProcessed();
        }

        // Get current fulfill tracking
        Request storage req = requests[requestId];
        
        // Initialize if first time seeing this request on destination
        if (req.requester == address(0)) {
            req.sourceChainId = sourceChainId;
            req.destChainId = chainId;
            req.requester = requester;
            req.recipient = recipient;
            req.amount = totalAmount;
            req.nonce = nonce;
        }

        // Validate fulfill amount
        uint256 remainingToFulfill = totalAmount - req.fulfilledAmount;
        if (fulfillAmount == 0 || fulfillAmount > remainingToFulfill) {
            revert InvalidFulfillAmount();
        }

        // Check liquidity
        uint256 available = moonToken.balanceOf(address(this));
        if (available < fulfillAmount) revert InsufficientLiquidity();

        // Calculate fee (1%)
        uint256 fee = (fulfillAmount * FULFILL_FEE_BPS) / BPS_DENOMINATOR;
        uint256 recipientReceives = fulfillAmount - fee;

        // Update state
        req.fulfilledAmount += fulfillAmount;
        
        // Update status
        if (req.fulfilledAmount == totalAmount) {
            requestStatus[requestId] = RequestStatus.Fulfilled;
        } else {
            requestStatus[requestId] = RequestStatus.PartialFilled;
        }

        // Transfer to recipient
        moonToken.safeTransfer(recipient, recipientReceives);

        emit BridgeFulfilled(requestId, msg.sender, fulfillAmount, fee, recipientReceives);
    }

    /**
     * @notice Process a refund on the source chain
     * @param requestId The request to refund
     * @param refundAmount Amount to refund
     * @dev Called on SOURCE chain after partial/zero fulfillment on destination.
     *      Also pays out the ETH relayer fee to the calling relayer.
     */
    function refund(
        bytes32 requestId,
        uint256 refundAmount
    ) external onlyRelayer whenNotPaused nonReentrant {
        Request storage req = requests[requestId];
        
        if (req.requester == address(0)) revert RequestNotFound();
        if (req.sourceChainId != chainId) revert RequestNotFound(); // Must be source chain
        
        RequestStatus status = requestStatus[requestId];
        if (status == RequestStatus.Completed || 
            status == RequestStatus.Cancelled ||
            status == RequestStatus.None) {
            revert RequestAlreadyProcessed();
        }

        // Validate refund amount
        uint256 maxRefundable = req.amount - req.refundedAmount;
        if (refundAmount == 0 || refundAmount > maxRefundable) {
            revert InvalidRefundAmount();
        }

        // Calculate fee (1%, capped at 100 MOON)
        uint256 fee = (refundAmount * REFUND_FEE_BPS) / BPS_DENOMINATOR;
        if (fee > MAX_REFUND_FEE) {
            fee = MAX_REFUND_FEE;
        }
        uint256 requesterReceives = refundAmount - fee;

        // Update state
        req.refundedAmount += refundAmount;

        // Determine if request is fully processed
        // On source chain, we track refunds. Combined with fulfill on dest should equal total.
        if (req.refundedAmount == req.amount) {
            // Full refund (zero liquidity case)
            requestStatus[requestId] = RequestStatus.Refunded;
        } else {
            // Partial refund - mark as completed since the rest was fulfilled on dest
            requestStatus[requestId] = RequestStatus.Completed;
        }

        // Transfer refund to requester
        moonToken.safeTransfer(req.requester, requesterReceives);

        // Pay ETH fee to relayer if not already paid
        if (!req.ethFeePaid && req.ethFee > 0) {
            req.ethFeePaid = true;
            (bool success, ) = payable(msg.sender).call{value: req.ethFee}("");
            if (!success) revert EthTransferFailed();
            emit EthFeePaid(requestId, msg.sender, req.ethFee);
        }

        emit BridgeRefunded(requestId, msg.sender, refundAmount, fee, requesterReceives);
    }

    /**
     * @notice Mark a request as completed when fully fulfilled (no refund needed)
     * @param requestId The request to complete
     * @dev Called on SOURCE chain when destination fulfill covered the full amount.
     *      Pays out the ETH relayer fee.
     */
    function markCompleted(bytes32 requestId) external onlyRelayer whenNotPaused nonReentrant {
        Request storage req = requests[requestId];
        
        if (req.requester == address(0)) revert RequestNotFound();
        if (req.sourceChainId != chainId) revert RequestNotFound();
        
        RequestStatus status = requestStatus[requestId];
        if (status != RequestStatus.Pending) revert RequestNotPending();

        // Mark as completed
        requestStatus[requestId] = RequestStatus.Completed;
        req.refundedAmount = 0; // No refund needed

        // Pay ETH fee to relayer
        if (!req.ethFeePaid && req.ethFee > 0) {
            req.ethFeePaid = true;
            (bool success, ) = payable(msg.sender).call{value: req.ethFee}("");
            if (!success) revert EthTransferFailed();
            emit EthFeePaid(requestId, msg.sender, req.ethFee);
        }
    }

    // ============ Admin Functions ============

    function pause() external onlyMultisig {
        paused = true;
        emit PauseChanged(true);
    }

    function unpause() external onlyMultisig {
        paused = false;
        emit PauseChanged(false);
    }

    function setRelayer(address relayer, bool allowed) external onlyMultisig {
        if (relayer == address(0)) revert ZeroAddress();
        isRelayer[relayer] = allowed;
        emit RelayerSet(relayer, allowed);
    }

    function setRelayerFeeWei(uint256 newFeeWei) external onlyMultisig {
        relayerFeeWei = newFeeWei;
        emit RelayerFeeSet(newFeeWei);
    }

    function setMultisig(address newMultisig) external onlyMultisig {
        if (newMultisig == address(0)) revert ZeroAddress();
        address old = multisig;
        multisig = newMultisig;
        emit MultisigChanged(old, newMultisig);
    }

    /**
     * @notice Withdraw MOON liquidity (DAO governance required offchain)
     * @param to Recipient address
     * @param amount Amount to withdraw
     */
    function withdrawLiquidity(address to, uint256 amount) external onlyMultisig {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert InvalidAmount();
        moonToken.safeTransfer(to, amount);
        emit LiquidityWithdrawn(to, amount);
    }

    /**
     * @notice Emergency ETH withdrawal
     */
    function withdrawEth(address to, uint256 amount) external onlyMultisig {
        if (to == address(0)) revert ZeroAddress();
        (bool success, ) = payable(to).call{value: amount}("");
        if (!success) revert EthTransferFailed();
    }

    // ============ View Functions ============

    /**
     * @notice Get available MOON liquidity for fulfillment
     */
    function getAvailableLiquidity() external view returns (uint256) {
        return moonToken.balanceOf(address(this));
    }

    /**
     * @notice Get full request details
     */
    function getRequest(bytes32 requestId) external view returns (
        Request memory request,
        RequestStatus status
    ) {
        return (requests[requestId], requestStatus[requestId]);
    }

    /**
     * @notice Calculate fees for a given amount
     */
    function calculateFees(uint256 fulfillAmount, uint256 refundAmount) external pure returns (
        uint256 fulfillFee,
        uint256 refundFee
    ) {
        fulfillFee = (fulfillAmount * FULFILL_FEE_BPS) / BPS_DENOMINATOR;
        refundFee = (refundAmount * REFUND_FEE_BPS) / BPS_DENOMINATOR;
        if (refundFee > MAX_REFUND_FEE) {
            refundFee = MAX_REFUND_FEE;
        }
    }

    /**
     * @notice Compute a request ID from parameters
     */
    function computeRequestId(
        uint256 sourceChainId_,
        uint256 destChainId_,
        address requester,
        address recipient,
        uint256 amount,
        uint256 nonce
    ) external view returns (bytes32) {
        return keccak256(abi.encodePacked(
            sourceChainId_,
            destChainId_,
            requester,
            recipient,
            amount,
            nonce
        ));
    }

    // Allow receiving ETH for relayer fees
    receive() external payable {}
}

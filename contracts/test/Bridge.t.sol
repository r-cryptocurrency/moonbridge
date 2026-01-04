// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console2} from "forge-std/Test.sol";
import {MoonBridge} from "../src/Bridge.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

// Mock MOON token for testing
contract MockMoon is ERC20 {
    constructor() ERC20("Moon", "MOON") {
        _mint(msg.sender, 1_000_000_000 * 1e18);
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract MoonBridgeTest is Test {
    MoonBridge public bridgeNova;
    MoonBridge public bridgeOne;
    MockMoon public moonNova;
    MockMoon public moonOne;

    address public multisig = address(0x1);
    address public relayer1 = address(0x2);
    address public relayer2 = address(0x3);
    address public user = address(0x4);
    address public recipient = address(0x5);

    uint256 public constant RELAYER_FEE = 0.001 ether;
    uint256 public constant NOVA_CHAIN_ID = 42170;
    uint256 public constant ONE_CHAIN_ID = 42161;

    function setUp() public {
        // Deploy mock tokens
        moonNova = new MockMoon();
        moonOne = new MockMoon();

        // Create relayers array
        address[] memory relayers = new address[](2);
        relayers[0] = relayer1;
        relayers[1] = relayer2;

        // Deploy bridges
        vm.chainId(NOVA_CHAIN_ID);
        bridgeNova = new MoonBridge(
            address(moonNova),
            multisig,
            RELAYER_FEE,
            relayers
        );

        vm.chainId(ONE_CHAIN_ID);
        bridgeOne = new MoonBridge(
            address(moonOne),
            multisig,
            RELAYER_FEE,
            relayers
        );

        // Seed liquidity to bridges
        moonNova.transfer(address(bridgeNova), 100_000 * 1e18);
        moonOne.transfer(address(bridgeOne), 100_000 * 1e18);

        // Fund user
        moonNova.transfer(user, 10_000 * 1e18);
        moonOne.transfer(user, 10_000 * 1e18);

        // Fund relayers with ETH
        vm.deal(relayer1, 10 ether);
        vm.deal(relayer2, 10 ether);
    }

    // ============ Request Tests ============

    function testRequestBridge() public {
        vm.chainId(NOVA_CHAIN_ID);
        uint256 amount = 1000 * 1e18;

        vm.startPrank(user);
        moonNova.approve(address(bridgeNova), amount);
        
        bytes32 requestId = bridgeNova.requestBridge{value: RELAYER_FEE}(
            amount,
            ONE_CHAIN_ID,
            recipient
        );
        vm.stopPrank();

        // Verify request stored
        (MoonBridge.Request memory req, MoonBridge.RequestStatus status) = bridgeNova.getRequest(requestId);
        assertEq(req.amount, amount);
        assertEq(req.requester, user);
        assertEq(req.recipient, recipient);
        assertEq(uint8(status), uint8(MoonBridge.RequestStatus.Pending));

        // Verify MOON transferred to bridge
        assertEq(moonNova.balanceOf(user), 9000 * 1e18);
    }

    function testRequestBridgeInsufficientFee() public {
        vm.chainId(NOVA_CHAIN_ID);
        uint256 amount = 1000 * 1e18;

        vm.startPrank(user);
        moonNova.approve(address(bridgeNova), amount);
        
        vm.expectRevert(MoonBridge.InsufficientEthFee.selector);
        bridgeNova.requestBridge{value: RELAYER_FEE - 1}(
            amount,
            ONE_CHAIN_ID,
            recipient
        );
        vm.stopPrank();
    }

    function testRequestBridgeZeroAmount() public {
        vm.chainId(NOVA_CHAIN_ID);

        vm.startPrank(user);
        vm.expectRevert(MoonBridge.InvalidAmount.selector);
        bridgeNova.requestBridge{value: RELAYER_FEE}(
            0,
            ONE_CHAIN_ID,
            recipient
        );
        vm.stopPrank();
    }

    function testRequestBridgeSameChain() public {
        vm.chainId(NOVA_CHAIN_ID);
        uint256 amount = 1000 * 1e18;

        vm.startPrank(user);
        moonNova.approve(address(bridgeNova), amount);
        
        vm.expectRevert(MoonBridge.InvalidDestChain.selector);
        bridgeNova.requestBridge{value: RELAYER_FEE}(
            amount,
            NOVA_CHAIN_ID, // Same chain
            recipient
        );
        vm.stopPrank();
    }

    // ============ Cancellation Tests ============

    function testCancelRequest() public {
        vm.chainId(NOVA_CHAIN_ID);
        uint256 amount = 1000 * 1e18;
        uint256 userBalanceBefore = moonNova.balanceOf(user);

        vm.startPrank(user);
        moonNova.approve(address(bridgeNova), amount);
        bytes32 requestId = bridgeNova.requestBridge{value: RELAYER_FEE}(
            amount,
            ONE_CHAIN_ID,
            recipient
        );

        // Cancel
        bridgeNova.cancelRequest(requestId);
        vm.stopPrank();

        // Verify status
        (, MoonBridge.RequestStatus status) = bridgeNova.getRequest(requestId);
        assertEq(uint8(status), uint8(MoonBridge.RequestStatus.Cancelled));

        // Verify MOON returned (but ETH fee NOT returned)
        assertEq(moonNova.balanceOf(user), userBalanceBefore);
    }

    function testCancelRequestNotRequester() public {
        vm.chainId(NOVA_CHAIN_ID);
        uint256 amount = 1000 * 1e18;

        vm.startPrank(user);
        moonNova.approve(address(bridgeNova), amount);
        bytes32 requestId = bridgeNova.requestBridge{value: RELAYER_FEE}(
            amount,
            ONE_CHAIN_ID,
            recipient
        );
        vm.stopPrank();

        // Try to cancel as different user
        vm.prank(recipient);
        vm.expectRevert(MoonBridge.OnlyRequester.selector);
        bridgeNova.cancelRequest(requestId);
    }

    // ============ Fulfillment Tests ============

    function testFullFulfill() public {
        // Create request on Nova
        vm.chainId(NOVA_CHAIN_ID);
        uint256 amount = 1000 * 1e18;

        vm.startPrank(user);
        moonNova.approve(address(bridgeNova), amount);
        bytes32 requestId = bridgeNova.requestBridge{value: RELAYER_FEE}(
            amount,
            ONE_CHAIN_ID,
            recipient
        );
        vm.stopPrank();

        // Fulfill on One
        vm.chainId(ONE_CHAIN_ID);
        uint256 recipientBalanceBefore = moonOne.balanceOf(recipient);

        vm.prank(relayer1);
        bridgeOne.fulfill(
            requestId,
            NOVA_CHAIN_ID,
            user,
            recipient,
            amount,
            amount,
            0 // nonce
        );

        // Verify recipient received amount minus 1% fee
        uint256 expectedReceived = amount - (amount / 100);
        assertEq(moonOne.balanceOf(recipient), recipientBalanceBefore + expectedReceived);

        // Verify status
        (, MoonBridge.RequestStatus status) = bridgeOne.getRequest(requestId);
        assertEq(uint8(status), uint8(MoonBridge.RequestStatus.Fulfilled));
    }

    function testPartialFulfill() public {
        // Create request on Nova for more than destination liquidity
        vm.chainId(NOVA_CHAIN_ID);
        uint256 amount = 1000 * 1e18;

        vm.startPrank(user);
        moonNova.approve(address(bridgeNova), amount);
        bytes32 requestId = bridgeNova.requestBridge{value: RELAYER_FEE}(
            amount,
            ONE_CHAIN_ID,
            recipient
        );
        vm.stopPrank();

        // Partially fulfill on One (only 600 MOON available)
        vm.chainId(ONE_CHAIN_ID);
        uint256 fulfillAmount = 600 * 1e18;
        uint256 recipientBalanceBefore = moonOne.balanceOf(recipient);

        vm.prank(relayer1);
        bridgeOne.fulfill(
            requestId,
            NOVA_CHAIN_ID,
            user,
            recipient,
            amount,
            fulfillAmount,
            0
        );

        // Verify recipient received partial amount minus 1% fee
        uint256 fee = fulfillAmount / 100;
        uint256 expectedReceived = fulfillAmount - fee;
        assertEq(moonOne.balanceOf(recipient), recipientBalanceBefore + expectedReceived);

        // Verify status is partial
        (, MoonBridge.RequestStatus status) = bridgeOne.getRequest(requestId);
        assertEq(uint8(status), uint8(MoonBridge.RequestStatus.PartialFilled));
    }

    function testFulfillOnlyRelayer() public {
        vm.chainId(NOVA_CHAIN_ID);
        uint256 amount = 1000 * 1e18;

        vm.startPrank(user);
        moonNova.approve(address(bridgeNova), amount);
        bytes32 requestId = bridgeNova.requestBridge{value: RELAYER_FEE}(
            amount,
            ONE_CHAIN_ID,
            recipient
        );
        vm.stopPrank();

        // Try to fulfill as non-relayer
        vm.chainId(ONE_CHAIN_ID);
        vm.prank(user);
        vm.expectRevert(MoonBridge.OnlyRelayer.selector);
        bridgeOne.fulfill(
            requestId,
            NOVA_CHAIN_ID,
            user,
            recipient,
            amount,
            amount,
            0
        );
    }

    // ============ Refund Tests ============

    function testRefund() public {
        vm.chainId(NOVA_CHAIN_ID);
        uint256 amount = 1000 * 1e18;
        uint256 userBalanceBefore = moonNova.balanceOf(user);

        vm.startPrank(user);
        moonNova.approve(address(bridgeNova), amount);
        bytes32 requestId = bridgeNova.requestBridge{value: RELAYER_FEE}(
            amount,
            ONE_CHAIN_ID,
            recipient
        );
        vm.stopPrank();

        // Simulate zero liquidity scenario - full refund
        uint256 refundAmount = amount;
        uint256 relayerBalanceBefore = relayer1.balance;

        vm.prank(relayer1);
        bridgeNova.refund(requestId, refundAmount);

        // Verify user received refund minus fee (capped at 100 MOON)
        uint256 fee = refundAmount / 100; // 10 MOON
        if (fee > 100 * 1e18) fee = 100 * 1e18;
        uint256 expectedRefund = refundAmount - fee;
        assertEq(moonNova.balanceOf(user), userBalanceBefore - amount + expectedRefund);

        // Verify relayer received ETH fee
        assertEq(relayer1.balance, relayerBalanceBefore + RELAYER_FEE);

        // Verify status
        (, MoonBridge.RequestStatus status) = bridgeNova.getRequest(requestId);
        assertEq(uint8(status), uint8(MoonBridge.RequestStatus.Refunded));
    }

    function testRefundFeeCapAt100Moon() public {
        vm.chainId(NOVA_CHAIN_ID);
        uint256 amount = 50_000 * 1e18; // Large amount where 1% > 100 MOON

        // Give user more MOON
        moonNova.mint(user, amount);

        vm.startPrank(user);
        moonNova.approve(address(bridgeNova), amount);
        bytes32 requestId = bridgeNova.requestBridge{value: RELAYER_FEE}(
            amount,
            ONE_CHAIN_ID,
            recipient
        );
        vm.stopPrank();

        uint256 userBalanceBefore = moonNova.balanceOf(user);

        vm.prank(relayer1);
        bridgeNova.refund(requestId, amount);

        // Fee should be capped at 100 MOON, not 500 MOON (1% of 50000)
        uint256 expectedRefund = amount - (100 * 1e18);
        assertEq(moonNova.balanceOf(user), userBalanceBefore + expectedRefund);
    }

    // ============ Replay Protection Tests ============

    function testDoubleFullfillPrevented() public {
        vm.chainId(NOVA_CHAIN_ID);
        uint256 amount = 1000 * 1e18;

        vm.startPrank(user);
        moonNova.approve(address(bridgeNova), amount);
        bytes32 requestId = bridgeNova.requestBridge{value: RELAYER_FEE}(
            amount,
            ONE_CHAIN_ID,
            recipient
        );
        vm.stopPrank();

        // First fulfill succeeds
        vm.chainId(ONE_CHAIN_ID);
        vm.prank(relayer1);
        bridgeOne.fulfill(
            requestId,
            NOVA_CHAIN_ID,
            user,
            recipient,
            amount,
            amount,
            0
        );

        // Second fulfill should fail
        vm.prank(relayer2);
        vm.expectRevert(MoonBridge.InvalidFulfillAmount.selector);
        bridgeOne.fulfill(
            requestId,
            NOVA_CHAIN_ID,
            user,
            recipient,
            amount,
            amount,
            0
        );
    }

    function testDoubleRefundPrevented() public {
        vm.chainId(NOVA_CHAIN_ID);
        uint256 amount = 1000 * 1e18;

        vm.startPrank(user);
        moonNova.approve(address(bridgeNova), amount);
        bytes32 requestId = bridgeNova.requestBridge{value: RELAYER_FEE}(
            amount,
            ONE_CHAIN_ID,
            recipient
        );
        vm.stopPrank();

        // First refund succeeds
        vm.prank(relayer1);
        bridgeNova.refund(requestId, amount);

        // Second refund should fail
        vm.prank(relayer2);
        vm.expectRevert(MoonBridge.RequestAlreadyProcessed.selector);
        bridgeNova.refund(requestId, amount);
    }

    // ============ Pause Tests ============

    function testPauseBlocksRequests() public {
        vm.chainId(NOVA_CHAIN_ID);
        
        vm.prank(multisig);
        bridgeNova.pause();

        vm.startPrank(user);
        moonNova.approve(address(bridgeNova), 1000 * 1e18);
        
        vm.expectRevert(MoonBridge.Paused.selector);
        bridgeNova.requestBridge{value: RELAYER_FEE}(
            1000 * 1e18,
            ONE_CHAIN_ID,
            recipient
        );
        vm.stopPrank();
    }

    function testOnlyMultisigCanPause() public {
        vm.prank(user);
        vm.expectRevert(MoonBridge.OnlyMultisig.selector);
        bridgeNova.pause();
    }

    // ============ Admin Tests ============

    function testSetRelayer() public {
        address newRelayer = address(0x999);
        
        vm.prank(multisig);
        bridgeNova.setRelayer(newRelayer, true);
        
        assertTrue(bridgeNova.isRelayer(newRelayer));
    }

    function testSetRelayerFee() public {
        uint256 newFee = 0.002 ether;
        
        vm.prank(multisig);
        bridgeNova.setRelayerFeeWei(newFee);
        
        assertEq(bridgeNova.relayerFeeWei(), newFee);
    }

    function testWithdrawLiquidity() public {
        uint256 amount = 10_000 * 1e18;
        address treasury = address(0x888);
        
        vm.prank(multisig);
        bridgeNova.withdrawLiquidity(treasury, amount);
        
        assertEq(moonNova.balanceOf(treasury), amount);
    }

    // ============ Fee Calculation Tests ============

    function testFeeCalculation() public view {
        (uint256 fulfillFee, uint256 refundFee) = bridgeNova.calculateFees(
            1000 * 1e18,
            500 * 1e18
        );

        assertEq(fulfillFee, 10 * 1e18); // 1% of 1000
        assertEq(refundFee, 5 * 1e18); // 1% of 500
    }

    function testFeeCalculationWithCap() public view {
        (uint256 fulfillFee, uint256 refundFee) = bridgeNova.calculateFees(
            50_000 * 1e18,
            50_000 * 1e18
        );

        assertEq(fulfillFee, 500 * 1e18); // 1% of 50000
        assertEq(refundFee, 100 * 1e18); // Capped at 100 MOON
    }
}

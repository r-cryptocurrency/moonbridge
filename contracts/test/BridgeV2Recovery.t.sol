// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console2} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

import {BridgeV2} from "../src/BridgeV2.sol";
import {LPToken} from "../src/LPToken.sol";
import {LPTokenFactory} from "../src/LPTokenFactory.sol";
import {BridgeTypes} from "../src/libraries/BridgeTypes.sol";
import {IBridgeV2} from "../src/interfaces/IBridgeV2.sol";

contract MockMoon is ERC20 {
    constructor() ERC20("Moon", "MOON") {
        _mint(msg.sender, 1_000_000_000 ether);
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @notice Covers the liquidity-recovery fix: orphaned bridge principal, the surplus rescue
///         (capped to protect LPs), pool reconciliation, and the corrected source/destination
///         pool accounting that prevents the surplus from forming in the first place.
contract BridgeV2RecoveryTest is Test {
    BridgeV2 public nova;
    BridgeV2 public one;
    MockMoon public moonNova;
    MockMoon public moonOne;

    bytes32 public constant MOON = keccak256("MOON");
    uint256 public constant NOVA = 42170;
    uint256 public constant ONE = 42161;
    uint256 public constant RELAYER_FEE = 0.0001 ether;

    address public owner = address(0xA11CE);
    address public dao = address(0xDA0);
    address public relayer = address(0xBEEF);
    address public lp = address(0x1111); // primary LP (the user)
    address public bridger = address(0x2222); // someone moving funds Nova -> One
    address public recipient = address(0x3333);
    address public treasury = address(0x4444); // rescue destination

    function setUp() public {
        moonNova = new MockMoon();
        moonOne = new MockMoon();
        nova = _deployBridge(address(moonNova));
        one = _deployBridge(address(moonOne));
    }

    function _deployBridge(address token) internal returns (BridgeV2 bridge) {
        LPToken lpImpl = new LPToken();
        LPTokenFactory factory = new LPTokenFactory(address(lpImpl));
        BridgeV2 impl = new BridgeV2();
        bytes memory initData = abi.encodeWithSelector(
            BridgeV2.initialize.selector,
            owner,
            dao,
            relayer,
            address(factory)
        );
        bridge = BridgeV2(payable(address(new ERC1967Proxy(address(impl), initData))));

        vm.startPrank(owner);
        bridge.addAsset(MOON, token, "MoonBridge LP - MOON", "mbMOON");
        bridge.configureRoute(MOON, NOVA, true);
        bridge.configureRoute(MOON, ONE, true);
        vm.stopPrank();
    }

    function _deposit(BridgeV2 bridge, MockMoon token, address who, uint256 amount) internal {
        token.mint(who, amount);
        vm.startPrank(who);
        token.approve(address(bridge), amount);
        bridge.deposit(MOON, amount);
        vm.stopPrank();
    }

    // ---- Path 1: surplus accounting + capped rescue ----

    function testSurplusReflectsOrphanedBalance() public {
        _deposit(nova, moonNova, lp, 1_000 ether);

        // Simulate principal that the pre-fix bridge logic stranded in the contract:
        // tokens present in balance but never credited to any pool.
        moonNova.mint(address(nova), 500 ether);

        assertEq(nova.getRescuableSurplus(MOON), 500 ether, "surplus = orphaned balance");
        assertEq(nova.getTotalPoolValue(MOON), 1_000 ether, "pool value excludes orphan");
        assertEq(nova.getAvailableLiquidity(MOON), 1_500 ether, "available = full balance");
    }

    function testAdminRescueSweepsOnlySurplus() public {
        _deposit(nova, moonNova, lp, 1_000 ether);
        moonNova.mint(address(nova), 500 ether);

        vm.prank(owner);
        nova.adminRescueSurplus(MOON, treasury, 500 ether);

        assertEq(moonNova.balanceOf(treasury), 500 ether, "treasury got orphaned funds");
        assertEq(nova.getRescuableSurplus(MOON), 0, "no surplus remains");

        // LP principal is untouched: the LP can still withdraw the full 1,000.
        uint256 lpBal = LPToken(nova.getAssetConfig(MOON).lpTokenAddress).balanceOf(lp);
        vm.prank(lp);
        nova.withdraw(MOON, lpBal);
        assertEq(moonNova.balanceOf(lp), 1_000 ether, "LP fully recovered principal");
    }

    function testRescueCannotExceedSurplus() public {
        _deposit(nova, moonNova, lp, 1_000 ether);
        moonNova.mint(address(nova), 500 ether);

        vm.prank(owner);
        vm.expectRevert(IBridgeV2.InvalidAmount.selector);
        nova.adminRescueSurplus(MOON, treasury, 500 ether + 1);
    }

    function testRescueCannotTouchPureLpPrincipal() public {
        _deposit(nova, moonNova, lp, 1_000 ether);
        // No orphaned balance: surplus is zero, so nothing is rescuable.
        assertEq(nova.getRescuableSurplus(MOON), 0);
        vm.prank(owner);
        vm.expectRevert(IBridgeV2.InvalidAmount.selector);
        nova.adminRescueSurplus(MOON, treasury, 1);
    }

    function testRescueOnlyOwner() public {
        _deposit(nova, moonNova, lp, 1_000 ether);
        moonNova.mint(address(nova), 500 ether);
        vm.prank(bridger);
        vm.expectRevert();
        nova.adminRescueSurplus(MOON, treasury, 100 ether);
    }

    function testQueuedWithdrawalsAreNotRescuable() public {
        // Build a pool that is owed more than it holds (the destination-side situation):
        // 1,000 held, but reconciled to be worth 1,500. A full withdrawal then pays 1,000
        // immediately and queues 500.
        _deposit(one, moonOne, lp, 1_000 ether);
        vm.prank(owner);
        one.reconcilePool(MOON, 1_000 ether, 500 ether);

        uint256 lpBal = LPToken(one.getAssetConfig(MOON).lpTokenAddress).balanceOf(lp);
        vm.prank(lp);
        one.withdraw(MOON, lpBal); // 1,000 paid, 500 queued, balance now 0

        // Funds arrive to satisfy the queue. They are reserved for the queued withdrawal,
        // so the surplus stays zero and they cannot be swept.
        moonOne.mint(address(one), 500 ether);
        assertEq(one.getRescuableSurplus(MOON), 0, "queued withdrawals are reserved");
    }

    // ---- Path 1: reconcile a pool whose accounting diverged ----

    function testReconcilePoolAdjustsValue() public {
        _deposit(one, moonOne, lp, 110_000 ether);

        // Owner corrects the pool to a drained reality (e.g. destination pool that the
        // pre-fix fulfill never debited).
        vm.expectEmit(true, false, false, true);
        emit IBridgeV2.PoolReconciled(MOON, 110_000 ether, 30_000 ether, 0, 0);
        vm.prank(owner);
        one.reconcilePool(MOON, 30_000 ether, 0);

        assertEq(one.getTotalPoolValue(MOON), 30_000 ether);
    }

    function testReconcileOnlyOwner() public {
        _deposit(one, moonOne, lp, 1_000 ether);
        vm.prank(bridger);
        vm.expectRevert();
        one.reconcilePool(MOON, 0, 0);
    }

    // ---- Path 2: corrected bridge accounting keeps balance == pool value ----

    function testSourcePoolCreditedNoOrphanForms() public {
        // A fresh Nova bridge with no LPs. A bridger sends funds Nova -> One.
        vm.chainId(NOVA);
        uint256 amount = 10_000 ether;
        moonNova.mint(bridger, amount);
        vm.deal(bridger, 1 ether);

        vm.startPrank(bridger);
        moonNova.approve(address(nova), amount);
        nova.requestBridge{value: RELAYER_FEE}(MOON, amount, ONE, recipient);
        vm.stopPrank();

        // Invariant: every token the contract holds is now backed by pool accounting.
        // No orphaned surplus is created by the bridge itself.
        uint256 bal = moonNova.balanceOf(address(nova));
        uint256 poolValue = nova.getTotalPoolValue(MOON);
        assertEq(bal, poolValue, "balance == pool value (no orphan)");
        assertEq(nova.getRescuableSurplus(MOON), 0, "no surplus from a correct bridge");

        // Sanity on the split: 1% fee total, 0.2% to DAO leaves the contract.
        assertEq(moonNova.balanceOf(dao), (amount * 20) / 10_000, "dao fee paid out");
        assertEq(bal, amount - (amount * 20) / 10_000, "balance = amount - dao fee");
    }

    function testDestinationPoolDebitedOnFulfill() public {
        // One seeded by the LP, then pays out a bridge. Pool value tracks the drain.
        _deposit(one, moonOne, lp, 110_000 ether);
        vm.chainId(ONE);

        uint256 fulfill = 40_000 ether;
        vm.prank(relayer);
        one.fulfillBridge(keccak256("b2"), MOON, recipient, fulfill, NOVA);

        assertEq(moonOne.balanceOf(address(one)), 110_000 ether - fulfill, "balance drained");
        assertEq(one.getTotalPoolValue(MOON), 110_000 ether - fulfill, "pool value tracks drain");
        assertEq(
            moonOne.balanceOf(address(one)),
            one.getTotalPoolValue(MOON),
            "invariant holds on destination"
        );
    }

    function testEndToEndConservationAcrossChains() public {
        // The LP seeds One. A bridger moves funds Nova -> One. Net MOON across both
        // contracts is conserved (minus the DAO fee), and after fixing accounting the
        // value sits where it should: drained on One, accrued on Nova.
        _deposit(one, moonOne, lp, 110_000 ether);

        vm.chainId(NOVA);
        uint256 amount = 50_000 ether;
        moonNova.mint(bridger, amount);
        vm.deal(bridger, 1 ether);
        vm.startPrank(bridger);
        moonNova.approve(address(nova), amount);
        nova.requestBridge{value: RELAYER_FEE}(MOON, amount, ONE, recipient);
        vm.stopPrank();

        uint256 bridgeAmount = amount - (amount * 100) / 10_000; // minus 1% total fee
        vm.chainId(ONE);
        vm.prank(relayer);
        one.fulfillBridge(keccak256("b3"), MOON, recipient, bridgeAmount, NOVA);

        // Both pools remain solvent: balance == pool value on each side.
        assertEq(moonNova.balanceOf(address(nova)), nova.getTotalPoolValue(MOON), "nova solvent");
        assertEq(moonOne.balanceOf(address(one)), one.getTotalPoolValue(MOON), "one solvent");
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

import {BridgeV2} from "../src/BridgeV2.sol";
import {LPToken} from "../src/LPToken.sol";
import {LPTokenFactory} from "../src/LPTokenFactory.sol";
import {BridgeTypes} from "../src/libraries/BridgeTypes.sol";
import {IBridgeV2} from "../src/interfaces/IBridgeV2.sol";

contract MockMoon is ERC20 {
    constructor() ERC20("Moon", "MOON") { _mint(msg.sender, 1_000_000_000 ether); }
    function mint(address to, uint256 amount) external { _mint(to, amount); }
}

/// @notice Covers LP migration: value-preserving mint pricing (1), the destination solvency cap (2),
///         relayer-gating and idempotency and the per-migration cap (3), and the 1% fee with the
///         zero-fee whitelist (4).
contract MigrationLPTest is Test {
    BridgeV2 nova;
    BridgeV2 one;
    MockMoon moonNova;
    MockMoon moonOne;

    bytes32 constant MOON = keccak256("MOON");
    uint256 constant NOVA = 42170;
    uint256 constant ONE = 42161;

    address owner = address(0xA11CE);
    address dao = address(0xDA0);
    address bridgeRelayer = address(0xBEEF);
    address migRelayer = address(0x9E1A);
    address lp = address(0x1111);
    address lp2 = address(0x2222);
    address user = address(0x3333);

    function setUp() public {
        moonNova = new MockMoon();
        moonOne = new MockMoon();
        nova = _deploy(address(moonNova));
        one = _deploy(address(moonOne));
        vm.startPrank(owner);
        nova.configureMigration(100, 0); // 1% fee, no per-tx cap
        one.configureMigration(100, 0);
        nova.setMigrationRelayer(migRelayer, true);
        one.setMigrationRelayer(migRelayer, true);
        vm.stopPrank();
    }

    function _deploy(address token) internal returns (BridgeV2 b) {
        LPToken impl = new LPToken();
        LPTokenFactory factory = new LPTokenFactory(address(impl));
        BridgeV2 bImpl = new BridgeV2();
        bytes memory init = abi.encodeWithSelector(
            BridgeV2.initialize.selector, owner, dao, bridgeRelayer, address(factory)
        );
        b = BridgeV2(payable(address(new ERC1967Proxy(address(bImpl), init))));
        vm.startPrank(owner);
        b.addAsset(MOON, token, "MoonBridge LP - MOON", "mbMOON");
        b.configureRoute(MOON, NOVA, true);
        b.configureRoute(MOON, ONE, true);
        vm.stopPrank();
    }

    function _deposit(BridgeV2 b, MockMoon t, address who, uint256 amt) internal {
        t.mint(who, amt);
        vm.startPrank(who);
        t.approve(address(b), amt);
        b.deposit(MOON, amt);
        vm.stopPrank();
    }

    function _lp(BridgeV2 b) internal view returns (LPToken) {
        return LPToken(b.getAssetConfig(MOON).lpTokenAddress);
    }

    // ---- (1) value-preserving pricing across different per-share prices, plus (4) the fee ----

    function testMigratePreservesValueNotTokenCount() public {
        // One: user holds 1,000 LP at pps 1.0 (value 1,000).
        _deposit(one, moonOne, user, 1_000 ether);

        // Nova: an existing LP plus orphaned MOON, reconciled to pps 2.0 with surplus to spare.
        _deposit(nova, moonNova, lp2, 500 ether);   // supply 500, value 500, balance 500
        moonNova.mint(address(nova), 1_500 ether);  // balance 2,000
        vm.prank(owner);
        nova.reconcilePool(MOON, 1_000 ether, 0);   // pps 2.0, surplus = 2,000 - 1,000 = 1,000

        // Quote: 1,000 value, 1% fee = 10, net = 990.
        (uint256 value, uint256 fee, uint256 net) = one.quoteMigration(MOON, 1_000 ether, user);
        assertEq(value, 1_000 ether);
        assertEq(fee, 10 ether);
        assertEq(net, 990 ether);

        // Burn on One.
        vm.chainId(ONE);
        vm.prank(user);
        one.requestLPMigration(MOON, 1_000 ether, NOVA);
        assertEq(_lp(one).balanceOf(user), 0, "burned on source");

        // Mint on Nova for net value (relayer carries it).
        vm.chainId(NOVA);
        vm.prank(migRelayer);
        nova.fulfillLPMigration(keccak256("m1"), MOON, user, net, ONE);

        // The user receives LP whose redeemable value equals net (990), not the token count (1,000).
        uint256 minted = _lp(nova).balanceOf(user);
        assertEq(minted, 495 ether, "token count differs because Nova pps is 2.0");
        assertEq(nova.getLPTokenValue(MOON, minted), 990 ether, "value preserved");
    }

    function testFeeWhitelistMigratesFull() public {
        _deposit(one, moonOne, user, 1_000 ether);
        vm.prank(owner);
        one.setMigrationFeeWhitelist(user, true);
        (uint256 value, uint256 fee, uint256 net) = one.quoteMigration(MOON, 1_000 ether, user);
        assertEq(value, 1_000 ether);
        assertEq(fee, 0);
        assertEq(net, 1_000 ether);
    }

    // ---- (2) destination solvency cap ----

    function testCannotMigrateBeyondDestinationSurplus() public {
        // Nova surplus is only 100.
        _deposit(nova, moonNova, lp2, 500 ether);
        moonNova.mint(address(nova), 100 ether); // surplus 100
        vm.chainId(NOVA);
        vm.prank(migRelayer);
        vm.expectRevert(IBridgeV2.InsufficientLiquidity.selector);
        nova.fulfillLPMigration(keccak256("m2"), MOON, user, 101 ether, ONE);
    }

    function testMigrateUpToSurplusSucceeds() public {
        _deposit(nova, moonNova, lp2, 500 ether);
        moonNova.mint(address(nova), 100 ether);
        vm.chainId(NOVA);
        vm.prank(migRelayer);
        nova.fulfillLPMigration(keccak256("m3"), MOON, user, 100 ether, ONE);
        assertGt(_lp(nova).balanceOf(user), 0);
    }

    // ---- (3) relayer-gating, idempotency, per-migration cap ----

    function testOnlyMigrationRelayerCanFulfill() public {
        _deposit(nova, moonNova, lp2, 500 ether);
        moonNova.mint(address(nova), 500 ether);
        vm.chainId(NOVA);
        vm.prank(user);
        vm.expectRevert(IBridgeV2.OnlyRelayer.selector);
        nova.fulfillLPMigration(keccak256("m4"), MOON, user, 100 ether, ONE);
    }

    function testIdempotentFulfill() public {
        _deposit(nova, moonNova, lp2, 500 ether);
        moonNova.mint(address(nova), 500 ether);
        vm.chainId(NOVA);
        vm.startPrank(migRelayer);
        nova.fulfillLPMigration(keccak256("m5"), MOON, user, 100 ether, ONE);
        vm.expectRevert(IBridgeV2.BridgeAlreadyProcessed.selector);
        nova.fulfillLPMigration(keccak256("m5"), MOON, user, 100 ether, ONE);
        vm.stopPrank();
    }

    function testPerMigrationCap() public {
        _deposit(nova, moonNova, lp2, 500 ether);
        moonNova.mint(address(nova), 1_000 ether);
        vm.prank(owner);
        nova.configureMigration(100, 50 ether); // cap each migration at 50
        vm.chainId(NOVA);
        vm.prank(migRelayer);
        vm.expectRevert(IBridgeV2.InvalidAmount.selector);
        nova.fulfillLPMigration(keccak256("m6"), MOON, user, 51 ether, ONE);
    }

    function testTwoRelayersBothWork() public {
        address migRelayer2 = address(0x9E2B);
        vm.prank(owner);
        nova.setMigrationRelayer(migRelayer2, true);
        _deposit(nova, moonNova, lp2, 500 ether);
        moonNova.mint(address(nova), 500 ether);
        vm.chainId(NOVA);
        vm.prank(migRelayer2);
        nova.fulfillLPMigration(keccak256("m7"), MOON, user, 100 ether, ONE);
        assertGt(_lp(nova).balanceOf(user), 0);
    }
}

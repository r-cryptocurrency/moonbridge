// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {MerkleDistributor} from "../src/MerkleDistributor.sol";

contract MockMoon is ERC20 {
    constructor() ERC20("Moon", "MOON") { _mint(msg.sender, 1_000_000 ether); }
}

contract MerkleDistributorTest is Test {
    MockMoon moon;
    MerkleDistributor dist;

    // Two-leaf tree built in-test with the same scheme as MerkleDistributor / build-merkle.mjs.
    address alice = address(0xA11CE);
    address bob = address(0xB0B);
    uint256 amtA = 110_000 ether;
    uint256 amtB = 25_000 ether;

    bytes32 leafA;
    bytes32 leafB;
    bytes32 root;

    function _hashPair(bytes32 a, bytes32 b) internal pure returns (bytes32) {
        return a < b ? keccak256(abi.encodePacked(a, b)) : keccak256(abi.encodePacked(b, a));
    }

    function setUp() public {
        moon = new MockMoon();
        leafA = keccak256(abi.encodePacked(uint256(0), alice, amtA));
        leafB = keccak256(abi.encodePacked(uint256(1), bob, amtB));
        root = _hashPair(leafA, leafB);

        dist = new MerkleDistributor(address(moon), root, owner);
        moon.transfer(address(dist), amtA + amtB); // fund once, contract-to-contract
    }

    address owner = address(0x60);

    function _proofFor(bytes32 sibling) internal pure returns (bytes32[] memory p) {
        p = new bytes32[](1);
        p[0] = sibling;
    }

    function testClaimPaysAccountNotCaller() public {
        // A random caller submits Alice's proof; funds must go to Alice.
        vm.prank(address(0xDEAD));
        dist.claim(0, alice, amtA, _proofFor(leafB));
        assertEq(moon.balanceOf(alice), amtA);
        assertEq(moon.balanceOf(address(0xDEAD)), 0);
        assertTrue(dist.isClaimed(0));
    }

    function testBothCanClaim() public {
        dist.claim(0, alice, amtA, _proofFor(leafB));
        dist.claim(1, bob, amtB, _proofFor(leafA));
        assertEq(moon.balanceOf(alice), amtA);
        assertEq(moon.balanceOf(bob), amtB);
        assertEq(moon.balanceOf(address(dist)), 0);
    }

    function testDoubleClaimReverts() public {
        dist.claim(0, alice, amtA, _proofFor(leafB));
        vm.expectRevert(MerkleDistributor.AlreadyClaimed.selector);
        dist.claim(0, alice, amtA, _proofFor(leafB));
    }

    function testWrongAmountReverts() public {
        vm.expectRevert(MerkleDistributor.InvalidProof.selector);
        dist.claim(0, alice, amtA + 1, _proofFor(leafB));
    }

    function testWrongAccountReverts() public {
        vm.expectRevert(MerkleDistributor.InvalidProof.selector);
        dist.claim(0, address(0xBAD), amtA, _proofFor(leafB));
    }

    function testOwnerCanRecover() public {
        uint256 bal = moon.balanceOf(address(dist));
        vm.prank(owner);
        dist.recover(owner, bal);
        assertEq(moon.balanceOf(owner), bal);
        assertEq(moon.balanceOf(address(dist)), 0);
    }

    function testNonOwnerCannotRecover() public {
        vm.prank(address(0xDEAD));
        vm.expectRevert();
        dist.recover(address(0xDEAD), 1);
    }
}

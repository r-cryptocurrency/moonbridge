// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {MoonBridge} from "../src/Bridge.sol";

/**
 * @title DeployBridge
 * @notice Deployment script for MoonBridge contracts
 * 
 * Environment variables required:
 * - PRIVATE_KEY: Deployer private key
 * - MOON_TOKEN: MOON token address on target chain
 * - MULTISIG: Multisig address for admin operations
 * - RELAYER_FEE_WEI: Initial relayer fee in wei
 * - RELAYER_1: First relayer address
 * - RELAYER_2: Second relayer address
 * 
 * Usage:
 * # Deploy to Arbitrum Nova:
 * forge script script/DeployBridge.s.sol:DeployBridge \
 *   --rpc-url $ARBITRUM_NOVA_RPC_URL \
 *   --broadcast \
 *   --verify
 * 
 * # Deploy to Arbitrum One:
 * forge script script/DeployBridge.s.sol:DeployBridge \
 *   --rpc-url $ARBITRUM_ONE_RPC_URL \
 *   --broadcast \
 *   --verify
 */
contract DeployBridge is Script {
    function run() external {
        // Load environment variables
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address moonToken = vm.envAddress("MOON_TOKEN");
        address multisig = vm.envAddress("MULTISIG");
        uint256 relayerFeeWei = vm.envUint("RELAYER_FEE_WEI");
        address relayer1 = vm.envAddress("RELAYER_1");
        address relayer2 = vm.envAddress("RELAYER_2");

        // Prepare relayers array
        address[] memory relayers = new address[](2);
        relayers[0] = relayer1;
        relayers[1] = relayer2;

        console2.log("Deploying MoonBridge...");
        console2.log("Chain ID:", block.chainid);
        console2.log("MOON Token:", moonToken);
        console2.log("Multisig:", multisig);
        console2.log("Relayer Fee (wei):", relayerFeeWei);
        console2.log("Relayer 1:", relayer1);
        console2.log("Relayer 2:", relayer2);

        vm.startBroadcast(deployerPrivateKey);

        MoonBridge bridge = new MoonBridge(
            moonToken,
            multisig,
            relayerFeeWei,
            relayers
        );

        vm.stopBroadcast();

        console2.log("=================================");
        console2.log("MoonBridge deployed to:", address(bridge));
        console2.log("=================================");
        
        // Verification info
        console2.log("\nVerification command:");
        console2.log("forge verify-contract", address(bridge), "src/Bridge.sol:MoonBridge");
    }
}

/**
 * @title SeedLiquidity
 * @notice Script to seed initial MOON liquidity to deployed bridges
 * 
 * Environment variables:
 * - PRIVATE_KEY: Liquidity provider private key
 * - BRIDGE_ADDRESS: Deployed bridge address
 * - MOON_TOKEN: MOON token address
 * - SEED_AMOUNT: Amount of MOON to seed (in wei, 18 decimals)
 */
contract SeedLiquidity is Script {
    function run() external {
        uint256 privateKey = vm.envUint("PRIVATE_KEY");
        address bridge = vm.envAddress("BRIDGE_ADDRESS");
        address moonToken = vm.envAddress("MOON_TOKEN");
        uint256 seedAmount = vm.envUint("SEED_AMOUNT");

        console2.log("Seeding liquidity to bridge:", bridge);
        console2.log("Amount:", seedAmount);

        vm.startBroadcast(privateKey);

        // Transfer MOON to bridge
        (bool success,) = moonToken.call(
            abi.encodeWithSignature("transfer(address,uint256)", bridge, seedAmount)
        );
        require(success, "Transfer failed");

        vm.stopBroadcast();

        console2.log("Liquidity seeded successfully");
    }
}

/**
 * @title VerifyDeployment
 * @notice Script to verify deployed bridge configuration
 */
contract VerifyDeployment is Script {
    function run() external view {
        address bridgeAddress = vm.envAddress("BRIDGE_ADDRESS");
        MoonBridge bridge = MoonBridge(payable(bridgeAddress));

        console2.log("=== Bridge Configuration ===");
        console2.log("Address:", bridgeAddress);
        console2.log("Chain ID:", bridge.chainId());
        console2.log("MOON Token:", address(bridge.moonToken()));
        console2.log("Multisig:", bridge.multisig());
        console2.log("Relayer Fee (wei):", bridge.relayerFeeWei());
        console2.log("Paused:", bridge.paused());
        console2.log("Available Liquidity:", bridge.getAvailableLiquidity());
        
        // Check relayers
        address relayer1 = vm.envAddress("RELAYER_1");
        address relayer2 = vm.envAddress("RELAYER_2");
        console2.log("Relayer 1 authorized:", bridge.isRelayer(relayer1));
        console2.log("Relayer 2 authorized:", bridge.isRelayer(relayer2));
    }
}

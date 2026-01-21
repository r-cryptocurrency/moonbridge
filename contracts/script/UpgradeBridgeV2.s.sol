// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {BridgeV2} from "../src/BridgeV2.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/**
 * @title UpgradeBridgeV2
 * @notice Script to upgrade BridgeV2 implementation with partial fill support
 * @dev This upgrades the UUPS proxy to point to a new implementation
 */
contract UpgradeBridgeV2Script is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address proxyAddress = vm.envAddress("PROXY_ADDRESS");

        console2.log("========================================");
        console2.log("Upgrading BridgeV2 Proxy");
        console2.log("========================================");
        console2.log("Chain ID:", block.chainid);
        console2.log("Proxy Address:", proxyAddress);
        console2.log("Deployer:", vm.addr(deployerPrivateKey));

        vm.startBroadcast(deployerPrivateKey);

        // Deploy new implementation
        console2.log("\nDeploying new BridgeV2 implementation...");
        BridgeV2 newImplementation = new BridgeV2();
        console2.log("New Implementation:", address(newImplementation));

        // Upgrade the proxy via UUPS upgradeToAndCall
        console2.log("\nUpgrading proxy to new implementation...");
        BridgeV2 proxy = BridgeV2(payable(proxyAddress));
        proxy.upgradeToAndCall(address(newImplementation), "");

        console2.log("\n========================================");
        console2.log("Upgrade Successful!");
        console2.log("========================================");
        console2.log("Proxy:", proxyAddress);
        console2.log("New Implementation:", address(newImplementation));

        vm.stopBroadcast();
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {BridgeV2} from "../src/BridgeV2.sol";

/**
 * @title UpgradeBridgeV2
 * @notice Script to upgrade BridgeV2 implementation with fee whitelist support
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

/**
 * @title SetFeeWhitelist
 * @notice Script to whitelist addresses for zero-fee bridging
 * @dev Run this after upgrading to the new implementation with feeWhitelist support
 */
contract SetFeeWhitelistScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address proxyAddress = vm.envAddress("PROXY_ADDRESS");

        console2.log("========================================");
        console2.log("Setting Fee Whitelist");
        console2.log("========================================");
        console2.log("Chain ID:", block.chainid);
        console2.log("Proxy Address:", proxyAddress);

        BridgeV2 bridge = BridgeV2(payable(proxyAddress));

        // Addresses to whitelist
        address[5] memory whitelist = [
            0xb7F4b148A08ff36D66AC6BE6D7Da0D4CF24772A0,
            0xd71f6B376ECC6aeebd5ac11388C5893768cCD979,
            0xF93c0950595d4D12ad71A405de287D7AF689c291,
            0x41a4922487216655A1B1d10F70EE6B0bf7e75219,
            0x536aFD811809E2Ea5d8A66FF0c42B7a5D9de2093
        ];

        vm.startBroadcast(deployerPrivateKey);

        for (uint256 i = 0; i < whitelist.length; i++) {
            console2.log("Whitelisting:", whitelist[i]);
            bridge.setFeeWhitelist(whitelist[i], true);
        }

        vm.stopBroadcast();

        console2.log("\n========================================");
        console2.log("Fee Whitelist Set!");
        console2.log("========================================");

        // Verify
        for (uint256 i = 0; i < whitelist.length; i++) {
            bool isWhitelisted = bridge.feeWhitelist(whitelist[i]);
            console2.log(whitelist[i], "whitelisted:", isWhitelisted);
        }
    }
}

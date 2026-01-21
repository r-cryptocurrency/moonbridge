// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {BridgeV2} from "../src/BridgeV2.sol";
import {LPToken} from "../src/LPToken.sol";
import {LPTokenFactory} from "../src/LPTokenFactory.sol";
import {BridgeTypes} from "../src/libraries/BridgeTypes.sol";

/**
 * @title DeployBridgeV2
 * @notice Deployment script for MoonBridge V2 contracts
 *
 * Environment variables required:
 * - PRIVATE_KEY: Deployer private key
 * - OWNER: Owner address for bridge admin operations
 * - DAO_WALLET: DAO wallet address for fee collection
 * - RELAYER: Relayer address
 *
 * Usage:
 * # Deploy to Arbitrum Nova:
 * forge script script/DeployBridgeV2.s.sol:DeployBridgeV2 \
 *   --rpc-url $ARBITRUM_NOVA_RPC_URL \
 *   --broadcast \
 *   --verify \
 *   --etherscan-api-key $ARBISCAN_API_KEY
 *
 * # Deploy to Arbitrum One:
 * forge script script/DeployBridgeV2.s.sol:DeployBridgeV2 \
 *   --rpc-url $ARBITRUM_ONE_RPC_URL \
 *   --broadcast \
 *   --verify \
 *   --etherscan-api-key $ARBISCAN_API_KEY
 *
 * # Deploy to Ethereum:
 * forge script script/DeployBridgeV2.s.sol:DeployBridgeV2 \
 *   --rpc-url $ETHEREUM_RPC_URL \
 *   --broadcast \
 *   --verify \
 *   --etherscan-api-key $ETHERSCAN_API_KEY
 *
 * # Deploy to Gnosis:
 * forge script script/DeployBridgeV2.s.sol:DeployBridgeV2 \
 *   --rpc-url $GNOSIS_RPC_URL \
 *   --broadcast \
 *   --verify \
 *   --etherscan-api-key $GNOSISSCAN_API_KEY
 */
contract DeployBridgeV2 is Script {
    function run() external {
        // Load environment variables
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address owner = vm.envAddress("OWNER");
        address daoWallet = vm.envAddress("DAO_WALLET");
        address relayer = vm.envAddress("RELAYER");

        console2.log("Deploying MoonBridge V2...");
        console2.log("Chain ID:", block.chainid);
        console2.log("Owner:", owner);
        console2.log("DAO Wallet:", daoWallet);
        console2.log("Relayer:", relayer);

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy LP Token implementation
        LPToken lpTokenImpl = new LPToken();
        console2.log("LP Token Implementation deployed:", address(lpTokenImpl));

        // 2. Deploy LP Token Factory
        LPTokenFactory factory = new LPTokenFactory(address(lpTokenImpl));
        console2.log("LP Token Factory deployed:", address(factory));

        // 3. Deploy BridgeV2 implementation
        BridgeV2 bridgeImpl = new BridgeV2();
        console2.log("BridgeV2 Implementation deployed:", address(bridgeImpl));

        // 4. Prepare initialization data
        bytes memory initData = abi.encodeWithSelector(
            BridgeV2.initialize.selector,
            owner,
            daoWallet,
            relayer,
            address(factory)
        );

        // 5. Deploy proxy
        ERC1967Proxy proxy = new ERC1967Proxy(address(bridgeImpl), initData);
        console2.log("BridgeV2 Proxy deployed:", address(proxy));

        vm.stopBroadcast();

        console2.log("\n=================================");
        console2.log("Deployment Summary");
        console2.log("=================================");
        console2.log("LP Token Implementation:", address(lpTokenImpl));
        console2.log("LP Token Factory:", address(factory));
        console2.log("BridgeV2 Implementation:", address(bridgeImpl));
        console2.log("BridgeV2 Proxy (Use this):", address(proxy));
        console2.log("=================================");

        console2.log("\nVerification commands:");
        console2.log("forge verify-contract %s src/LPToken.sol:LPToken", address(lpTokenImpl));
        console2.log("forge verify-contract %s src/LPTokenFactory.sol:LPTokenFactory", address(factory));
        console2.log("forge verify-contract %s src/BridgeV2.sol:BridgeV2", address(bridgeImpl));
        console2.log("forge verify-contract %s lib/openzeppelin-contracts/contracts/proxy/ERC1967/ERC1967Proxy.sol:ERC1967Proxy", address(proxy));
    }
}

/**
 * @title ConfigureAssets
 * @notice Script to configure assets on deployed BridgeV2
 *
 * Configures MOON, ETH, USDC, DONUT based on chain
 */
contract ConfigureAssets is Script {
    function run() external {
        uint256 privateKey = vm.envUint("PRIVATE_KEY");
        address proxyAddress = vm.envAddress("BRIDGE_PROXY");

        console2.log("Configuring assets for chain:", block.chainid);

        vm.startBroadcast(privateKey);

        BridgeV2 bridge = BridgeV2(payable(proxyAddress));

        // Asset addresses per chain
        if (block.chainid == 42170) {
            // Arbitrum Nova
            console2.log("Configuring Arbitrum Nova assets...");

            // MOON
            bridge.addAsset(
                BridgeTypes.ASSET_MOON,
                0x0057Ac2d777797d31CD3f8f13bF5e927571D6Ad0,
                "MoonBridge LP - MOON",
                "mbMOON"
            );

            // ETH (native)
            bridge.addAsset(
                BridgeTypes.ASSET_ETH,
                BridgeTypes.NATIVE_ETH,
                "MoonBridge LP - ETH",
                "mbETH"
            );

            // USDC
            bridge.addAsset(
                BridgeTypes.ASSET_USDC,
                0x750ba8b76187092B0D1E87E28daaf484d1b5273b,
                "MoonBridge LP - USDC",
                "mbUSDC"
            );

        } else if (block.chainid == 42161) {
            // Arbitrum One
            console2.log("Configuring Arbitrum One assets...");

            // MOON
            bridge.addAsset(
                BridgeTypes.ASSET_MOON,
                0x24404DC041d74cd03cFE28855F555559390C931b,
                "MoonBridge LP - MOON",
                "mbMOON"
            );

            // ETH (native)
            bridge.addAsset(
                BridgeTypes.ASSET_ETH,
                BridgeTypes.NATIVE_ETH,
                "MoonBridge LP - ETH",
                "mbETH"
            );

            // USDC
            bridge.addAsset(
                BridgeTypes.ASSET_USDC,
                0xaf88d065e77c8cC2239327C5EDb3A432268e5831,
                "MoonBridge LP - USDC",
                "mbUSDC"
            );

            // DONUT
            bridge.addAsset(
                BridgeTypes.ASSET_DONUT,
                0xF42e2B8bc2aF8B110b65be98dB1321B1ab8D44f5,
                "MoonBridge LP - DONUT",
                "mbDONUT"
            );

        } else if (block.chainid == 1) {
            // Ethereum
            console2.log("Configuring Ethereum assets...");

            // MOON
            bridge.addAsset(
                BridgeTypes.ASSET_MOON,
                0xb2490e357980cE57bF5745e181e537a64Eb367B1,
                "MoonBridge LP - MOON",
                "mbMOON"
            );

            // ETH (native)
            bridge.addAsset(
                BridgeTypes.ASSET_ETH,
                BridgeTypes.NATIVE_ETH,
                "MoonBridge LP - ETH",
                "mbETH"
            );

            // USDC
            bridge.addAsset(
                BridgeTypes.ASSET_USDC,
                0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48,
                "MoonBridge LP - USDC",
                "mbUSDC"
            );

            // DONUT
            bridge.addAsset(
                BridgeTypes.ASSET_DONUT,
                0xC0F9bD5Fa5698B6505F643900FFA515Ea5dF54A9,
                "MoonBridge LP - DONUT",
                "mbDONUT"
            );

        } else if (block.chainid == 100) {
            // Gnosis
            console2.log("Configuring Gnosis assets...");

            // ETH (WETH on Gnosis)
            bridge.addAsset(
                BridgeTypes.ASSET_ETH,
                0x6A023CCd1ff6F2045C3309768eAd9E68F978f6e1,
                "MoonBridge LP - WETH",
                "mbWETH"
            );

            // USDC
            bridge.addAsset(
                BridgeTypes.ASSET_USDC,
                0xDDAfbb505ad214D7b80b1f830fcCc89B60fb7A83,
                "MoonBridge LP - USDC",
                "mbUSDC"
            );

            // DONUT
            bridge.addAsset(
                BridgeTypes.ASSET_DONUT,
                0x524B969793a64a602342d89BC2789D43a016B13A,
                "MoonBridge LP - DONUT",
                "mbDONUT"
            );
        }

        vm.stopBroadcast();

        console2.log("Assets configured successfully");
    }
}

/**
 * @title ConfigureRoutes
 * @notice Script to enable routes between chains
 */
contract ConfigureRoutes is Script {
    function run() external {
        uint256 privateKey = vm.envUint("PRIVATE_KEY");
        address proxyAddress = vm.envAddress("BRIDGE_PROXY");

        console2.log("Configuring routes for chain:", block.chainid);

        vm.startBroadcast(privateKey);

        BridgeV2 bridge = BridgeV2(payable(proxyAddress));

        // Enable all chains
        bridge.configureChain(42170, true, 0, 0.0001 ether); // Nova
        bridge.configureChain(42161, true, 0, 0.0001 ether); // Arbitrum One
        bridge.configureChain(1, true, 0, 0.001 ether); // Ethereum
        bridge.configureChain(100, true, 0, 0.3 ether); // Gnosis

        // Configure routes based on current chain
        if (block.chainid == 42170) {
            // Nova routes
            bridge.configureRoute(BridgeTypes.ASSET_MOON, 42161, true); // MOON to Arb One
            bridge.configureRoute(BridgeTypes.ASSET_MOON, 1, true); // MOON to Ethereum
            bridge.configureRoute(BridgeTypes.ASSET_ETH, 42161, true); // ETH to all
            bridge.configureRoute(BridgeTypes.ASSET_ETH, 1, true);
            bridge.configureRoute(BridgeTypes.ASSET_ETH, 100, true);
            bridge.configureRoute(BridgeTypes.ASSET_USDC, 42161, true); // USDC to all
            bridge.configureRoute(BridgeTypes.ASSET_USDC, 1, true);
            bridge.configureRoute(BridgeTypes.ASSET_USDC, 100, true);

        } else if (block.chainid == 42161) {
            // Arbitrum One routes
            bridge.configureRoute(BridgeTypes.ASSET_MOON, 42170, true); // MOON to Nova, Eth
            bridge.configureRoute(BridgeTypes.ASSET_MOON, 1, true);
            bridge.configureRoute(BridgeTypes.ASSET_ETH, 42170, true); // ETH to all
            bridge.configureRoute(BridgeTypes.ASSET_ETH, 1, true);
            bridge.configureRoute(BridgeTypes.ASSET_ETH, 100, true);
            bridge.configureRoute(BridgeTypes.ASSET_USDC, 42170, true); // USDC to all
            bridge.configureRoute(BridgeTypes.ASSET_USDC, 1, true);
            bridge.configureRoute(BridgeTypes.ASSET_USDC, 100, true);
            bridge.configureRoute(BridgeTypes.ASSET_DONUT, 1, true); // DONUT to Eth, Gnosis
            bridge.configureRoute(BridgeTypes.ASSET_DONUT, 100, true);

        } else if (block.chainid == 1) {
            // Ethereum routes
            bridge.configureRoute(BridgeTypes.ASSET_MOON, 42170, true); // MOON to Nova, Arb One
            bridge.configureRoute(BridgeTypes.ASSET_MOON, 42161, true);
            bridge.configureRoute(BridgeTypes.ASSET_ETH, 42170, true); // ETH to all
            bridge.configureRoute(BridgeTypes.ASSET_ETH, 42161, true);
            bridge.configureRoute(BridgeTypes.ASSET_ETH, 100, true);
            bridge.configureRoute(BridgeTypes.ASSET_USDC, 42170, true); // USDC to all
            bridge.configureRoute(BridgeTypes.ASSET_USDC, 42161, true);
            bridge.configureRoute(BridgeTypes.ASSET_USDC, 100, true);
            bridge.configureRoute(BridgeTypes.ASSET_DONUT, 42161, true); // DONUT to Arb One, Gnosis
            bridge.configureRoute(BridgeTypes.ASSET_DONUT, 100, true);

        } else if (block.chainid == 100) {
            // Gnosis routes
            bridge.configureRoute(BridgeTypes.ASSET_ETH, 42170, true); // ETH to all
            bridge.configureRoute(BridgeTypes.ASSET_ETH, 42161, true);
            bridge.configureRoute(BridgeTypes.ASSET_ETH, 1, true);
            bridge.configureRoute(BridgeTypes.ASSET_USDC, 42170, true); // USDC to all
            bridge.configureRoute(BridgeTypes.ASSET_USDC, 42161, true);
            bridge.configureRoute(BridgeTypes.ASSET_USDC, 1, true);
            bridge.configureRoute(BridgeTypes.ASSET_DONUT, 42161, true); // DONUT to Arb One, Eth
            bridge.configureRoute(BridgeTypes.ASSET_DONUT, 1, true);
        }

        vm.stopBroadcast();

        console2.log("Routes configured successfully");
    }
}

/**
 * @title SeedLiquidityV2
 * @notice Script to seed initial liquidity as LP
 */
contract SeedLiquidityV2 is Script {
    function run() external {
        uint256 privateKey = vm.envUint("PRIVATE_KEY");
        address proxyAddress = vm.envAddress("BRIDGE_PROXY");
        bytes32 assetId = vm.envBytes32("ASSET_ID");
        uint256 amount = vm.envUint("AMOUNT");

        console2.log("Seeding liquidity to BridgeV2:", proxyAddress);
        console2.log("Asset ID:", uint256(assetId));
        console2.log("Amount:", amount);

        vm.startBroadcast(privateKey);

        BridgeV2 bridge = BridgeV2(payable(proxyAddress));

        // Get asset config to determine if native or ERC20
        BridgeTypes.AssetConfig memory config = bridge.getAssetConfig(assetId);

        if (config.tokenAddress == BridgeTypes.NATIVE_ETH) {
            // Deposit native ETH
            bridge.deposit{value: amount}(assetId, amount);
        } else {
            // Approve and deposit ERC20
            (bool success, ) = config.tokenAddress.call(
                abi.encodeWithSignature("approve(address,uint256)", proxyAddress, amount)
            );
            require(success, "Approve failed");

            bridge.deposit(assetId, amount);
        }

        vm.stopBroadcast();

        console2.log("Liquidity seeded successfully");
    }
}

/**
 * @title VerifyDeploymentV2
 * @notice Script to verify deployed BridgeV2 configuration
 */
contract VerifyDeploymentV2 is Script {
    function run() external view {
        address proxyAddress = vm.envAddress("BRIDGE_PROXY");
        BridgeV2 bridge = BridgeV2(payable(proxyAddress));

        console2.log("=== BridgeV2 Configuration ===");
        console2.log("Proxy Address:", proxyAddress);
        console2.log("Chain ID:", block.chainid);
        console2.log("Owner:", bridge.owner());
        console2.log("DAO Wallet:", bridge.daoWallet());
        console2.log("Relayer:", bridge.relayer());
        console2.log("LP Token Factory:", address(bridge.lpTokenFactory()));
        console2.log("Paused:", bridge.paused());
        console2.log("Relayer Fee Balance:", bridge.relayerFeeBalance());

        // Check MOON liquidity (if available)
        try bridge.getAvailableLiquidity(BridgeTypes.ASSET_MOON) returns (uint256 liq) {
            console2.log("MOON Available Liquidity:", liq);
        } catch {}

        // Check ETH liquidity
        try bridge.getAvailableLiquidity(BridgeTypes.ASSET_ETH) returns (uint256 liq) {
            console2.log("ETH Available Liquidity:", liq);
        } catch {}

        // Check chain config for current chain
        BridgeTypes.ChainConfig memory chainConfig = bridge.getChainConfig(block.chainid);
        console2.log("Chain Enabled:", chainConfig.enabled);
        console2.log("Relayer Fee:", chainConfig.relayerFee);
    }
}

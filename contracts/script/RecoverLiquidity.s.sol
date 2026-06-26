// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {BridgeV2} from "../src/BridgeV2.sol";
import {BridgeTypes} from "../src/libraries/BridgeTypes.sol";

/**
 * @title InspectPools
 * @notice READ-ONLY. Prints the live pool accounting for a BridgeV2 proxy so the rescue
 *         amount can be sized exactly. Checks both candidate MOON assetId encodings
 *         (ASCII "MOON" used by the frontend, and keccak256("MOON") used by the deploy
 *         script) and reports which one the asset is actually registered under.
 *
 * Usage (no broadcast, no key needed):
 *   BRIDGE_PROXY=0x... forge script script/RecoverLiquidity.s.sol:InspectPools \
 *     --rpc-url $RPC_URL
 */
contract InspectPools is Script {
    function run() external view {
        address proxyAddress = vm.envAddress("BRIDGE_PROXY");
        BridgeV2 bridge = BridgeV2(payable(proxyAddress));

        console2.log("=== BridgeV2 Pool Inspection ===");
        console2.log("Chain ID:", block.chainid);
        console2.log("Proxy:", proxyAddress);
        console2.log("Owner:", bridge.owner());
        console2.log("Paused:", bridge.paused());
        console2.log("");

        bytes32 asciiMoon = bytes32(bytes("MOON")); // 0x4d4f4f4e00...00 (frontend encoding)
        bytes32 keccakMoon = BridgeTypes.ASSET_MOON; // keccak256("MOON") (deploy-script encoding)

        _report(bridge, "MOON (ASCII / frontend)", asciiMoon);
        _report(bridge, "MOON (keccak256)", keccakMoon);
    }

    function _report(BridgeV2 bridge, string memory label, bytes32 assetId) internal view {
        BridgeTypes.AssetConfig memory cfg = bridge.getAssetConfig(assetId);
        console2.log("--- assetId:", label);
        console2.logBytes32(assetId);
        if (cfg.lpTokenAddress == address(0)) {
            console2.log("  NOT REGISTERED under this assetId");
            console2.log("");
            return;
        }
        console2.log("  token:", cfg.tokenAddress);
        console2.log("  lpToken:", cfg.lpTokenAddress);
        console2.log("  raw token balance:", IERC20(cfg.tokenAddress).balanceOf(address(bridge)));
        console2.log("  totalPoolValue (LP-backed):", bridge.getTotalPoolValue(assetId));
        console2.log("  availableLiquidity:", bridge.getAvailableLiquidity(assetId));
        console2.log("  >>> rescuableSurplus:", bridge.getRescuableSurplus(assetId));
        console2.log("");
    }
}

/**
 * @title RescueSurplus
 * @notice Sweeps orphaned surplus (bridge principal no LP token backs) to a recipient.
 *         Reverts unless AMOUNT <= getRescuableSurplus, so LP principal, accrued fees,
 *         queued withdrawals, and relayer fees are never at risk. Owner key only.
 *
 * Usage:
 *   BRIDGE_PROXY=0x... ASSET_ID=0x4d4f4f4e00..00 TO=0x... AMOUNT=<wei> \
 *   PRIVATE_KEY=0x... \
 *   forge script script/RecoverLiquidity.s.sol:RescueSurplus --rpc-url $RPC_URL --broadcast
 */
contract RescueSurplus is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address proxyAddress = vm.envAddress("BRIDGE_PROXY");
        bytes32 assetId = vm.envBytes32("ASSET_ID");
        address to = vm.envAddress("TO");
        uint256 amount = vm.envUint("AMOUNT");

        BridgeV2 bridge = BridgeV2(payable(proxyAddress));
        uint256 surplus = bridge.getRescuableSurplus(assetId);

        console2.log("Rescuable surplus:", surplus);
        console2.log("Requested amount:", amount);
        require(amount <= surplus, "AMOUNT exceeds rescuable surplus");

        vm.startBroadcast(pk);
        bridge.adminRescueSurplus(assetId, to, amount);
        vm.stopBroadcast();

        console2.log("Rescued", amount, "to", to);
        console2.log("Remaining surplus:", bridge.getRescuableSurplus(assetId));
    }
}

/**
 * @title ReconcilePool
 * @notice One-time correction of a pool whose accounting diverged from real holdings under
 *         the pre-fix bridge logic (e.g. a drained destination pool whose totalDeposited was
 *         never debited). Owner key only. Set the new principal/fee to the pool's real value.
 *
 * Usage:
 *   BRIDGE_PROXY=0x... ASSET_ID=0x... NEW_TOTAL_DEPOSITED=<wei> NEW_ACCUMULATED_FEES=<wei> \
 *   PRIVATE_KEY=0x... \
 *   forge script script/RecoverLiquidity.s.sol:ReconcilePool --rpc-url $RPC_URL --broadcast
 */
contract ReconcilePool is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address proxyAddress = vm.envAddress("BRIDGE_PROXY");
        bytes32 assetId = vm.envBytes32("ASSET_ID");
        uint256 newTotalDeposited = vm.envUint("NEW_TOTAL_DEPOSITED");
        uint256 newAccumulatedFees = vm.envUint("NEW_ACCUMULATED_FEES");

        BridgeV2 bridge = BridgeV2(payable(proxyAddress));

        console2.log("Before totalPoolValue:", bridge.getTotalPoolValue(assetId));

        vm.startBroadcast(pk);
        bridge.reconcilePool(assetId, newTotalDeposited, newAccumulatedFees);
        vm.stopBroadcast();

        console2.log("After totalPoolValue:", bridge.getTotalPoolValue(assetId));
    }
}

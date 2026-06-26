// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {BridgeV2} from "../src/BridgeV2.sol";

/**
 * @title ConfigureMigration
 * @notice Owner-only. Sets the LP-migration fee and per-migration cap, and authorizes the
 *         migration relayers. Run once per chain AFTER the proxy has been upgraded to the
 *         implementation that includes the migration functions.
 *
 * Env:
 *   PRIVATE_KEY            owner key (0x536aFD...)
 *   BRIDGE_PROXY           proxy address on this chain
 *   MIGRATION_FEE_BPS      optional, default 100 (1%)
 *   MIGRATION_MAX_VALUE    optional, default 0 (no per-migration cap)
 *   MIGRATION_RELAYER_1    first migration relayer
 *   MIGRATION_RELAYER_2    optional, second migration relayer
 *
 * Usage:
 *   BRIDGE_PROXY=0x... MIGRATION_RELAYER_1=0x... MIGRATION_RELAYER_2=0x... \
 *   forge script script/MigrationAdmin.s.sol:ConfigureMigration --rpc-url $RPC --broadcast
 */
contract ConfigureMigration is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address proxy = vm.envAddress("BRIDGE_PROXY");
        uint16 feeBps = uint16(vm.envOr("MIGRATION_FEE_BPS", uint256(100)));
        uint256 maxValue = vm.envOr("MIGRATION_MAX_VALUE", uint256(0));
        address r1 = vm.envAddress("MIGRATION_RELAYER_1");
        address r2 = vm.envOr("MIGRATION_RELAYER_2", address(0));

        BridgeV2 bridge = BridgeV2(payable(proxy));

        vm.startBroadcast(pk);
        bridge.configureMigration(feeBps, maxValue);
        bridge.setMigrationRelayer(r1, true);
        if (r2 != address(0)) bridge.setMigrationRelayer(r2, true);
        vm.stopBroadcast();

        console2.log("Chain:", block.chainid);
        console2.log("migrationFeeBps:", bridge.migrationFeeBps());
        console2.log("maxMigrationValue:", bridge.maxMigrationValue());
        console2.log("relayer1 enabled:", bridge.migrationRelayers(r1));
        if (r2 != address(0)) console2.log("relayer2 enabled:", bridge.migrationRelayers(r2));
    }
}

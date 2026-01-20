// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title ILPToken
 * @notice Interface for MoonBridge LP tokens
 */
interface ILPToken is IERC20 {
    /// @notice Initialize the LP token (called by factory)
    /// @param name_ Token name
    /// @param symbol_ Token symbol
    /// @param bridge_ Bridge contract address (only caller for mint/burn)
    function initialize(
        string memory name_,
        string memory symbol_,
        address bridge_
    ) external;

    /// @notice Mint LP tokens to an address
    /// @param to Recipient address
    /// @param amount Amount to mint
    function mint(address to, uint256 amount) external;

    /// @notice Burn LP tokens from an address
    /// @param from Address to burn from
    /// @param amount Amount to burn
    function burn(address from, uint256 amount) external;

    /// @notice Get the bridge contract address
    function bridge() external view returns (address);
}

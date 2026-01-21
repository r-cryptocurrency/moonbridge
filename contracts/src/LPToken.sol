// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ILPToken} from "./interfaces/ILPToken.sol";

/**
 * @title LPToken
 * @notice ERC20 LP token for MoonBridge liquidity providers
 * @dev Deployed via minimal proxy (clone) pattern for gas efficiency
 */
contract LPToken is ERC20, ILPToken {
    // ============ State Variables ============

    /// @notice Bridge contract that can mint/burn
    address public bridge;

    /// @notice Token name (set during initialization)
    string private _tokenName;

    /// @notice Token symbol (set during initialization)
    string private _tokenSymbol;

    /// @notice Whether the contract has been initialized
    bool private _initialized;

    // ============ Errors ============

    error OnlyBridge();
    error AlreadyInitialized();

    // ============ Modifiers ============

    modifier onlyBridge() {
        if (msg.sender != bridge) revert OnlyBridge();
        _;
    }

    // ============ Constructor ============

    /// @dev Constructor sets empty name/symbol for implementation contract
    /// Actual values are set in initialize() for clones
    constructor() ERC20("", "") {
        // Mark implementation as initialized to prevent direct use
        _initialized = true;
    }

    // ============ Initialization ============

    /// @inheritdoc ILPToken
    function initialize(
        string memory name_,
        string memory symbol_,
        address bridge_
    ) external override {
        if (_initialized) revert AlreadyInitialized();
        _initialized = true;

        _tokenName = name_;
        _tokenSymbol = symbol_;
        bridge = bridge_;
    }

    // ============ ERC20 Overrides ============

    /// @notice Returns the token name
    function name() public view override returns (string memory) {
        return _tokenName;
    }

    /// @notice Returns the token symbol
    function symbol() public view override returns (string memory) {
        return _tokenSymbol;
    }

    // ============ Mint/Burn Functions ============

    /// @inheritdoc ILPToken
    function mint(address to, uint256 amount) external override onlyBridge {
        _mint(to, amount);
    }

    /// @inheritdoc ILPToken
    function burn(address from, uint256 amount) external override onlyBridge {
        _burn(from, amount);
    }
}

// Need to import IERC20Metadata for the override
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

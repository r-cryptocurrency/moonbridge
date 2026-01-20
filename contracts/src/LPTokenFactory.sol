// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {ILPToken} from "./interfaces/ILPToken.sol";

/**
 * @title LPTokenFactory
 * @notice Factory for deploying LP tokens via minimal proxy (Clones) pattern
 * @dev Uses EIP-1167 minimal proxies for gas-efficient LP token deployment
 */
contract LPTokenFactory {
    using Clones for address;

    // ============ State Variables ============

    /// @notice LP token implementation contract
    address public immutable lpTokenImplementation;

    /// @notice Deployed LP tokens
    address[] public deployedLPTokens;

    /// @notice Mapping to check if address is a deployed LP token
    mapping(address => bool) public isLPToken;

    // ============ Events ============

    event LPTokenDeployed(
        address indexed lpToken,
        string name,
        string symbol,
        address indexed bridge
    );

    // ============ Errors ============

    error DeploymentFailed();

    // ============ Constructor ============

    /**
     * @notice Deploy the factory with LP token implementation
     * @param _lpTokenImplementation Address of LPToken implementation
     */
    constructor(address _lpTokenImplementation) {
        if (_lpTokenImplementation == address(0)) revert DeploymentFailed();
        lpTokenImplementation = _lpTokenImplementation;
    }

    // ============ External Functions ============

    /**
     * @notice Deploy a new LP token as a minimal proxy
     * @param name Token name
     * @param symbol Token symbol
     * @param bridge Bridge contract address (only caller for mint/burn)
     * @return lpToken Address of deployed LP token
     */
    function deployLPToken(
        string memory name,
        string memory symbol,
        address bridge
    ) external returns (address lpToken) {
        // Deploy minimal proxy
        lpToken = lpTokenImplementation.clone();

        // Initialize the proxy
        ILPToken(lpToken).initialize(name, symbol, bridge);

        // Track deployment
        deployedLPTokens.push(lpToken);
        isLPToken[lpToken] = true;

        emit LPTokenDeployed(lpToken, name, symbol, bridge);

        return lpToken;
    }

    // ============ View Functions ============

    /**
     * @notice Get count of deployed LP tokens
     * @return count Number of LP tokens deployed
     */
    function getDeployedCount() external view returns (uint256) {
        return deployedLPTokens.length;
    }

    /**
     * @notice Get deployed LP token at index
     * @param index Index in deployedLPTokens array
     * @return lpToken Address of LP token
     */
    function getDeployedLPToken(uint256 index) external view returns (address) {
        return deployedLPTokens[index];
    }

    /**
     * @notice Get all deployed LP tokens
     * @return Array of LP token addresses
     */
    function getAllDeployedLPTokens() external view returns (address[] memory) {
        return deployedLPTokens;
    }
}

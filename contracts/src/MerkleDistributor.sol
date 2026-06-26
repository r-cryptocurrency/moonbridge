// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MerkleDistributor
 * @notice Merkle claim contract for refunding MOON LPs.
 * @dev Normal operation needs no admin: a recipient proves their (index, account, amount)
 *      leaf against the fixed Merkle root and claims their own share. The owner holds a
 *      break-glass `recover` ability for use only if a future bug requires intervention.
 *      It is not exercised in normal operation. Ownership can be transferred or renounced.
 *
 *      Leaf format matches the standard Uniswap MerkleDistributor scheme:
 *        leaf = keccak256(abi.encodePacked(index, account, amount))
 */
contract MerkleDistributor is Ownable {
    using SafeERC20 for IERC20;

    /// @notice Token being distributed (MOON).
    address public immutable token;

    /// @notice Merkle root committing every (index, account, amount) entitlement.
    bytes32 public immutable merkleRoot;

    /// @dev Packed bitmap of claimed indices.
    mapping(uint256 => uint256) private claimedBitMap;

    event Claimed(uint256 index, address account, uint256 amount);
    event Recovered(address to, uint256 amount);

    error AlreadyClaimed();
    error InvalidProof();
    error ZeroAddress();

    constructor(address token_, bytes32 merkleRoot_, address owner_) Ownable(owner_) {
        if (token_ == address(0)) revert ZeroAddress();
        token = token_;
        merkleRoot = merkleRoot_;
    }

    /// @notice Break-glass: owner can move tokens out if a future bug requires intervention.
    function recover(address to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        IERC20(token).safeTransfer(to, amount);
        emit Recovered(to, amount);
    }

    /// @notice Whether the entitlement at `index` has been claimed.
    function isClaimed(uint256 index) public view returns (bool) {
        uint256 wordIndex = index / 256;
        uint256 bitIndex = index % 256;
        uint256 word = claimedBitMap[wordIndex];
        uint256 mask = (1 << bitIndex);
        return word & mask == mask;
    }

    function _setClaimed(uint256 index) private {
        uint256 wordIndex = index / 256;
        uint256 bitIndex = index % 256;
        claimedBitMap[wordIndex] = claimedBitMap[wordIndex] | (1 << bitIndex);
    }

    /// @notice Claim the entitlement at `index` for `account`.
    /// @dev Anyone may submit the proof; funds always go to `account`, never the caller.
    function claim(
        uint256 index,
        address account,
        uint256 amount,
        bytes32[] calldata merkleProof
    ) external {
        if (isClaimed(index)) revert AlreadyClaimed();

        bytes32 node = keccak256(abi.encodePacked(index, account, amount));
        if (!MerkleProof.verify(merkleProof, merkleRoot, node)) revert InvalidProof();

        _setClaimed(index);
        IERC20(token).safeTransfer(account, amount);

        emit Claimed(index, account, amount);
    }
}

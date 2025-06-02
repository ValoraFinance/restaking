// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

// Interface for points contract integration
interface IValoraPoints {
    function onDeposit(address user, uint256 amount) external;
    function onWithdrawal(address user, uint256 amount) external;
}

/**
 * @title PointsManager
 * @notice Reusable contract for managing points system integration
 * @dev Can be inherited by any contract that needs points functionality
 */
abstract contract PointsManager is OwnableUpgradeable {
    
    IValoraPoints public pointsContract; // Optional points contract
    bool public pointsEnabled = false; // Flag to enable/disable points

    // Events
    event PointsContractUpdated(address indexed oldPointsContract, address indexed newPointsContract);
    event PointsEnabled(bool enabled);

    /**
     * @notice Initialize points manager (call from inheriting contract's initialize)
     */
    function __PointsManager_init() internal onlyInitializing {
        pointsEnabled = false;
    }

    // ═══════════════════════════════════════════════════════════════════
    // POINTS SYSTEM MANAGEMENT
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @notice Set the points contract address (can be called later when points program launches)
     * @param _pointsContract Address of the points contract (can be address(0) to disable)
     */
    function setPointsContract(address _pointsContract) external onlyOwner {
        address oldPointsContract = address(pointsContract);
        pointsContract = IValoraPoints(_pointsContract);
        emit PointsContractUpdated(oldPointsContract, _pointsContract);
    }

    /**
     * @notice Enable or disable points system
     * @param _enabled True to enable points, false to disable
     */
    function setPointsEnabled(bool _enabled) external onlyOwner {
        // Can only enable if points contract is set
        if (_enabled) {
            require(address(pointsContract) != address(0), "Points contract not set");
        }
        pointsEnabled = _enabled;
        emit PointsEnabled(_enabled);
    }

    /**
     * @notice Internal function to notify points contract about deposit
     * @param user User address
     * @param amount Amount deposited
     */
    function _notifyPointsDeposit(address user, uint256 amount) internal {
        if (!pointsEnabled || address(pointsContract) == address(0)) {
            return; // Points system not active
        }

        try pointsContract.onDeposit(user, amount) {
            // Points contract handles all logic
        } catch {
            // Silently fail if points contract has issues - don't break main functionality
        }
    }

    /**
     * @notice Internal function to notify points contract about withdrawal
     * @param user User address
     * @param amount Amount withdrawn
     */
    function _notifyPointsWithdrawal(address user, uint256 amount) internal {
        if (!pointsEnabled || address(pointsContract) == address(0)) {
            return; // Points system not active
        }

        try pointsContract.onWithdrawal(user, amount) {
            // Points contract handles all logic
        } catch {
            // Silently fail if points contract has issues
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @notice Get points system configuration
     * @return pointsContract_ Address of points contract
     * @return pointsEnabled_ Whether points are enabled
     */
    function getPointsConfig() external view returns (address pointsContract_, bool pointsEnabled_) {
        return (address(pointsContract), pointsEnabled);
    }

    /**
     * @notice Check if user is eligible for points (has points contract and is enabled)
     * @return eligible True if user can earn points
     */
    function isPointsEligible() external view returns (bool eligible) {
        return pointsEnabled && address(pointsContract) != address(0);
    }
} 
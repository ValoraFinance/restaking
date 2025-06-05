// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title AdminManager
 * @notice Reusable contract for managing administrative functions
 * @dev Can be inherited by any contract that needs admin functionality
 * Note: This contract expects the parent to provide onlyOwner modifier
 */
abstract contract AdminManager {
    
    address public oracul;
    bool public paused;
    bool public withdrawalsEnabled;
    uint256 public withdrawalDelay;

    // Events
    event OracleUpdated(address indexed oldOracle, address indexed newOracle);
    event WithdrawalDelayUpdated(uint256 oldDelay, uint256 newDelay);
    event WithdrawalsEnabled(); // Can only be emitted once
    event Paused();
    event Unpaused();

    // Modifiers
    modifier onlyOracul() {
        require(msg.sender == oracul, "Only oracle can call this");
        _;
    }

    modifier whenNotPaused() {
        require(!paused, "Pausable: paused");
        _;
    }

    modifier whenWithdrawalsEnabled() {
        require(withdrawalsEnabled, "Withdrawals not enabled yet");
        _;
    }

    /**
     * @notice Initialize admin manager (call from inheriting contract's initialize)
     * @param _oracul Initial oracle address
     */
    function __AdminManager_init(address _oracul) internal {
        require(_oracul != address(0), "Invalid oracle address");
        oracul = _oracul;
        paused = false;
        withdrawalsEnabled = false; // Start with withdrawals disabled
        withdrawalDelay = 7 days;
    }

    // ═══════════════════════════════════════════════════════════════════
    // ORACLE MANAGEMENT - VIRTUAL FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @notice Set oracle address
     * @param _oracul New oracle address
     */
    function setOracul(address _oracul) external virtual;

    // ═══════════════════════════════════════════════════════════════════
    // WITHDRAWAL MANAGEMENT - VIRTUAL FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @notice Enable withdrawals forever (can only be called once)
     * @dev Once enabled, withdrawals cannot be disabled again
     */
    function enableWithdrawals() external virtual;

    // PAUSE MECHANISM - VIRTUAL FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @notice Pause contract operations
     */
    function pause() external virtual;

    /**
     * @notice Unpause contract operations
     */
    function unpause() external virtual;

    // ═══════════════════════════════════════════════════════════════════
    // WITHDRAWAL DELAY MANAGEMENT - VIRTUAL FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @notice Set withdrawal delay period
     * @param _delay New delay in seconds (max 30 days)
     */
    function setWithdrawalDelay(uint256 _delay) external virtual;

    // ═══════════════════════════════════════════════════════════════════
    // INTERNAL IMPLEMENTATIONS
    // ═══════════════════════════════════════════════════════════════════

    function _setOracul(address _oracul) internal {
        require(_oracul != address(0), "Invalid oracle address");
        address oldOracle = oracul;
        oracul = _oracul;
        emit OracleUpdated(oldOracle, _oracul);
    }

    function _enableWithdrawals() internal {
        require(!withdrawalsEnabled, "Withdrawals already enabled");
        withdrawalsEnabled = true;
        emit WithdrawalsEnabled();
    }

    function _pause() internal {
        paused = true;
        emit Paused();
    }

    function _unpause() internal {
        paused = false;  
        emit Unpaused();
    }

    function _setWithdrawalDelay(uint256 _delay) internal {
        require(_delay <= 30 days, "Delay too long");
        uint256 oldDelay = withdrawalDelay;
        withdrawalDelay = _delay;
        emit WithdrawalDelayUpdated(oldDelay, _delay);
    }

    // ═══════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @notice Get admin configuration
     * @return oracul_ Oracle address
     * @return paused_ Whether contract is paused
     * @return withdrawalDelay_ Current withdrawal delay
     */
    function getAdminConfig() external view returns (address oracul_, bool paused_, uint256 withdrawalDelay_) {
        return (oracul, paused, withdrawalDelay);
    }

    /**
     * @notice Check if contract is operational (not paused)
     * @return operational True if contract is not paused
     */
    function isOperational() external view returns (bool operational) {
        return !paused;
    }
} 
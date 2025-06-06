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
 

    // Events
    event OracleUpdated(address indexed oldOracle, address indexed newOracle);
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

    /**
     * @notice Initialize admin manager (call from inheriting contract's initialize)
     * @param _oracul Initial oracle address
     */
    function __AdminManager_init(address _oracul) internal {
        require(_oracul != address(0), "Invalid oracle address");
        oracul = _oracul;
        paused = false;
   
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
    // INTERNAL IMPLEMENTATIONS
    // ═══════════════════════════════════════════════════════════════════

    function _setOracul(address _oracul) internal {
        require(_oracul != address(0), "Invalid oracle address");
        address oldOracle = oracul;
        oracul = _oracul;
        emit OracleUpdated(oldOracle, _oracul);
    }



    function _pause() internal {
        paused = true;
        emit Paused();
    }

    function _unpause() internal {
        paused = false;  
        emit Unpaused();
    }

    // ═══════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @notice Get admin configuration
     * @return oracul_ Oracle address
     * @return paused_ Whether contract is paused
     */
    function getAdminConfig() external view returns (address oracul_, bool paused_) {
        return (oracul, paused);
    }

    /**
     * @notice Check if contract is operational (not paused)
     * @return operational True if contract is not paused
     */
    function isOperational() external view returns (bool operational) {
        return !paused;
    }
} 
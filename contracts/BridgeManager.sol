// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

// Interface for bridge operations
interface IBridge {
    function bridgeToken(address token_address, uint256 value, bytes3 destination, bytes calldata destination_address) external;
    function unlockBridgedToken(bytes32 txHash, bytes3 source, address token, address to, uint256 value) external;
    function unlocked(address sender, address token, uint value) external;
    function isUnlocked(bytes32 hash) external view returns(bool);
}

/**
 * @title BridgeManager
 * @notice Reusable contract for managing bridge operations
 * @dev Can be inherited by any contract that needs bridge functionality
 */
abstract contract BridgeManager is OwnableUpgradeable {
    
    IBridge public bridge;
    
    // Bridge settings for native chain
    bytes3 public nativeChainId; // Destination chain ID for CELL tokens
    bytes public validatorAddress; // Validator address in native chain where CELL tokens go

    // Events
    event BridgeUpdated(address indexed oldBridge, address indexed newBridge);
    event ValidatorAddressUpdated(bytes3 chainId, bytes validatorAddress);
    event TokensBridgedToValidator(address indexed user, uint256 amount, bytes3 destination, bytes validatorAddress);

    /**
     * @notice Initialize bridge manager (call from inheriting contract's initialize)
     * @param _bridge Bridge contract address
     * @param _nativeChainId Native chain ID
     * @param _validatorAddress Validator address
     */
    function __BridgeManager_init(
        address _bridge,
        bytes3 _nativeChainId,
        bytes calldata _validatorAddress
    ) internal onlyInitializing {
        require(_bridge != address(0), "Invalid bridge address");
        require(_nativeChainId != bytes3(0), "Invalid chain ID");
        require(_validatorAddress.length > 0, "Invalid validator address");
        
        bridge = IBridge(_bridge);
        nativeChainId = _nativeChainId;
        validatorAddress = _validatorAddress;
    }

    // ═══════════════════════════════════════════════════════════════════
    // BRIDGE MANAGEMENT
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @notice Set bridge contract address
     * @param _bridge New bridge address
     */
    function setBridge(address _bridge) external onlyOwner {
        require(_bridge != address(0), "Invalid bridge address");
        address oldBridge = address(bridge);
        bridge = IBridge(_bridge);
        emit BridgeUpdated(oldBridge, _bridge);
    }

    /**
     * @notice Set validator address and chain ID
     * @param _chainId Target chain ID
     * @param _validatorAddress Validator address in target chain
     */
    function setValidatorAddress(bytes3 _chainId, bytes calldata _validatorAddress) external onlyOwner {
        require(_chainId != bytes3(0), "Invalid chain ID");
        require(_validatorAddress.length > 0, "Invalid validator address");
        nativeChainId = _chainId;
        validatorAddress = _validatorAddress;
        emit ValidatorAddressUpdated(_chainId, _validatorAddress);
    }

    // ═══════════════════════════════════════════════════════════════════
    // BRIDGE OPERATIONS
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @notice Internal function to bridge tokens to validator
     * @param token Token address to bridge
     * @param amount Amount to bridge
     * @param user User address (for events)
     */
    function _bridgeToValidator(address token, uint256 amount, address user) internal {
        require(address(bridge) != address(0), "Bridge not configured");
        require(nativeChainId != bytes3(0), "Native chain not configured");
        require(validatorAddress.length > 0, "Validator address not configured");
        
        // Bridge tokens to native chain validator address
        bridge.bridgeToken(token, amount, nativeChainId, validatorAddress);
        
        emit TokensBridgedToValidator(user, amount, nativeChainId, validatorAddress);
    }


    // ═══════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @notice Get bridge configuration
     * @return bridge_ Bridge contract address
     * @return nativeChainId_ Native chain ID
     * @return validatorAddress_ Validator address
     */
    function getBridgeConfig() external view returns (address bridge_, bytes3 nativeChainId_, bytes memory validatorAddress_) {
        return (address(bridge), nativeChainId, validatorAddress);
    }

    /**
     * @notice Check if bridge is properly configured
     * @return configured True if all bridge settings are set
     */
    function isBridgeConfigured() external view returns (bool configured) {
        return address(bridge) != address(0) && 
               nativeChainId != bytes3(0) && 
               validatorAddress.length > 0;
    }
} 
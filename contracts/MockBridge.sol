// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MockBridge {
    event TokenBridged(address token_address, uint256 value, bytes3 destination, bytes destination_address);
    
    function bridgeToken(address token_address, uint256 value, bytes3 destination, bytes calldata destination_address) external {
        emit TokenBridged(token_address, value, destination, destination_address);
    }
    
    function unlockBridgedToken(bytes32 txHash, bytes3 source, address token, address to, uint256 value) external {
        // Mock implementation - does nothing
    }
    
    function unlocked(address sender, address token, uint value) external {
        // Mock implementation - does nothing
    }
    
    function isUnlocked(bytes32 hash) external pure returns(bool) {
        return false;
    }
} 
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../ValoraCore.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title MaliciousContract
 * @dev Contract to test reentrancy protection in ValoraCore
 */
contract MaliciousContract {
    ValoraCore public valoraCore;
    IERC20 public cellToken;
    bool public attackInProgress;
    uint256 public attackCount;
    
    constructor(address _valoraCore, address _cellToken) {
        valoraCore = ValoraCore(_valoraCore);
        cellToken = IERC20(_cellToken);
    }
    
    // Attack via deposit function
    function attackDeposit(uint256 amount) external {
        attackInProgress = true;
        attackCount = 0;
        
        cellToken.approve(address(valoraCore), amount * 10); // Approve more for multiple attempts
        valoraCore.deposit(amount);
    }
    
    // Attack via withdrawal
    function attackWithdrawal(uint256 shares) external {
        attackInProgress = true;
        attackCount = 0;
        
        valoraCore.requestWithdrawal(shares);
    }
    
    // Receive function to attempt reentrancy
    receive() external payable {
        if (attackInProgress && attackCount < 3) {
            attackCount++;
            
            try valoraCore.deposit(100 ether) {
                // If this succeeds, reentrancy protection failed
            } catch {
                // Expected if reentrancy protection works
            }
        }
    }
    
    // Fallback to catch other calls
    fallback() external payable {
        if (attackInProgress && attackCount < 3) {
            attackCount++;
            
            try valoraCore.deposit(100 ether) {
                // If this succeeds, reentrancy protection failed
            } catch {
                // Expected if reentrancy protection works
            }
        }
    }
    
    function stopAttack() external {
        attackInProgress = false;
        attackCount = 0;
    }
} 
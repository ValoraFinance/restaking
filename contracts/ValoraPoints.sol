// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";

contract ValoraPoints is OwnableUpgradeable, ReentrancyGuardUpgradeable {
    
    struct UserPoints {
        uint256 stakingPoints;      // Points from staking
        uint256 lendingPoints;      // Points from lending
        uint256 borrowingPoints;    // Points from borrowing
        uint256 loyaltyPoints;      // Bonus points for long-term users
        uint256 totalPoints;        // Sum of all points
        uint256 lastUpdate;        // Last update timestamp
    }

    struct PointsConfig {
        uint256 stakingMultiplier;   // Points per CELL staked per day
        uint256 lendingMultiplier;   // Points per token lent per day
        uint256 borrowingMultiplier; // Points per token borrowed per day
        uint256 loyaltyBonusRate;    // Daily bonus for loyalty
        uint256 maxLoyaltyDays;      // Max days for loyalty bonus
    }

    // State variables
    mapping(address => UserPoints) public userPoints;
    mapping(address => bool) public authorizedContracts; // Contracts that can award points
    
    PointsConfig public config;
    uint256 public totalPointsDistributed;
    
    // Events
    event PointsAwarded(address indexed user, string indexed category, uint256 amount);
    event PointsUpdated(address indexed user, uint256 newTotal);
    event ConfigUpdated(PointsConfig newConfig);
    event ContractAuthorized(address indexed contractAddr, bool authorized);
    event PointsRedeemed(address indexed user, uint256 amount, string purpose);

    modifier onlyAuthorized() {
        require(authorizedContracts[msg.sender] || msg.sender == owner(), "Not authorized");
        _;
    }

    function initialize() external initializer {
        __Ownable_init(msg.sender);
        __ReentrancyGuard_init();
        
        // Default configuration
        config = PointsConfig({
            stakingMultiplier: 100,     // 100 points per CELL per day
            lendingMultiplier: 50,      // 50 points per token per day
            borrowingMultiplier: 25,    // 25 points per token per day (less than lending)
            loyaltyBonusRate: 10,       // 10 points per day loyalty bonus
            maxLoyaltyDays: 365         // Max 1 year of loyalty bonus
        });
    }

    // === Authorization Management ===
    function setContractAuthorization(address contractAddr, bool authorized) external onlyOwner {
        authorizedContracts[contractAddr] = authorized;
        emit ContractAuthorized(contractAddr, authorized);
    }

    // === Points Configuration ===
    function updateConfig(PointsConfig calldata newConfig) external onlyOwner {
        config = newConfig;
        emit ConfigUpdated(newConfig);
    }

    // === Points Tracking ===
    function updateStakingPoints(address user, uint256 amount, uint256 duration) external onlyAuthorized {
        uint256 points = (amount * config.stakingMultiplier * duration) / 1 days;
        _addPoints(user, points, "staking");
        userPoints[user].stakingPoints += points;
    }

    function updateLendingPoints(address user, uint256 amount, uint256 duration) external onlyAuthorized {
        uint256 points = (amount * config.lendingMultiplier * duration) / 1 days;
        _addPoints(user, points, "lending");
        userPoints[user].lendingPoints += points;
    }

    function updateBorrowingPoints(address user, uint256 amount, uint256 duration) external onlyAuthorized {
        uint256 points = (amount * config.borrowingMultiplier * duration) / 1 days;
        _addPoints(user, points, "borrowing");
        userPoints[user].borrowingPoints += points;
    }

    function updateLoyaltyPoints(address user) external onlyAuthorized {
        UserPoints storage userData = userPoints[user];
        
        if (userData.lastUpdate == 0) {
            userData.lastUpdate = block.timestamp;
            return;
        }

        uint256 daysPassed = (block.timestamp - userData.lastUpdate) / 1 days;
        if (daysPassed > 0) {
            uint256 loyaltyDays = daysPassed > config.maxLoyaltyDays ? config.maxLoyaltyDays : daysPassed;
            uint256 loyaltyPoints = loyaltyDays * config.loyaltyBonusRate;
            
            _addPoints(user, loyaltyPoints, "loyalty");
            userData.loyaltyPoints += loyaltyPoints;
            userData.lastUpdate = block.timestamp;
        }
    }

    function _addPoints(address user, uint256 amount, string memory category) private {
        userPoints[user].totalPoints += amount;
        totalPointsDistributed += amount;
        
        emit PointsAwarded(user, category, amount);
        emit PointsUpdated(user, userPoints[user].totalPoints);
    }

    // === Points Redemption ===
    function redeemPoints(address user, uint256 amount, string calldata purpose) external onlyAuthorized {
        require(userPoints[user].totalPoints >= amount, "Insufficient points");
        
        userPoints[user].totalPoints -= amount;
        totalPointsDistributed -= amount;
        
        emit PointsRedeemed(user, amount, purpose);
        emit PointsUpdated(user, userPoints[user].totalPoints);
    }

    // === View Functions ===
    function getUserPoints(address user) external view returns (UserPoints memory) {
        return userPoints[user];
    }

    function getPointsBreakdown(address user) external view returns (
        uint256 staking,
        uint256 lending, 
        uint256 borrowing,
        uint256 loyalty,
        uint256 total
    ) {
        UserPoints memory userData = userPoints[user];
        return (
            userData.stakingPoints,
            userData.lendingPoints,
            userData.borrowingPoints,
            userData.loyaltyPoints,
            userData.totalPoints
        );
    }

    function calculatePendingLoyaltyPoints(address user) external view returns (uint256) {
        UserPoints memory userData = userPoints[user];
        
        if (userData.lastUpdate == 0) return 0;
        
        uint256 daysPassed = (block.timestamp - userData.lastUpdate) / 1 days;
        if (daysPassed == 0) return 0;
        
        uint256 loyaltyDays = daysPassed > config.maxLoyaltyDays ? config.maxLoyaltyDays : daysPassed;
        return loyaltyDays * config.loyaltyBonusRate;
    }

    // === Batch Operations ===
    function batchUpdatePoints(
        address[] calldata users,
        uint256[] calldata amounts,
        string[] calldata categories
    ) external onlyAuthorized {
        require(users.length == amounts.length && amounts.length == categories.length, "Array length mismatch");
        
        for (uint256 i = 0; i < users.length; i++) {
            _addPoints(users[i], amounts[i], categories[i]);
        }
    }
} 
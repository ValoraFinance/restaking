// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "./ValoraStakedCell.sol";
import "./AdminManager.sol";
import "./BridgeManager.sol";
import "./WeeklyWithdrawalManager.sol";


contract ValoraCore is ReentrancyGuardUpgradeable, UUPSUpgradeable, OwnableUpgradeable, AdminManager, BridgeManager, WeeklyWithdrawalManager {
    IERC20 public cellToken;
    ValoraStakedCell public sCellToken;

    uint256 private totalAssets;
    uint256 public constant MIN_DEPOSIT = 1e12; // Minimum deposit 0.000001 tokens (assuming 18 decimals)

    // Events
    event Staked(address indexed user, uint256 amount);
    event Rebased(uint256 totalShares, uint256 totalAssets);
    event NativeUnstakingInitiated(uint256 indexed week, uint256 amount);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _cellToken, 
        address _sCellToken, 
        address _oracul,
        address _bridge,
        bytes3 _nativeChainId,
        bytes calldata _validatorAddress
    ) external initializer {
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();
        __Ownable_init(msg.sender);
        __AdminManager_init(_oracul);
        __BridgeManager_init(_bridge, _nativeChainId, _validatorAddress);
        _initializeWithdrawalManager();
        
        cellToken = IERC20(_cellToken);
        sCellToken = ValoraStakedCell(_sCellToken);
    }

    // ═══════════════════════════════════════════════════════════════════
    // ADMIN MANAGER IMPLEMENTATIONS
    // ═══════════════════════════════════════════════════════════════════

    function setOracul(address _oracul) external override onlyOwner {
        _setOracul(_oracul);
    }

    function enableWithdrawals() external override onlyOwner {
        _enableWithdrawals();
    }

    function pause() external override onlyOwner {
        _pause();
    }

    function unpause() external override onlyOwner {
        _unpause();
    }

    function setWithdrawalDelay(uint256 _delay) external override onlyOwner {
        _setWithdrawalDelay(_delay);
    }

    // ═══════════════════════════════════════════════════════════════════
    // BRIDGE MANAGER IMPLEMENTATIONS
    // ═══════════════════════════════════════════════════════════════════

    function setBridge(address _bridge) external override onlyOwner {
        _setBridge(_bridge);
    }

    function setValidatorAddress(bytes3 _chainId, bytes calldata _validatorAddress) external override onlyOwner {
        _setValidatorAddress(_chainId, _validatorAddress);
    }

    // ═══════════════════════════════════════════════════════════════════
    // CORE STAKING FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════

    function deposit(uint256 amount) external whenNotPaused nonReentrant {
        require(amount >= MIN_DEPOSIT, "Amount too small");
        
        // Transfer CELL tokens from user to this contract
        require(cellToken.transferFrom(msg.sender, address(this), amount), "Transfer failed");
        
        // Approve bridge to spend CELL tokens
        require(cellToken.approve(address(bridge), amount), "Bridge approval failed");
        
        // Bridge CELL tokens to native chain validator address (inherited from BridgeManager)
        _bridgeToValidator(address(cellToken), amount, msg.sender);
        
        // Mint sCELL tokens to user
        _deposit(amount);
    }

    function _deposit(uint256 amount) private {
        uint256 supply = sCellToken.totalSupply();
        uint256 assets = totalAssets;

        uint256 shares;

        if (supply == 0 || assets == 0) {
            // Первый депозит: 1 share = 1 token
            shares = amount;
        } else {
            // Use precise calculation with rounding check
            shares = (amount * supply) / assets;
            require(shares > 0, "Deposit too small, would result in 0 shares");
        }

        sCellToken.mint(msg.sender, shares);
        totalAssets += amount;

        emit Staked(msg.sender, amount);
    }

    // --- Rebase ---
    function rebase(uint256 amount) onlyOracul external {
        require(amount > 0, "Amount must be greater than 0");        
        totalAssets = amount;
        emit Rebased(sCellToken.totalSupply(), totalAssets);
    }

    // ═══════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════

    function exchangeRate() public view returns (uint256) {
        uint256 supply = sCellToken.totalSupply();
        if (supply == 0) return 1e18;
        return (totalAssets * 1e18) / supply;
    }

    function getTotalAssets() external view returns (uint256) {
        return totalAssets;
    }

    // ═══════════════════════════════════════════════════════════════════
    // WEEKLY WITHDRAWAL MANAGER IMPLEMENTATION
    // ═══════════════════════════════════════════════════════════════════

    function _getExchangeRate() internal view override returns (uint256) {
        return exchangeRate();
    }

    function _getUserShares(address user) internal view override returns (uint256) {
        return sCellToken.balanceOf(user);
    }

    function _transferAndBurnShares(address user, uint256 shares) internal override {
        require(sCellToken.transferFrom(user, address(this), shares), "Transfer failed");
        sCellToken.burn(address(this), shares);
        
        // Note: totalAssets will be decreased when withdrawal is completed in _transferAssets
        // This is correct because tokens are still earning rewards until actual withdrawal
    }

    function _transferAssets(address user, uint256 assets) internal override {
        // Decrease totalAssets when actually transferring (not when requesting)
        require(totalAssets >= assets, "Insufficient assets");
        totalAssets -= assets;
        
        require(cellToken.transfer(user, assets), "Transfer failed");
    }

    function _initiateNativeUnstaking(uint256 amount) internal override {
        // This function should initiate unstaking process in CELL Frame
        // Implementation depends on your bridge/communication mechanism
        // Example: call bridge to unstake specific amount from validator
        
        // For now, we emit an event that can be picked up by off-chain services
        emit NativeUnstakingInitiated(currentWeek, amount);
        
        // In real implementation, you might call:
        // bridge.initiateUnstaking(validatorAddress, amount);
    }

    // ═══════════════════════════════════════════════════════════════════
    // WEEKLY WITHDRAWAL MANAGER OVERRIDES WITH MODIFIERS
    // ═══════════════════════════════════════════════════════════════════

    function requestWithdrawal(uint256 shares) external override nonReentrant whenWithdrawalsEnabled {
        _requestWithdrawal(shares);
    }

    function completeWithdrawal() external override nonReentrant {
        _completeWithdrawal();
    }

    function approveBatchByHash(bytes32 batchHash) external override onlyOwner {
        _approveBatchByHash(batchHash);
    }

    function moveToNextWeek() external override onlyOwner {
        _moveToNextWeek();
    }

    // ═══════════════════════════════════════════════════════════════════
    // UUPS UPGRADE AUTHORIZATION
    // ═══════════════════════════════════════════════════════════════════

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
}
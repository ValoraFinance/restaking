// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "./ValoraStakedCell.sol";
import "./AdminManager.sol";
import "./BridgeManager.sol";
import "./WithdrawalManager.sol";


contract ValoraCore is ReentrancyGuardUpgradeable, UUPSUpgradeable, OwnableUpgradeable, AdminManager, BridgeManager, WithdrawalManager {
    IERC20 public cellToken;
    ValoraStakedCell public sCellToken;

    uint256 private totalAssets;
    
    // SECURITY: Minimum deposit protection against precision loss
    uint256 public constant MIN_DEPOSIT = 1e18; // Minimum deposit 1 full token (18 decimals)

    // Events
    event Staked(address indexed user, uint256 amount);
    event Rebased(uint256 totalShares, uint256 newTotalAssets, uint256 oldTotalAssets);

    // SECURITY: Rebase limits
    uint256 public constant MAX_REBASE_CHANGE = 200; // 20% max change (200/1000)
    uint256 public constant MIN_REBASE_CHANGE = 800; // -20% max change (800/1000)

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
        
        cellToken = IERC20(_cellToken);
        sCellToken = ValoraStakedCell(_sCellToken);
    }

    // ═══════════════════════════════════════════════════════════════════
    // ADMIN MANAGER IMPLEMENTATIONS
    // ═══════════════════════════════════════════════════════════════════

    function setOracul(address _oracul) external override onlyOwner {
        _setOracul(_oracul);
    }

    function pause() external override onlyOwner {
        _pause();
    }

    function unpause() external override onlyOwner {
        _unpause();
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
        
        // SECURITY: Add maximum deposit limit to prevent overflow/spam attacks
        require(amount <= 10000000 * 1e18, "Deposit amount too large"); // Max 10M tokens
        
        // Transfer CELL tokens from user to this contract
        require(cellToken.transferFrom(msg.sender, address(this), amount), "Transfer failed");
        
        // SECURITY FIX: Safe approval pattern - reset first, then set exact amount
        // This prevents accumulation of leftover approvals and race conditions
        require(cellToken.approve(address(bridge), 0), "Reset approval failed");
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
            // SECURITY FIX: Проверка precision loss ДО вычисления
            // Проверяем, что депозит достаточно большой для получения shares
            require(
                (amount * supply) >= assets, 
                "Deposit too small for current exchange rate"
            );
            
            // Вычисляем shares с проверкой
            shares = (amount * supply) / assets;
            
            // Дополнительная проверка результата
            require(shares > 0, "Calculation resulted in 0 shares");
            
            // SECURITY: Проверка справедливости для пользователя
            // Убеждаемся, что пользователь не теряет более 1% стоимости из-за округления
            uint256 actualValue = (shares * assets) / supply;
            uint256 minimumAcceptableValue = (amount * 99) / 100; // 99% от депозита
            
            require(
                actualValue >= minimumAcceptableValue,
                "Precision loss too high, deposit with larger amount"
            );
        }

        sCellToken.mint(msg.sender, shares);
        totalAssets += amount;

        emit Staked(msg.sender, amount);
    }

    // --- Rebase ---
    function rebase(uint256 amount) onlyOracul external {
        require(amount > 0, "Amount must be greater than 0");
        
        uint256 oldAssets = totalAssets;
        
        // SECURITY FIX: Защита от экстремальных изменений
        if (oldAssets > 0) {
            // Рассчитываем соотношение изменения (новое значение * 1000 / старое значение)
            uint256 changeRatio = (amount * 1000) / oldAssets;
            
            // Проверяем, что изменение не более ±20%
            require(
                changeRatio >= MIN_REBASE_CHANGE && changeRatio <= 1000 + MAX_REBASE_CHANGE,
                "Rebase change exceeds safety limits"
            );
            
            // Дополнительная защита: абсолютное ограничение изменения
            uint256 maxAbsoluteChange = oldAssets / 5; // Максимум 20% от текущего значения
            require(
                amount <= oldAssets + maxAbsoluteChange && 
                amount >= oldAssets - maxAbsoluteChange,
                "Absolute rebase change too large"
            );
        }
        
        // SECURITY: Минимальное значение totalAssets для предотвращения обрушения курса
        require(amount >= 1e15, "TotalAssets too small, would crash exchange rate"); // Минимум 0.001 токена
        
        totalAssets = amount;
        
        // SECURITY: Логируем старое значение для прозрачности
        emit Rebased(sCellToken.totalSupply(), totalAssets, oldAssets);
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
    // BATCH WITHDRAWAL MANAGER IMPLEMENTATION
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

    // ═══════════════════════════════════════════════════════════════════
    // BATCH WITHDRAWAL MANAGER OVERRIDES WITH MODIFIERS
    // ═══════════════════════════════════════════════════════════════════

    function requestWithdrawal(uint256 shares) external override nonReentrant  {
        _requestWithdrawal(shares);
    }

    function unstake(bytes32 requestHash) external override nonReentrant {
        _unstake(requestHash);
    }

    function approveWithdrawal(bytes32 requestHash) external override onlyOwner {
        _approveWithdrawal(requestHash);
    }

    function approveWithdrawals(bytes32[] calldata requestHashes) external override onlyOwner {
        _approveWithdrawals(requestHashes);
    }

    // ═══════════════════════════════════════════════════════════════════
    // UUPS UPGRADE AUTHORIZATION
    // ═══════════════════════════════════════════════════════════════════

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
}
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
    uint256 public constant MIN_DEPOSIT = 1e12; // Minimum deposit 0.000001 tokens (assuming 18 decimals)

    // Events
    event Staked(address indexed user, uint256 amount);
    event Rebased(uint256 totalShares, uint256 totalAssets);


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
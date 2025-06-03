// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "./ValoraStakedCell.sol";
import "./AdminManager.sol";
import "./BridgeManager.sol";


contract ValoraCore is ReentrancyGuardUpgradeable, UUPSUpgradeable, AdminManager, BridgeManager {
    IERC20 public cellToken;
    ValoraStakedCell public sCellToken;

    uint256 private totalAssets;
    uint256 public constant MIN_DEPOSIT = 1e12; // Minimum deposit 0.000001 tokens (assuming 18 decimals)

    mapping(address => WithdrawalRequest) public withdrawalRequests;

    struct WithdrawalRequest {
        uint256 shares;
        uint256 unlockTime;
    }

    // Events
    event Staked(address indexed user, uint256 amount);
    event WithdrawRequested(address indexed user, uint256 shares, uint256 unlockTime);
    event WithdrawCompleted(address indexed user, uint256 amount);
    event Rebased(uint256 totalShares, uint256 totalAssets);

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

    // --- Request Withdrawal ---
    function requestWithdrawal(uint256 shares) external whenNotPaused whenWithdrawalsEnabled nonReentrant {
        require(shares > 0, "Shares must be greater than 0");
        require(sCellToken.balanceOf(msg.sender) >= shares, "Insufficient shares");
        
        // User burns their own shares - no need for burnFrom
        require(sCellToken.transferFrom(msg.sender, address(this), shares), "Transfer failed");
        sCellToken.burn(shares);

        uint256 unlockTime = block.timestamp + withdrawalDelay;
        withdrawalRequests[msg.sender] = WithdrawalRequest({
            shares: shares,
            unlockTime: unlockTime
        });

        emit WithdrawRequested(msg.sender, shares, unlockTime);
    }

    // --- Complete Withdrawal ---
    function completeWithdrawal() external whenNotPaused whenWithdrawalsEnabled nonReentrant {
        WithdrawalRequest memory req = withdrawalRequests[msg.sender];
        require(req.shares > 0, "No pending withdrawal");
        require(block.timestamp >= req.unlockTime, "Still locked");

        uint256 amount = (req.shares * exchangeRate()) / 1e18;
        require(amount > 0, "Withdrawal amount too small");

        delete withdrawalRequests[msg.sender];

        _delAssets(amount);

        require(cellToken.transfer(msg.sender, amount), "Transfer failed");


        emit WithdrawCompleted(msg.sender, amount);
    }

    function _delAssets(uint256 amount) private {
        require(totalAssets >= amount, "Insufficient assets");
        totalAssets -= amount;
    }

    // --- Rebase ---
    function rebase(uint256 amount) onlyOracul external {
        require(amount > 0, "Amount must be greater than 0");
        uint256 oldAssets = totalAssets;
        
        // Prevent dramatic changes (>50% up or down) as protection against oracle manipulation
        if (oldAssets > 0) {
            require(amount >= oldAssets / 2, "Rebase decrease too large");
            require(amount <= oldAssets * 3 / 2, "Rebase increase too large");
        }
        
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

    function getWithdrawalRequest(address user) external view returns (WithdrawalRequest memory) {
        return withdrawalRequests[user];
    }

    // ═══════════════════════════════════════════════════════════════════
    // UUPS UPGRADE AUTHORIZATION
    // ═══════════════════════════════════════════════════════════════════

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
}
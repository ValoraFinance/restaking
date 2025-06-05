// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title WithdrawalManager
 * @dev DEAD SIMPLE: Request → Hash → Approve → Unstake
 * 
 * LOGIC:
 * 1. User requests withdrawal → hash from data → stored in queue
 * 2. Owner approves request → user can unstake
 * 3. User unstakes → request deleted from queue
 */
abstract contract WithdrawalManager {
    
    // ═══════════════════════════════════════════════════════════════════
    // STRUCTS & STORAGE
    // ═══════════════════════════════════════════════════════════════════
    
    struct WithdrawalRequest {
        address user;
        uint256 shares;
        uint256 amount;
        uint256 blockNumber;
        bool isApproved;
    }
    
    // Hash of request data => request
    mapping(bytes32 => WithdrawalRequest) public withdrawalQueue;
    
    // User => array of request hashes
    mapping(address => bytes32[]) public userRequests;
    
    // DEPRECATED: Keep for storage layout compatibility, but no longer used
    // Users can now make multiple requests since sCELL tokens are burned immediately
    mapping(address => bool) public userHasActiveRequest;
    
    // ═══════════════════════════════════════════════════════════════════
    // EVENTS
    // ═══════════════════════════════════════════════════════════════════
    
    event WithdrawalRequested(
        address indexed user,
        bytes32 indexed requestHash,
        uint256 shares,
        uint256 amount,
        uint256 blockNumber
    );
    
    event WithdrawalApproved(
        bytes32 indexed requestHash,
        address indexed user
    );
    
    event WithdrawalCompleted(
        bytes32 indexed requestHash,
        address indexed user,
        uint256 amount
    );
    
    // ═══════════════════════════════════════════════════════════════════
    // USER FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════
    
    function requestWithdrawal(uint256 shares) external virtual;
    
    function unstake(bytes32 requestHash) external virtual;
    
    // ═══════════════════════════════════════════════════════════════════
    // ADMIN FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════
    
    function approveWithdrawal(bytes32 requestHash) external virtual;
    
    function approveWithdrawals(bytes32[] calldata requestHashes) external virtual;
    
    // ═══════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════
    
    function getRequestHash(
        address user,
        uint256 shares,
        uint256 amount,
        uint256 blockNumber
    ) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(user, shares, amount, blockNumber));
    }
    
    function getUserRequests(address user) external view returns (bytes32[] memory) {
        return userRequests[user];
    }
    
    function canUnstake(bytes32 requestHash) external view returns (bool) {
        WithdrawalRequest storage request = withdrawalQueue[requestHash];
        return request.user == msg.sender && request.isApproved;
    }
    
    // ═══════════════════════════════════════════════════════════════════
    // INTERNAL FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════
    
    function _requestWithdrawal(uint256 shares) internal {
        require(shares > 0, "Invalid shares");
        require(_getUserShares(msg.sender) >= shares, "Insufficient shares");
        
        uint256 amount = (shares * _getExchangeRate()) / 1e18;
        require(amount > 0, "Amount too small");
        
        uint256 blockNumber = block.number;
        bytes32 requestHash = getRequestHash(msg.sender, shares, amount, blockNumber);
        
        // Store request
        withdrawalQueue[requestHash] = WithdrawalRequest({
            user: msg.sender,
            shares: shares,
            amount: amount,
            blockNumber: blockNumber,
            isApproved: false
        });
        
        // Track user's requests
        userRequests[msg.sender].push(requestHash);
        
        // Burn shares immediately
        _transferAndBurnShares(msg.sender, shares);
        
        emit WithdrawalRequested(msg.sender, requestHash, shares, amount, blockNumber);
    }
    
    function _approveWithdrawal(bytes32 requestHash) internal {
        WithdrawalRequest storage request = withdrawalQueue[requestHash];
        require(request.user != address(0), "Request not found");
        require(!request.isApproved, "Already approved");
        
        request.isApproved = true;
        
        emit WithdrawalApproved(requestHash, request.user);
    }
    
    function _approveWithdrawals(bytes32[] calldata requestHashes) internal {
        for (uint256 i = 0; i < requestHashes.length; i++) {
            _approveWithdrawal(requestHashes[i]);
        }
    }
    
    function _unstake(bytes32 requestHash) internal {
        WithdrawalRequest storage request = withdrawalQueue[requestHash];
        require(request.user == msg.sender, "Not your request");
        require(request.isApproved, "Not approved yet");
        
        uint256 amount = request.amount;
        
        // Delete request from queue
        delete withdrawalQueue[requestHash];
        
        // Transfer tokens
        _transferAssets(msg.sender, amount);
        
        emit WithdrawalCompleted(requestHash, msg.sender, amount);
    }
    
    // ═══════════════════════════════════════════════════════════════════
    // ABSTRACT FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════
    
    function _getExchangeRate() internal view virtual returns (uint256);
    function _getUserShares(address user) internal view virtual returns (uint256);
    function _transferAndBurnShares(address user, uint256 shares) internal virtual;
    function _transferAssets(address user, uint256 assets) internal virtual;
} 
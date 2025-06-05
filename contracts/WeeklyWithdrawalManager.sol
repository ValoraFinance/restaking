// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title WeeklyWithdrawalManager
 * @dev Simple weekly withdrawal system with batch approval - IMMUTABLE VERSION
 * 
 * How it works:
 * 1. One day per week = submission window (e.g., Monday)
 * 2. All requests form a batch with unique hash
 * 3. Tokens are unstaked from native chain during the week
 * 4. Admin approves batch when tokens are ready
 * 5. Users can withdraw only after admin approval
 * 
 * SECURITY: This contract is NOT upgradeable for maximum security and trust.
 * Once deployed, the withdrawal logic cannot be changed.
 * 
 * NOTE: This contract expects the inheriting contract to provide:
 * - nonReentrant modifier (from ReentrancyGuard)
 * - onlyOwner modifier (from Ownable)
 */
abstract contract WeeklyWithdrawalManager {
    
    // ═══════════════════════════════════════════════════════════════════
    // CONSTANTS & STORAGE
    // ═══════════════════════════════════════════════════════════════════
    
    uint256 public constant WEEK_DURATION = 7 days;
    uint256 public constant SUBMISSION_WINDOW = 1 days; // Monday only
    
    struct WithdrawalBatch {
        bytes32 batchHash;                      // Unique hash for this batch
        uint256 totalAmount;                    // Total CELL amount for this batch
        uint256 totalShares;                    // Total shares burned
        uint256 requestCount;                   // Number of requests
        uint256 submissionDeadline;             // When submissions close
        bool isApproved;                        // Admin approved this batch
        mapping(address => uint256) userAmounts; // user => fixed CELL amount
        mapping(address => bool) hasWithdrawn;   // user => withdrawal status
        address[] requesters;                    // List of users who requested
    }
    
    mapping(uint256 => WithdrawalBatch) public withdrawalBatches; // week => batch
    mapping(bytes32 => uint256) public batchHashToWeek;           // hash => week
    mapping(address => uint256) public userActiveWeek;            // user => week (only one active request)
    
    uint256 public currentWeek;
    uint256 public deploymentTime;
    bool private initialized;
    
    // ═══════════════════════════════════════════════════════════════════
    // EVENTS
    // ═══════════════════════════════════════════════════════════════════
    
    event WithdrawalRequested(
        address indexed user, 
        uint256 indexed week, 
        bytes32 indexed batchHash,
        uint256 shares, 
        uint256 amount
    );
    
    event BatchCreated(
        uint256 indexed week, 
        bytes32 indexed batchHash, 
        uint256 totalAmount, 
        uint256 requestCount
    );
    
    event BatchApproved(
        uint256 indexed week, 
        bytes32 indexed batchHash, 
        uint256 totalAmount
    );
    
    event WithdrawalCompleted(
        address indexed user, 
        uint256 indexed week, 
        bytes32 indexed batchHash,
        uint256 amount
    );
    
    // ═══════════════════════════════════════════════════════════════════
    // INITIALIZATION (ONE-TIME ONLY)
    // ═══════════════════════════════════════════════════════════════════
    
    function _initializeWithdrawalManager() internal {
        require(!initialized, "Already initialized");
        deploymentTime = block.timestamp;
        currentWeek = _getCurrentWeek();
        initialized = true;
    }
    
    // ═══════════════════════════════════════════════════════════════════
    // USER FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════
    
    /**
     * @dev Submit withdrawal request (only during submission window)
     * @notice This function must be overridden with proper modifiers
     */
    function requestWithdrawal(uint256 shares) external virtual;
    
    /**
     * @dev Complete withdrawal (only after admin approval) 
     * @notice This function must be overridden with proper modifiers
     */
    function completeWithdrawal() external virtual;
    
    // ═══════════════════════════════════════════════════════════════════
    // ADMIN FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════
    
    /**
     * @dev Approve specific batch by hash (ONLY APPROVAL FUNCTION)
     * @param batchHash Cryptographic hash of the batch to approve
     * 
     * This provides cryptographic proof that exact batch was approved.
     * Hash contains: week, totalAmount, requestCount, timestamp, block data
     * Once hash is approved, all users in that batch can withdraw their fixed amounts.
     * @notice This function must be overridden with proper modifiers
     */
    function approveBatchByHash(bytes32 batchHash) external virtual;
    
    /**
     * @dev Move to next week (call after submission window closes)
     * @notice This function must be overridden with proper modifiers
     */
    function moveToNextWeek() external virtual;
    
    // ═══════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════
    
    function getBatchInfo(uint256 week) external view returns (
        bytes32 batchHash,
        uint256 totalAmount,
        uint256 totalShares,
        uint256 requestCount,
        uint256 submissionDeadline,
        bool isApproved
    ) {
        WithdrawalBatch storage batch = withdrawalBatches[week];
        return (
            batch.batchHash,
            batch.totalAmount,
            batch.totalShares,
            batch.requestCount,
            batch.submissionDeadline,
            batch.isApproved
        );
    }
    
    /**
     * @dev Get detailed batch information by hash
     * @param batchHash Hash of the batch to query
     * @return week Week number, totalAmount Total CELL amount, isApproved Approval status
     */
    function getBatchInfoByHash(bytes32 batchHash) external view returns (
        uint256 week,
        uint256 totalAmount,
        uint256 requestCount,
        bool isApproved
    ) {
        week = batchHashToWeek[batchHash];
        if (week == 0) return (0, 0, 0, false);
        
        WithdrawalBatch storage batch = withdrawalBatches[week];
        return (week, batch.totalAmount, batch.requestCount, batch.isApproved);
    }
    
    /**
     * @dev Verify if a batch hash is valid and matches stored data
     * @param batchHash Hash to verify
     * @return isValid True if hash matches the stored batch data
     */
    function verifyBatchHash(bytes32 batchHash) external view returns (bool isValid) {
        uint256 week = batchHashToWeek[batchHash];
        if (week == 0) return false;
        
        WithdrawalBatch storage batch = withdrawalBatches[week];
        return batch.batchHash == batchHash;
    }
    
    /**
     * @dev Check if user can withdraw from a specific batch hash
     * @param user User address
     * @param batchHash Batch hash to check
     * @return canWithdraw True if user can withdraw from this batch
     * @return amount Amount user can withdraw
     */
    function canUserWithdrawFromBatch(address user, bytes32 batchHash) external view returns (
        bool canWithdraw, 
        uint256 amount
    ) {
        uint256 week = batchHashToWeek[batchHash];
        if (week == 0) return (false, 0);
        
        WithdrawalBatch storage batch = withdrawalBatches[week];
        amount = batch.userAmounts[user];
        canWithdraw = batch.isApproved && !batch.hasWithdrawn[user] && amount > 0;
    }
    
    function getUserRequest(address user) external view returns (
        uint256 week,
        uint256 amount,
        bool hasWithdrawn,
        bool canWithdraw
    ) {
        week = userActiveWeek[user];
        if (week == 0) return (0, 0, false, false);
        
        WithdrawalBatch storage batch = withdrawalBatches[week];
        amount = batch.userAmounts[user];
        hasWithdrawn = batch.hasWithdrawn[user];
        canWithdraw = batch.isApproved && !hasWithdrawn && amount > 0;
    }
    
    function getBatchRequesters(uint256 week) external view returns (address[] memory) {
        return withdrawalBatches[week].requesters;
    }
    
    function isSubmissionWindowOpen() external view returns (bool) {
        return _isSubmissionWindowOpen();
    }
    
    function getTimeUntilNextWindow() external view returns (uint256) {
        if (_isSubmissionWindowOpen()) return 0;
        
        uint256 nextWeekStart = _getWeekStart(currentWeek + 1);
        if (block.timestamp >= nextWeekStart) return 0;
        return nextWeekStart - block.timestamp;
    }
    
    // ═══════════════════════════════════════════════════════════════════
    // INTERNAL FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════
    
    function _initializeBatch(uint256 week) internal {
        uint256 weekStart = _getWeekStart(week);
        withdrawalBatches[week].submissionDeadline = weekStart + SUBMISSION_WINDOW;
    }
    
    function _generateBatchHash(uint256 week, uint256 totalAmount, uint256 requestCount) internal view returns (bytes32) {
        return keccak256(abi.encodePacked(
            week,
            totalAmount,
            requestCount,
            block.timestamp,
            block.prevrandao
        ));
    }
    
    function _getCurrentWeek() internal view returns (uint256) {
        return (block.timestamp - deploymentTime) / WEEK_DURATION;
    }
    
    function _getWeekStart(uint256 week) internal view returns (uint256) {
        return deploymentTime + (week * WEEK_DURATION);
    }
    
    function _isSubmissionWindowOpen() internal view returns (bool) {
        uint256 weekStart = _getWeekStart(currentWeek);
        return block.timestamp >= weekStart && block.timestamp <= weekStart + SUBMISSION_WINDOW;
    }
    
    // ═══════════════════════════════════════════════════════════════════
    // INTERNAL FUNCTIONS FOR LOGIC
    // ═══════════════════════════════════════════════════════════════════
    
    function _requestWithdrawal(uint256 shares) internal {
        require(shares > 0, "Shares must be greater than 0");
        require(_getUserShares(msg.sender) >= shares, "Insufficient shares");
        require(_isSubmissionWindowOpen(), "Submission window is closed");
        require(userActiveWeek[msg.sender] == 0, "Already have active request");
        
        uint256 week = currentWeek;
        WithdrawalBatch storage batch = withdrawalBatches[week];
        
        // Initialize batch if first request
        if (batch.submissionDeadline == 0) {
            _initializeBatch(week);
        }
        
        require(block.timestamp <= batch.submissionDeadline, "Submissions closed for this week");
        
        // Calculate fixed amount at current exchange rate
        uint256 amount = (shares * _getExchangeRate()) / 1e18;
        require(amount > 0, "Amount too small");
        
        // Add to batch
        batch.totalAmount += amount;
        batch.totalShares += shares;
        batch.requestCount++;
        batch.userAmounts[msg.sender] = amount;
        batch.requesters.push(msg.sender);
        
        // Track user's active week
        userActiveWeek[msg.sender] = week;
        
        // Burn shares immediately
        _transferAndBurnShares(msg.sender, shares);
        
        // Generate/update batch hash
        batch.batchHash = _generateBatchHash(week, batch.totalAmount, batch.requestCount);
        batchHashToWeek[batch.batchHash] = week;
        
        emit WithdrawalRequested(msg.sender, week, batch.batchHash, shares, amount);
    }
    
    function _completeWithdrawal() internal {
        uint256 week = userActiveWeek[msg.sender];
        require(week > 0, "No active withdrawal request");
        require(week < currentWeek, "Week not finished yet");
        
        WithdrawalBatch storage batch = withdrawalBatches[week];
        require(batch.isApproved, "Batch not approved yet");
        require(batch.userAmounts[msg.sender] > 0, "No amount to withdraw");
        require(!batch.hasWithdrawn[msg.sender], "Already withdrawn");
        
        uint256 amount = batch.userAmounts[msg.sender];
        batch.hasWithdrawn[msg.sender] = true;
        userActiveWeek[msg.sender] = 0; // Clear active week
        
        _transferAssets(msg.sender, amount);
        
        emit WithdrawalCompleted(msg.sender, week, batch.batchHash, amount);
    }
    
    function _approveBatchByHash(bytes32 batchHash) internal {
        uint256 week = batchHashToWeek[batchHash];
        require(week > 0, "Invalid batch hash");
        require(week < currentWeek, "Week not finished yet");
        
        WithdrawalBatch storage batch = withdrawalBatches[week];
        require(batch.totalAmount > 0, "No batch to approve");
        require(!batch.isApproved, "Already approved");
        require(batch.batchHash == batchHash, "Hash mismatch"); // Extra security check
        
        batch.isApproved = true;
        
        emit BatchApproved(week, batchHash, batch.totalAmount);
    }
    
    function _moveToNextWeek() internal {
        require(!_isSubmissionWindowOpen(), "Submission window still open");
        
        uint256 week = currentWeek;
        WithdrawalBatch storage batch = withdrawalBatches[week];
        
        if (batch.totalAmount > 0) {
            // Finalize current batch
            emit BatchCreated(week, batch.batchHash, batch.totalAmount, batch.requestCount);
            
            // Initiate unstaking from native chain
            _initiateNativeUnstaking(batch.totalAmount);
        }
        
        currentWeek++;
    }
    
    // ═══════════════════════════════════════════════════════════════════
    // ABSTRACT FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════
    
    function _getExchangeRate() internal view virtual returns (uint256);
    function _getUserShares(address user) internal view virtual returns (uint256);
    function _transferAndBurnShares(address user, uint256 shares) internal virtual;
    function _transferAssets(address user, uint256 assets) internal virtual;
    function _initiateNativeUnstaking(uint256 amount) internal virtual;
} 
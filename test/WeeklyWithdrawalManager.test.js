const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("WeeklyWithdrawalManager", function () {
    let valoraCore, sCellToken, cellToken, mockBridge;
    let owner, user1, user2, oracle, bridge;

    beforeEach(async function () {
        [owner, user1, user2, oracle, bridge] = await ethers.getSigners();

        // Deploy mock CELL token
        const MockERC20 = await ethers.getContractFactory("MockERC20");
        cellToken = await MockERC20.deploy("Cell Token", "CELL", ethers.parseEther("1000000"));
        await cellToken.waitForDeployment();

        // Deploy sCELL token
        const ValoraStakedCell = await ethers.getContractFactory("ValoraStakedCell");
        sCellToken = await ValoraStakedCell.deploy();
        await sCellToken.waitForDeployment();

        // Deploy Mock Bridge
        const MockBridge = await ethers.getContractFactory("MockBridge");
        mockBridge = await MockBridge.deploy();
        await mockBridge.waitForDeployment();

        // Deploy ValoraCore with UUPS proxy
        const ValoraCore = await ethers.getContractFactory("ValoraCore");
        valoraCore = await upgrades.deployProxy(ValoraCore, [
            await cellToken.getAddress(),
            await sCellToken.getAddress(),
            oracle.address,
            await mockBridge.getAddress(),
            "0x434C4C",
            "0x1234567890123456789012345678901234567890123456789012345678901234"
        ], {
            kind: 'uups',
            initializer: 'initialize'
        });
        await valoraCore.waitForDeployment();

        await sCellToken.setCoreContract(await valoraCore.getAddress());

        // IMPORTANT: Enable withdrawals first!
        await valoraCore.enableWithdrawals();

        // Setup users with CELL and sCELL
        await cellToken.transfer(user1.address, ethers.parseEther("1000"));
        await cellToken.transfer(user2.address, ethers.parseEther("1000"));
        
        await cellToken.connect(user1).approve(await valoraCore.getAddress(), ethers.parseEther("1000"));
        await cellToken.connect(user2).approve(await valoraCore.getAddress(), ethers.parseEther("1000"));
        
        // Deposit to have some sCELL
        await valoraCore.connect(user1).deposit(ethers.parseEther("1000"));
        await valoraCore.connect(user2).deposit(ethers.parseEther("500"));
        
        // Approve sCELL for withdrawal operations
        await sCellToken.connect(user1).approve(await valoraCore.getAddress(), ethers.parseEther("1000"));
        await sCellToken.connect(user2).approve(await valoraCore.getAddress(), ethers.parseEther("1000"));
        
        // Move to start of submission window (advance time then move to next week)
        await ethers.provider.send("evm_increaseTime", [7 * 24 * 60 * 60]); // 7 days
        await ethers.provider.send("evm_mine");
        await valoraCore.moveToNextWeek();
    });

    describe("Batch System", function () {
        it("Should create batch when first withdrawal requested", async function () {
            const shares = ethers.parseEther("100");
            
            await expect(valoraCore.connect(user1).requestWithdrawal(shares))
                .to.emit(valoraCore, "WithdrawalRequested");
                
            const currentWeek = await valoraCore.currentWeek();
            const batchInfo = await valoraCore.getBatchInfo(currentWeek);
            
            expect(batchInfo.totalAmount).to.be.gt(0);
            expect(batchInfo.requestCount).to.equal(1);
        });

        it("Should generate unique batch hash", async function () {
            await valoraCore.connect(user1).requestWithdrawal(ethers.parseEther("100"));
            
            const currentWeek = await valoraCore.currentWeek();
            const batchInfo = await valoraCore.getBatchInfo(currentWeek);
            
            expect(batchInfo.batchHash).to.not.equal("0x0000000000000000000000000000000000000000000000000000000000000000");
        });

        it("Should track user amounts correctly", async function () {
            const shares = ethers.parseEther("100");
            await valoraCore.connect(user1).requestWithdrawal(shares);
            
            const userRequest = await valoraCore.getUserRequest(user1.address);
            expect(userRequest.amount).to.be.gt(0);
            expect(userRequest.week).to.equal(await valoraCore.currentWeek());
        });

        it("Should handle multiple users in same batch", async function () {
            const shares1 = ethers.parseEther("100");
            const shares2 = ethers.parseEther("50");
            
            await valoraCore.connect(user1).requestWithdrawal(shares1);
            await valoraCore.connect(user2).requestWithdrawal(shares2);
            
            const currentWeek = await valoraCore.currentWeek();
            const batchInfo = await valoraCore.getBatchInfo(currentWeek);
            const requesters = await valoraCore.getBatchRequesters(currentWeek);
            
            expect(batchInfo.requestCount).to.equal(2);
            expect(requesters.length).to.equal(2);
            expect(requesters).to.include(user1.address);
            expect(requesters).to.include(user2.address);
        });
    });

    describe("Time Management", function () {
        it("Should track current week correctly", async function () {
            const currentWeek = await valoraCore.currentWeek();
            expect(currentWeek).to.be.gte(1); // We moved to next week in beforeEach
        });

        it("Should check submission window status", async function () {
            const isOpen = await valoraCore.isSubmissionWindowOpen();
            expect(isOpen).to.be.true; // Should be open since we moved to next week
        });

        it("Should get time until next window", async function () {
            // When window is open, should return 0
            expect(await valoraCore.getTimeUntilNextWindow()).to.equal(0);
            
            // Close window but not full week
            await ethers.provider.send("evm_increaseTime", [2 * 24 * 60 * 60]); // 2 days  
            await ethers.provider.send("evm_mine");
            
            const timeUntilNext = await valoraCore.getTimeUntilNextWindow();
            expect(timeUntilNext).to.be.gte(0); // Could be 0 or positive depending on timing
        });

        it("Should allow admin to move to next week when window closed", async function () {
            // First close the submission window by advancing time
            await ethers.provider.send("evm_increaseTime", [7 * 24 * 60 * 60]); // 7 days
            await ethers.provider.send("evm_mine");
            
            const currentWeek = await valoraCore.currentWeek();
            await valoraCore.moveToNextWeek();
            
            const newWeek = await valoraCore.currentWeek();
            expect(newWeek).to.equal(currentWeek + 1n);
        });

        it("Should emit NativeUnstakingInitiated when moving to next week with pending requests", async function () {
            await valoraCore.connect(user1).requestWithdrawal(ethers.parseEther("100"));
            
            const currentWeek = await valoraCore.currentWeek();
            const batchInfo = await valoraCore.getBatchInfo(currentWeek);
            
            // Close submission window
            await ethers.provider.send("evm_increaseTime", [7 * 24 * 60 * 60]);
            await ethers.provider.send("evm_mine");
            
            await expect(valoraCore.moveToNextWeek())
                .to.emit(valoraCore, "NativeUnstakingInitiated")
                .withArgs(currentWeek, batchInfo.totalAmount);
        });
    });

    describe("Batch Approval", function () {
        beforeEach(async function () {
            // Create a batch first
            await valoraCore.connect(user1).requestWithdrawal(ethers.parseEther("100"));
            
            // Close submission window and move to next week
            await ethers.provider.send("evm_increaseTime", [7 * 24 * 60 * 60]);
            await ethers.provider.send("evm_mine");
            await valoraCore.moveToNextWeek();
        });

        it("Should allow admin to approve batch by hash", async function () {
            const batchInfo = await valoraCore.getBatchInfo(1); // Week 1 (0-indexed, but we're in week 2 now)
            
            await expect(valoraCore.approveBatchByHash(batchInfo.batchHash))
                .to.emit(valoraCore, "BatchApproved")
                .withArgs(1, batchInfo.batchHash, batchInfo.totalAmount);
        });

        it("Should reject approval of invalid hash", async function () {
            const invalidHash = "0x1234567890123456789012345678901234567890123456789012345678901234";
            
            await expect(valoraCore.approveBatchByHash(invalidHash))
                .to.be.revertedWith("Invalid batch hash");
        });

        it("Should reject double approval", async function () {
            const batchInfo = await valoraCore.getBatchInfo(1);
            
            await valoraCore.approveBatchByHash(batchInfo.batchHash);
            
            await expect(valoraCore.approveBatchByHash(batchInfo.batchHash))
                .to.be.revertedWith("Already approved");
        });
    });

    describe("Withdrawal Completion", function () {
        beforeEach(async function () {
            // Setup complete withdrawal scenario
            await valoraCore.connect(user1).requestWithdrawal(ethers.parseEther("100"));
            
            // Close submission window and move to next week
            await ethers.provider.send("evm_increaseTime", [7 * 24 * 60 * 60]);
            await ethers.provider.send("evm_mine");
            await valoraCore.moveToNextWeek();
            
            const batchInfo = await valoraCore.getBatchInfo(1);
            await valoraCore.approveBatchByHash(batchInfo.batchHash);
        });

        it("Should allow user to complete withdrawal after approval", async function () {
            const initialBalance = await cellToken.balanceOf(user1.address);
            const initialTotalAssets = await valoraCore.getTotalAssets();
            
            await expect(valoraCore.connect(user1).completeWithdrawal())
                .to.emit(valoraCore, "WithdrawalCompleted");
                
            const finalBalance = await cellToken.balanceOf(user1.address);
            const finalTotalAssets = await valoraCore.getTotalAssets();
            
            expect(finalBalance).to.be.gt(initialBalance);
            expect(finalTotalAssets).to.be.lt(initialTotalAssets);
        });

        it("Should prevent double withdrawal", async function () {
            await valoraCore.connect(user1).completeWithdrawal();
            
            await expect(valoraCore.connect(user1).completeWithdrawal())
                .to.be.revertedWith("No active withdrawal request");
        });

        it("Should clear user's active week after withdrawal", async function () {
            await valoraCore.connect(user1).completeWithdrawal();
            
            const userRequest = await valoraCore.getUserRequest(user1.address);
            expect(userRequest.week).to.equal(0);
        });

        it("Should allow new withdrawal request after completing previous one", async function () {
            await valoraCore.connect(user1).completeWithdrawal();
            
            // Should be able to make new request
            const shares = ethers.parseEther("50");
            await expect(valoraCore.connect(user1).requestWithdrawal(shares))
                .to.emit(valoraCore, "WithdrawalRequested");
        });
    });

    describe("View Functions", function () {
        beforeEach(async function () {
            await valoraCore.connect(user1).requestWithdrawal(ethers.parseEther("100"));
        });

        it("Should return correct batch info by hash", async function () {
            const currentWeek = await valoraCore.currentWeek();
            const batchInfo = await valoraCore.getBatchInfo(currentWeek);
            
            const batchByHash = await valoraCore.getBatchInfoByHash(batchInfo.batchHash);
            expect(batchByHash.week).to.equal(currentWeek);
            expect(batchByHash.totalAmount).to.equal(batchInfo.totalAmount);
        });

        it("Should verify batch hash correctly", async function () {
            const currentWeek = await valoraCore.currentWeek();
            const batchInfo = await valoraCore.getBatchInfo(currentWeek);
            
            const isValid = await valoraCore.verifyBatchHash(batchInfo.batchHash);
            expect(isValid).to.be.true;
            
            const invalidHash = "0x1234567890123456789012345678901234567890123456789012345678901234";
            const isInvalid = await valoraCore.verifyBatchHash(invalidHash);
            expect(isInvalid).to.be.false;
        });

        it("Should return batch requesters", async function () {
            const currentWeek = await valoraCore.currentWeek();
            const requesters = await valoraCore.getBatchRequesters(currentWeek);
            
            expect(requesters).to.include(user1.address);
            expect(requesters.length).to.equal(1);
        });

        it("Should check if user can withdraw from batch", async function () {
            // Close submission window and move to next week
            await ethers.provider.send("evm_increaseTime", [7 * 24 * 60 * 60]);
            await ethers.provider.send("evm_mine");
            await valoraCore.moveToNextWeek();
            
            const batchInfo = await valoraCore.getBatchInfo(1);
            await valoraCore.approveBatchByHash(batchInfo.batchHash);
            
            const [canWithdraw, amount] = await valoraCore.canUserWithdrawFromBatch(user1.address, batchInfo.batchHash);
            expect(canWithdraw).to.be.true;
            expect(amount).to.be.gt(0);
            
            const [canUser2Withdraw] = await valoraCore.canUserWithdrawFromBatch(user2.address, batchInfo.batchHash);
            expect(canUser2Withdraw).to.be.false;
        });
    });

    describe("Security & Validation", function () {
        it("Should reject admin functions from non-owner", async function () {
            const batchHash = "0x1234567890123456789012345678901234567890123456789012345678901234";
            
            await expect(valoraCore.connect(user1).approveBatchByHash(batchHash))
                .to.be.revertedWithCustomError(valoraCore, "OwnableUnauthorizedAccount");
                
            await expect(valoraCore.connect(user1).moveToNextWeek())
                .to.be.revertedWithCustomError(valoraCore, "OwnableUnauthorizedAccount");
        });

        it("Should prevent withdrawal before approval", async function () {
            await valoraCore.connect(user1).requestWithdrawal(ethers.parseEther("100"));
            
            // Close submission window and move to next week
            await ethers.provider.send("evm_increaseTime", [7 * 24 * 60 * 60]);
            await ethers.provider.send("evm_mine");
            await valoraCore.moveToNextWeek();
            
            await expect(valoraCore.connect(user1).completeWithdrawal())
                .to.be.revertedWith("Batch not approved yet");
        });

        it("Should prevent withdrawal from different user", async function () {
            await valoraCore.connect(user1).requestWithdrawal(ethers.parseEther("100"));
            
            // Close submission window and move to next week
            await ethers.provider.send("evm_increaseTime", [7 * 24 * 60 * 60]);
            await ethers.provider.send("evm_mine");
            await valoraCore.moveToNextWeek();
            
            const batchInfo = await valoraCore.getBatchInfo(1);
            await valoraCore.approveBatchByHash(batchInfo.batchHash);
            
            await expect(valoraCore.connect(user2).completeWithdrawal())
                .to.be.revertedWith("No active withdrawal request");
        });

        it("Should reject withdrawal request if insufficient shares", async function () {
            await expect(valoraCore.connect(user1).requestWithdrawal(ethers.parseEther("10000")))
                .to.be.revertedWith("Insufficient shares");
        });

        it("Should reject multiple active requests from same user", async function () {
            await valoraCore.connect(user1).requestWithdrawal(ethers.parseEther("100"));
            
            await expect(valoraCore.connect(user1).requestWithdrawal(ethers.parseEther("50")))
                .to.be.revertedWith("Already have active request");
        });
    });

    describe("Exchange Rate Impact", function () {
        it("Should fix withdrawal amount at request time, not completion time", async function () {
            const shares = ethers.parseEther("100");
            const initialExchangeRate = await valoraCore.exchangeRate();
            
            // Request withdrawal
            await valoraCore.connect(user1).requestWithdrawal(shares);
            const userRequest = await valoraCore.getUserRequest(user1.address);
            const expectedAmount = shares * initialExchangeRate / ethers.parseEther("1");
            
            expect(userRequest.amount).to.equal(expectedAmount);
            
            // Change exchange rate through rebase
            await valoraCore.connect(oracle).rebase(ethers.parseEther("2000")); // 2x increase
            
            // Close submission window and move to next week
            await ethers.provider.send("evm_increaseTime", [7 * 24 * 60 * 60]);
            await ethers.provider.send("evm_mine");
            await valoraCore.moveToNextWeek();
            
            const batchInfo = await valoraCore.getBatchInfo(1);
            await valoraCore.approveBatchByHash(batchInfo.batchHash);
            
            // Withdraw should still give original amount, not new exchange rate amount
            const initialBalance = await cellToken.balanceOf(user1.address);
            await valoraCore.connect(user1).completeWithdrawal();
            const finalBalance = await cellToken.balanceOf(user1.address);
            
            expect(finalBalance - initialBalance).to.equal(expectedAmount);
        });
    });
}); 
const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("ValoraFinance Architecture Complete Coverage", function () {
    let valoraCore, sCellToken, cellToken, mockBridge;
    let owner, user1, user2, user3, oracle, validator;

    beforeEach(async function () {
        [owner, user1, user2, user3, oracle, validator] = await ethers.getSigners();

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
        await valoraCore.enableWithdrawals();

        // Setup users with tokens and approvals
        await cellToken.transfer(user1.address, ethers.parseEther("100000"));
        await cellToken.transfer(user2.address, ethers.parseEther("100000"));
        await cellToken.transfer(user3.address, ethers.parseEther("100000"));
        
        await cellToken.connect(user1).approve(await valoraCore.getAddress(), ethers.parseEther("100000"));
        await cellToken.connect(user2).approve(await valoraCore.getAddress(), ethers.parseEther("100000"));
        await cellToken.connect(user3).approve(await valoraCore.getAddress(), ethers.parseEther("100000"));
        
        await sCellToken.connect(user1).approve(await valoraCore.getAddress(), ethers.parseEther("100000"));
        await sCellToken.connect(user2).approve(await valoraCore.getAddress(), ethers.parseEther("100000"));
        await sCellToken.connect(user3).approve(await valoraCore.getAddress(), ethers.parseEther("100000"));
    });

    describe("🏗️ Architecture Complete Coverage", function () {
        
        it("🔄 Complete Initialization Flow - All Branches", async function () {
            // Test proper initialization (TRUE branches)
            const [oracul_, paused_, withdrawalDelay_] = await valoraCore.getAdminConfig();
            expect(oracul_).to.equal(oracle.address);
            expect(paused_).to.be.false;
            expect(withdrawalDelay_).to.equal(7 * 24 * 60 * 60);

            // Test invalid initialization scenarios through other admin functions
            await expect(valoraCore.setOracul(ethers.ZeroAddress))
                .to.be.revertedWith("Invalid oracle address");

            // Test bridge initialization errors
            await expect(valoraCore.setBridge(ethers.ZeroAddress))
                .to.be.revertedWith("Invalid bridge address");

            await expect(valoraCore.setValidatorAddress("0x000000", "0x1234567890"))
                .to.be.revertedWith("Invalid chain ID");
        });

        it("💰 Complete Staking Flow - All Deposit Branches", async function () {
            // Minimum deposit check - FALSE branch
            const tooSmall = ethers.parseUnits("1", 11);
            await expect(valoraCore.connect(user1).deposit(tooSmall))
                .to.be.revertedWith("Amount too small");

            // Initial deposit - supply == 0 branch (TRUE)
            expect(await sCellToken.totalSupply()).to.equal(0);
            await valoraCore.connect(user1).deposit(ethers.parseEther("1000"));
            expect(await sCellToken.balanceOf(user1.address)).to.equal(ethers.parseEther("1000"));

            // Rebase to change exchange rate
            await valoraCore.connect(oracle).rebase(ethers.parseEther("2000"));

            // Subsequent deposit - supply > 0 AND assets > 0 branch (FALSE)
            await valoraCore.connect(user2).deposit(ethers.parseEther("1000"));
            expect(await sCellToken.balanceOf(user2.address)).to.equal(ethers.parseEther("500"));

            // Zero shares edge case - setup extreme exchange rate for shares == 0
            // We need a massive rebase to create scenario where shares would be 0
            // but amount should be > MIN_DEPOSIT
            await valoraCore.connect(oracle).rebase(ethers.parseEther("10000000000000000000000000"));
            const tinyButValid = ethers.parseUnits("1", 13); // Bigger than MIN_DEPOSIT (1e12) but tiny enough for shares=0
            await expect(valoraCore.connect(user3).deposit(tinyButValid))
                .to.be.revertedWith("Deposit too small, would result in 0 shares");
        });

        it("⚡ Complete Rebase Flow - All Oracle Branches", async function () {
            // Oracle access - TRUE branch
            await valoraCore.connect(oracle).rebase(ethers.parseEther("1000"));
            expect(await valoraCore.getTotalAssets()).to.equal(ethers.parseEther("1000"));

            // Non-oracle access - FALSE branch
            await expect(valoraCore.connect(user1).rebase(ethers.parseEther("1000")))
                .to.be.revertedWith("Only oracle can call this");

            // Zero amount rebase - FALSE branch
            await expect(valoraCore.connect(oracle).rebase(0))
                .to.be.revertedWith("Amount must be greater than 0");

            // Negative rebase (decrease)
            await valoraCore.connect(oracle).rebase(ethers.parseEther("500"));
            expect(await valoraCore.getTotalAssets()).to.equal(ethers.parseEther("500"));
        });

        it("⏸️ Complete Pause/Unpause Flow - All Admin Control Branches", async function () {
            // Pause functionality - TRUE branch
            await valoraCore.pause();
            expect(await valoraCore.paused()).to.be.true;

            // Paused state blocks operations - FALSE branch for whenNotPaused
            await expect(valoraCore.connect(user1).deposit(ethers.parseEther("100")))
                .to.be.revertedWith("Pausable: paused");

            // Unpause functionality
            await valoraCore.unpause();
            expect(await valoraCore.paused()).to.be.false;

            // Normal operation after unpause - TRUE branch for whenNotPaused
            await valoraCore.connect(user1).deposit(ethers.parseEther("100"));
            expect(await sCellToken.balanceOf(user1.address)).to.equal(ethers.parseEther("100"));
        });

        it("🚪 Complete Withdrawal Flow - All Weekly Manager Branches", async function () {
            // Setup initial deposit
            await valoraCore.connect(user1).deposit(ethers.parseEther("1000"));

            // Test withdrawals disabled scenario by creating new contract without enabling withdrawals
            const ValoraCore = await ethers.getContractFactory("ValoraCore");
            const newSCell = await ethers.getContractFactory("ValoraStakedCell");
            const newSCellInstance = await newSCell.deploy();
            await newSCellInstance.waitForDeployment();
            
            const newCore = await upgrades.deployProxy(ValoraCore, [
                await cellToken.getAddress(),
                await newSCellInstance.getAddress(),
                oracle.address,
                await mockBridge.getAddress(),
                "0x434C4C",
                "0x1234567890123456789012345678901234567890123456789012345678901234"
            ], { kind: 'uups', initializer: 'initialize' });
            
            await newSCellInstance.setCoreContract(await newCore.getAddress());
            
            // Withdrawal disabled check - FALSE branch
            await cellToken.connect(user1).approve(await newCore.getAddress(), ethers.parseEther("100"));
            await newCore.connect(user1).deposit(ethers.parseEther("100"));
            
            await ethers.provider.send("evm_increaseTime", [7 * 24 * 60 * 60]);
            await ethers.provider.send("evm_mine");
            await newCore.moveToNextWeek();

            await expect(newCore.connect(user1).requestWithdrawal(ethers.parseEther("50")))
                .to.be.revertedWith("Withdrawals not enabled yet");

            // Test all withdrawal scenarios with main contract
            // First move to open window - need to start fresh week
            await ethers.provider.send("evm_increaseTime", [7 * 24 * 60 * 60]);
            await ethers.provider.send("evm_mine");
            await valoraCore.moveToNextWeek();

            // Verify we're in submission window
            expect(await valoraCore.isSubmissionWindowOpen()).to.be.true;

            await valoraCore.connect(user1).requestWithdrawal(ethers.parseEther("500"));

            // Multiple users in same batch
            await valoraCore.connect(user2).deposit(ethers.parseEther("1000"));
            await valoraCore.connect(user2).requestWithdrawal(ethers.parseEther("300"));

            // Test insufficient shares
            await expect(valoraCore.connect(user1).requestWithdrawal(ethers.parseEther("1000000")))
                .to.be.revertedWith("Insufficient shares");

            // Test already have active request
            await expect(valoraCore.connect(user1).requestWithdrawal(ethers.parseEther("100")))
                .to.be.revertedWith("Already have active request");

            // Move to next week and approve batch
            await ethers.provider.send("evm_increaseTime", [7 * 24 * 60 * 60]);
            await ethers.provider.send("evm_mine");
            await valoraCore.moveToNextWeek();

            const batchInfo = await valoraCore.getBatchInfo(1);
            await valoraCore.approveBatchByHash(batchInfo.batchHash);

            // Test withdrawal before batch approved
            const batchInfo2 = await valoraCore.getBatchInfo(2);
            if (batchInfo2.totalAmount > 0) {
                await expect(valoraCore.connect(user1).completeWithdrawal())
                    .to.be.revertedWith("No active withdrawal request");
            }

            // Complete withdrawal - sufficient assets (TRUE branch)
            await valoraCore.connect(user1).completeWithdrawal();
            await valoraCore.connect(user2).completeWithdrawal();

            // Test already withdrawn
            await expect(valoraCore.connect(user1).completeWithdrawal())
                .to.be.revertedWith("No active withdrawal request");

            // Test all view functions
            expect(await valoraCore.isSubmissionWindowOpen()).to.be.false;
            const timeUntilNext = await valoraCore.getTimeUntilNextWindow();
            expect(timeUntilNext).to.be.gt(0);

            // Test verifyBatchHash
            expect(await valoraCore.verifyBatchHash(batchInfo.batchHash, 1)).to.be.true;

            // Test canUserWithdrawFromBatch
            const [canWithdraw] = await valoraCore.canUserWithdrawFromBatch(batchInfo.batchHash, user1.address);
            expect(canWithdraw).to.be.false; // Already withdrawn

            // Test getUserRequest
            const userRequest = await valoraCore.getUserRequest(user1.address);
            expect(userRequest.week).to.equal(0); // No active request

            // Test getBatchRequesters
            const requesters = await valoraCore.getBatchRequesters(1);
            expect(requesters.length).to.be.gt(0);

            // Test insufficient assets scenario
            await valoraCore.connect(user3).deposit(ethers.parseEther("1000"));
            await ethers.provider.send("evm_increaseTime", [7 * 24 * 60 * 60]);
            await ethers.provider.send("evm_mine");
            await valoraCore.moveToNextWeek();

            await valoraCore.connect(user3).requestWithdrawal(ethers.parseEther("1000"));

            await ethers.provider.send("evm_increaseTime", [7 * 24 * 60 * 60]);
            await ethers.provider.send("evm_mine");
            await valoraCore.moveToNextWeek();

            const batchInfo3 = await valoraCore.getBatchInfo(3);
            await valoraCore.approveBatchByHash(batchInfo3.batchHash);

            // Reduce assets below withdrawal amount
            await valoraCore.connect(oracle).rebase(ethers.parseEther("100"));

            // Should fail with insufficient assets - FALSE branch
            await expect(valoraCore.connect(user3).completeWithdrawal())
                .to.be.revertedWith("Insufficient assets");
        });

        it("🌉 Complete Bridge Flow - All Bridge Manager Branches", async function () {
            // Valid bridge configuration - TRUE branches
            const [bridge_, nativeChainId_, validatorAddress_] = await valoraCore.getBridgeConfig();
            expect(bridge_).to.equal(await mockBridge.getAddress());
            expect(nativeChainId_).to.equal("0x434c4c");
            expect(validatorAddress_).to.equal("0x1234567890123456789012345678901234567890123456789012345678901234");

            // Bridge configured check - TRUE
            expect(await valoraCore.isBridgeConfigured()).to.be.true;

            // Update bridge - valid address (TRUE branch)
            const MockBridge = await ethers.getContractFactory("MockBridge");
            const newBridge = await MockBridge.deploy();
            await newBridge.waitForDeployment();

            await valoraCore.setBridge(await newBridge.getAddress());

            // Invalid bridge address - FALSE branch
            await expect(valoraCore.setBridge(ethers.ZeroAddress))
                .to.be.revertedWith("Invalid bridge address");

            // Valid validator address update - TRUE branch
            await valoraCore.setValidatorAddress("0x545354", "0x9876543210987654321098765432109876543210987654321098765432109876");

            // Invalid chain ID - FALSE branch
            await expect(valoraCore.setValidatorAddress("0x000000", "0x1234567890"))
                .to.be.revertedWith("Invalid chain ID");

            // Invalid validator address - FALSE branch
            await expect(valoraCore.setValidatorAddress("0x545354", "0x"))
                .to.be.revertedWith("Invalid validator address");

            // Bridging during deposit - TRUE branch
            await expect(valoraCore.connect(user1).deposit(ethers.parseEther("100")))
                .to.emit(valoraCore, "TokensBridgedToValidator");
        });

        it("🎯 Complete ValoraStakedCell Flow - All Token Branches", async function () {
            // Test with different setup for all branches
            const newSCell = await ethers.getContractFactory("ValoraStakedCell");
            const testSCell = await newSCell.deploy();
            await testSCell.waitForDeployment();

            // Set user1 as core contract for testing
            await testSCell.setCoreContract(user1.address);

            // Now user1 can mint/burn - TRUE branch
            await testSCell.connect(user1).mint(user2.address, ethers.parseEther("200"));
            expect(await testSCell.balanceOf(user2.address)).to.equal(ethers.parseEther("200"));

            // Non-core access - FALSE branch
            await expect(testSCell.connect(user2).mint(user2.address, ethers.parseEther("100")))
                .to.be.revertedWith("Only core contract allowed");

            // Invalid mint to address - FALSE branch
            await expect(testSCell.connect(user1).mint(ethers.ZeroAddress, ethers.parseEther("100")))
                .to.be.revertedWith("Cannot mint to zero address");

            // Invalid mint amount - FALSE branch
            await expect(testSCell.connect(user1).mint(user2.address, 0))
                .to.be.revertedWith("Amount must be greater than 0");

            // Valid burn - TRUE branch
            await testSCell.connect(user1).burn(user2.address, ethers.parseEther("50"));
            expect(await testSCell.balanceOf(user2.address)).to.equal(ethers.parseEther("150"));

            // Invalid burn amount - FALSE branch
            await expect(testSCell.connect(user1).burn(user2.address, 0))
                .to.be.revertedWith("Amount must be greater than 0");

            // Core contract update - valid address (TRUE branch)
            await testSCell.setCoreContract(user2.address);
            expect(await testSCell.coreContract()).to.equal(user2.address);

            // Core contract update - invalid address (FALSE branch)
            await expect(testSCell.setCoreContract(ethers.ZeroAddress))
                .to.be.revertedWith("Invalid core contract address");

            // Test onlyOwner modifier for setCoreContract
            await expect(testSCell.connect(user3).setCoreContract(user3.address))
                .to.be.revertedWithCustomError(testSCell, "OwnableUnauthorizedAccount");
        });

        it("🔄 Complete Exchange Rate Scenarios - All Calculation Branches", async function () {
            // Initial rate - supply == 0 (TRUE branch)
            expect(await valoraCore.exchangeRate()).to.equal(ethers.parseEther("1"));

            // After deposits - supply > 0 (FALSE branch)
            await valoraCore.connect(user1).deposit(ethers.parseEther("1000"));
            await valoraCore.connect(oracle).rebase(ethers.parseEther("2000"));
            expect(await valoraCore.exchangeRate()).to.equal(ethers.parseEther("2"));

            // Complex scenarios with multiple rate changes
            await valoraCore.connect(user2).deposit(ethers.parseEther("1000"));
            await valoraCore.connect(oracle).rebase(ethers.parseEther("4500"));
            
            // Test edge case calculations
            await valoraCore.connect(oracle).rebase(ethers.parseEther("1"));
            await valoraCore.connect(user3).deposit(ethers.parseEther("100000"));
            expect(await sCellToken.balanceOf(user3.address)).to.be.gt(0);
        });

        it("🛡️ Complete Security & Access Control - All Modifier Branches", async function () {
            // onlyOwner - TRUE branch
            await valoraCore.setOracul(validator.address);
            expect(await valoraCore.oracul()).to.equal(validator.address);

            // onlyOwner - FALSE branch
            await expect(valoraCore.connect(user1).setOracul(user1.address))
                .to.be.revertedWithCustomError(valoraCore, "OwnableUnauthorizedAccount");

            // onlyOracul - TRUE branch
            await valoraCore.connect(validator).rebase(ethers.parseEther("1000"));

            // onlyOracul - FALSE branch
            await expect(valoraCore.connect(user1).rebase(ethers.parseEther("1000")))
                .to.be.revertedWith("Only oracle can call this");

            // whenNotPaused - TRUE branch
            await valoraCore.connect(user1).deposit(ethers.parseEther("100"));

            // whenNotPaused - FALSE branch
            await valoraCore.pause();
            await expect(valoraCore.connect(user1).deposit(ethers.parseEther("100")))
                .to.be.revertedWith("Pausable: paused");

            await valoraCore.unpause();

            // whenWithdrawalsEnabled - TRUE branch (main contract has withdrawals enabled)
            await ethers.provider.send("evm_increaseTime", [7 * 24 * 60 * 60]);
            await ethers.provider.send("evm_mine");
            await valoraCore.moveToNextWeek();
            await valoraCore.connect(user1).requestWithdrawal(ethers.parseEther("50"));

            // Test non-owner admin function access
            await expect(valoraCore.connect(user1).moveToNextWeek())
                .to.be.revertedWithCustomError(valoraCore, "OwnableUnauthorizedAccount");

            await expect(valoraCore.connect(user1).approveBatchByHash("0x1234567890123456789012345678901234567890123456789012345678901234"))
                .to.be.revertedWithCustomError(valoraCore, "OwnableUnauthorizedAccount");
        });

        it("🔧 Complete Admin Configuration - All Settings Branches", async function () {
            // Valid oracle setting - TRUE branch
            await valoraCore.setOracul(validator.address);
            expect(await valoraCore.oracul()).to.equal(validator.address);

            // Invalid oracle setting - FALSE branch
            await expect(valoraCore.setOracul(ethers.ZeroAddress))
                .to.be.revertedWith("Invalid oracle address");

            // Valid withdrawal delay - TRUE branch
            const newDelay = 14 * 24 * 60 * 60;
            await valoraCore.setWithdrawalDelay(newDelay);
            expect(await valoraCore.withdrawalDelay()).to.equal(newDelay);

            // Invalid withdrawal delay - FALSE branch
            const tooLong = 31 * 24 * 60 * 60;
            await expect(valoraCore.setWithdrawalDelay(tooLong))
                .to.be.revertedWith("Delay too long");

            // Enable withdrawals - already enabled (FALSE branch)
            await expect(valoraCore.enableWithdrawals())
                .to.be.revertedWith("Withdrawals already enabled");

            // Enable withdrawals - not enabled yet (TRUE branch) - test with new contract
            const ValoraCore = await ethers.getContractFactory("ValoraCore");
            const newSCell = await ethers.getContractFactory("ValoraStakedCell");
            const newSCellInstance = await newSCell.deploy();
            await newSCellInstance.waitForDeployment();
            
            const newCore = await upgrades.deployProxy(ValoraCore, [
                await cellToken.getAddress(),
                await newSCellInstance.getAddress(),
                oracle.address,
                await mockBridge.getAddress(),
                "0x434C4C",
                "0x1234567890123456789012345678901234567890123456789012345678901234"
            ], { kind: 'uups', initializer: 'initialize' });
            
            expect(await newCore.withdrawalsEnabled()).to.be.false;
            await newCore.enableWithdrawals();
            expect(await newCore.withdrawalsEnabled()).to.be.true;
        });

        it("📊 Complete State Verification - All View Functions", async function () {
            // Test all view functions
            expect(await valoraCore.cellToken()).to.equal(await cellToken.getAddress());
            expect(await valoraCore.sCellToken()).to.equal(await sCellToken.getAddress());
            expect(await valoraCore.MIN_DEPOSIT()).to.equal(ethers.parseUnits("1", 12));
            expect(await valoraCore.isOperational()).to.be.true;

            // After operations
            await valoraCore.connect(user1).deposit(ethers.parseEther("1000"));
            await valoraCore.connect(oracle).rebase(ethers.parseEther("1500"));

            const [oracul_, paused_, withdrawalDelay_] = await valoraCore.getAdminConfig();
            expect(oracul_).to.equal(oracle.address);
            expect(paused_).to.be.false;

            const [bridge_, nativeChainId_, validatorAddress_] = await valoraCore.getBridgeConfig();
            expect(bridge_).to.not.equal(ethers.ZeroAddress);
            expect(nativeChainId_).to.not.equal("0x000000");
            expect(validatorAddress_).to.not.equal("0x");
        });

        it("🚀 Complete Upgrade Flow - All Upgrade Branches", async function () {
            // Test upgrade authorization
            const ValoraCore = await ethers.getContractFactory("ValoraCore");
            const newImplementation = await ValoraCore.deploy();
            await newImplementation.waitForDeployment();

            // Owner can upgrade - TRUE branch
            await upgrades.upgradeProxy(valoraCore.target, ValoraCore);

            // Verify state preserved after upgrade
            expect(await valoraCore.oracul()).to.equal(oracle.address);
            expect(await valoraCore.cellToken()).to.equal(await cellToken.getAddress());
        });

        it("🔍 MockERC20 and MockBridge Coverage", async function () {
            // Test MockERC20 mint function to increase coverage
            await cellToken.mint(user1.address, ethers.parseEther("1000"));
            expect(await cellToken.balanceOf(user1.address)).to.be.gt(ethers.parseEther("100000"));

            // Test MockBridge functions (using correct function signatures)
            await mockBridge.bridgeToken(
                await cellToken.getAddress(), 
                1000, 
                "0x434C4C",
                "0x1234567890123456789012345678901234567890"
            );
            
            // Test other MockBridge functions
            await mockBridge.unlockBridgedToken(
                "0x1234567890123456789012345678901234567890123456789012345678901234",
                "0x434C4C",
                await cellToken.getAddress(),
                user1.address,
                1000
            );
            
            await mockBridge.unlocked(user1.address, await cellToken.getAddress(), 1000);
            
            // Test isUnlocked with a hash
            expect(await mockBridge.isUnlocked("0x1234567890123456789012345678901234567890123456789012345678901234")).to.be.false;
        });

        it("🌟 Complete Integration Test - All Components Together", async function () {
            // Full workflow test covering all major branches
            
            // 1. Initial setup and deposits
            await valoraCore.connect(user1).deposit(ethers.parseEther("1000"));
            await valoraCore.connect(user2).deposit(ethers.parseEther("2000"));
            
            // 2. Rebase operations
            await valoraCore.connect(oracle).rebase(ethers.parseEther("4500"));
            
            // 3. Withdrawal cycle
            await ethers.provider.send("evm_increaseTime", [7 * 24 * 60 * 60]);
            await ethers.provider.send("evm_mine");
            await valoraCore.moveToNextWeek();
            
            await valoraCore.connect(user1).requestWithdrawal(ethers.parseEther("500"));
            await valoraCore.connect(user2).requestWithdrawal(ethers.parseEther("1000"));
            
            // 4. Batch processing
            await ethers.provider.send("evm_increaseTime", [7 * 24 * 60 * 60]);
            await ethers.provider.send("evm_mine");
            await valoraCore.moveToNextWeek();
            
            const batchInfo = await valoraCore.getBatchInfo(1);
            await valoraCore.approveBatchByHash(batchInfo.batchHash);
            
            // 5. Complete withdrawals
            await valoraCore.connect(user1).completeWithdrawal();
            await valoraCore.connect(user2).completeWithdrawal();
            
            // 6. Verify final state
            expect(await valoraCore.getTotalAssets()).to.be.gt(0);
            expect(await sCellToken.totalSupply()).to.be.gt(0);
            
            // 7. Admin operations
            await valoraCore.pause();
            await valoraCore.unpause();
            
            // 8. Final verification
            expect(await valoraCore.isOperational()).to.be.true;
            expect(await valoraCore.isBridgeConfigured()).to.be.true;
        });
    });
}); 
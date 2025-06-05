const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("AdminManager 100% Branch Coverage", function () {
    let valoraCore, sCellToken, cellToken, mockBridge;
    let owner, user1, oracle;

    beforeEach(async function () {
        [owner, user1, oracle] = await ethers.getSigners();

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
    });

    describe("AdminManager Branch Coverage Tests", function () {
        
        it("Should cover onlyOracul modifier - TRUE branch (oracle calls)", async function () {
            // Test success path when oracle calls (TRUE branch)
            await valoraCore.connect(oracle).rebase(ethers.parseEther("1000"));
            expect(await valoraCore.getTotalAssets()).to.equal(ethers.parseEther("1000"));
        });

        it("Should cover onlyOracul modifier - FALSE branch (non-oracle calls)", async function () {
            // Test failure path when non-oracle calls (FALSE branch) 
            await expect(valoraCore.connect(user1).rebase(ethers.parseEther("1000")))
                .to.be.revertedWith("Only oracle can call this");
        });

        it("Should cover whenNotPaused modifier - TRUE branch (not paused)", async function () {
            // Test success path when not paused (TRUE branch)
            await cellToken.transfer(user1.address, ethers.parseEther("100"));
            await cellToken.connect(user1).approve(await valoraCore.getAddress(), ethers.parseEther("100"));
            await valoraCore.enableWithdrawals();
            await valoraCore.connect(user1).deposit(ethers.parseEther("100"));
        });

        it("Should cover whenNotPaused modifier - FALSE branch (paused)", async function () {
            // Test failure path when paused (FALSE branch)
            await valoraCore.pause();
            await cellToken.transfer(user1.address, ethers.parseEther("100"));
            await cellToken.connect(user1).approve(await valoraCore.getAddress(), ethers.parseEther("100"));
            await expect(valoraCore.connect(user1).deposit(ethers.parseEther("100")))
                .to.be.revertedWith("Pausable: paused");
        });

        it("Should cover whenWithdrawalsEnabled modifier - TRUE branch (enabled)", async function () {
            // Test success path when withdrawals enabled (TRUE branch)
            await valoraCore.enableWithdrawals();
            expect(await valoraCore.withdrawalsEnabled()).to.be.true;
            
            // Test successful withdrawal request when enabled
            await cellToken.transfer(user1.address, ethers.parseEther("100"));
            await cellToken.connect(user1).approve(await valoraCore.getAddress(), ethers.parseEther("100"));
            await valoraCore.connect(user1).deposit(ethers.parseEther("100"));
            await sCellToken.connect(user1).approve(await valoraCore.getAddress(), ethers.parseEther("50"));
            
            // Move to withdrawal window
            await ethers.provider.send("evm_increaseTime", [7 * 24 * 60 * 60]);
            await ethers.provider.send("evm_mine");
            await valoraCore.moveToNextWeek();
            
            await valoraCore.connect(user1).requestWithdrawal(ethers.parseEther("50"));
        });

        it("Should cover whenWithdrawalsEnabled modifier - FALSE branch (disabled)", async function () {
            // Test failure path when withdrawals disabled (FALSE branch)
            expect(await valoraCore.withdrawalsEnabled()).to.be.false;
            
            await cellToken.transfer(user1.address, ethers.parseEther("100"));
            await cellToken.connect(user1).approve(await valoraCore.getAddress(), ethers.parseEther("100"));
            await valoraCore.connect(user1).deposit(ethers.parseEther("100"));
            await sCellToken.connect(user1).approve(await valoraCore.getAddress(), ethers.parseEther("50"));
            
            // Move to withdrawal window
            await ethers.provider.send("evm_increaseTime", [7 * 24 * 60 * 60]);
            await ethers.provider.send("evm_mine");
            await valoraCore.moveToNextWeek();
            
            await expect(valoraCore.connect(user1).requestWithdrawal(ethers.parseEther("50")))
                .to.be.revertedWith("Withdrawals not enabled yet");
        });

        it("Should cover _setOracul - valid address (TRUE branch)", async function () {
            // Test success path for valid oracle address (TRUE branch)
            const newOracle = user1.address;
            await expect(valoraCore.setOracul(newOracle))
                .to.emit(valoraCore, "OracleUpdated")
                .withArgs(oracle.address, newOracle);
            expect(await valoraCore.oracul()).to.equal(newOracle);
        });

        it("Should cover _setOracul - invalid address (FALSE branch)", async function () {
            // Test failure path for invalid oracle address (FALSE branch)
            await expect(valoraCore.setOracul(ethers.ZeroAddress))
                .to.be.revertedWith("Invalid oracle address");
        });

        it("Should cover _enableWithdrawals - not enabled yet (TRUE branch)", async function () {
            // Test success path when withdrawals not enabled yet (TRUE branch)
            expect(await valoraCore.withdrawalsEnabled()).to.be.false;
            await expect(valoraCore.enableWithdrawals())
                .to.emit(valoraCore, "WithdrawalsEnabled");
            expect(await valoraCore.withdrawalsEnabled()).to.be.true;
        });

        it("Should cover _enableWithdrawals - already enabled (FALSE branch)", async function () {
            // Test failure path when withdrawals already enabled (FALSE branch)
            await valoraCore.enableWithdrawals();
            expect(await valoraCore.withdrawalsEnabled()).to.be.true;
            await expect(valoraCore.enableWithdrawals())
                .to.be.revertedWith("Withdrawals already enabled");
        });

        it("Should cover _pause and _unpause functions", async function () {
            // Test pause (sets paused = true)
            expect(await valoraCore.paused()).to.be.false;
            await expect(valoraCore.pause())
                .to.emit(valoraCore, "Paused");
            expect(await valoraCore.paused()).to.be.true;
            
            // Test unpause (sets paused = false)
            await expect(valoraCore.unpause())
                .to.emit(valoraCore, "Unpaused");
            expect(await valoraCore.paused()).to.be.false;
        });

        it("Should cover _setWithdrawalDelay - valid delay (TRUE branch)", async function () {
            // Test success path for valid delay (TRUE branch)
            const newDelay = 14 * 24 * 60 * 60; // 14 days
            const oldDelay = await valoraCore.withdrawalDelay();
            await expect(valoraCore.setWithdrawalDelay(newDelay))
                .to.emit(valoraCore, "WithdrawalDelayUpdated")
                .withArgs(oldDelay, newDelay);
            expect(await valoraCore.withdrawalDelay()).to.equal(newDelay);
        });

        it("Should cover _setWithdrawalDelay - invalid delay (FALSE branch)", async function () {
            // Test failure path for invalid delay (FALSE branch)
            const invalidDelay = 31 * 24 * 60 * 60; // 31 days (too long)
            await expect(valoraCore.setWithdrawalDelay(invalidDelay))
                .to.be.revertedWith("Delay too long");
        });

        it("Should cover view functions", async function () {
            // Test getAdminConfig
            const [oracul_, paused_, withdrawalDelay_] = await valoraCore.getAdminConfig();
            expect(oracul_).to.equal(oracle.address);
            expect(paused_).to.be.false;
            expect(withdrawalDelay_).to.equal(7 * 24 * 60 * 60);
            
            // Test isOperational (not paused)
            expect(await valoraCore.isOperational()).to.be.true;
            
            // Test isOperational (paused)
            await valoraCore.pause();
            expect(await valoraCore.isOperational()).to.be.false;
        });

        it("Should cover __AdminManager_init - valid oracle (TRUE branch)", async function () {
            // This is already covered in beforeEach, but let's test with new deployment
            const ValoraCore = await ethers.getContractFactory("ValoraCore");
            const newCore = await upgrades.deployProxy(ValoraCore, [
                await cellToken.getAddress(),
                await sCellToken.getAddress(),
                oracle.address, // Valid oracle
                await mockBridge.getAddress(),
                "0x434C4C",
                "0x1234567890123456789012345678901234567890123456789012345678901234"
            ], {
                kind: 'uups',
                initializer: 'initialize'
            });
            
            expect(await newCore.oracul()).to.equal(oracle.address);
            expect(await newCore.paused()).to.be.false;
            expect(await newCore.withdrawalsEnabled()).to.be.false;
            expect(await newCore.withdrawalDelay()).to.equal(7 * 24 * 60 * 60);
        });

        it("Should cover __AdminManager_init - invalid oracle (FALSE branch)", async function () {
            // Test failure path for invalid oracle in initialization
            const ValoraCore = await ethers.getContractFactory("ValoraCore");
            await expect(upgrades.deployProxy(ValoraCore, [
                await cellToken.getAddress(),
                await sCellToken.getAddress(),
                ethers.ZeroAddress, // Invalid oracle
                await mockBridge.getAddress(),
                "0x434C4C",
                "0x1234567890123456789012345678901234567890123456789012345678901234"
            ], {
                kind: 'uups',
                initializer: 'initialize'
            })).to.be.revertedWith("Invalid oracle address");
        });
    });
}); 
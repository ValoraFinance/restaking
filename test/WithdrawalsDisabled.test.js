const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("Withdrawals Disabled Tests", function () {
    let valoraCore, sCellToken, cellToken, mockBridge;
    let owner, user1, oracle, bridge;

    beforeEach(async function () {
        [owner, user1, oracle, bridge] = await ethers.getSigners();

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

        // DON'T enable withdrawals in this test!
        // Setup user with CELL and sCELL
        await cellToken.transfer(user1.address, ethers.parseEther("1000"));
        await cellToken.connect(user1).approve(await valoraCore.getAddress(), ethers.parseEther("1000"));
        
        // Deposit to have some sCELL
        await valoraCore.connect(user1).deposit(ethers.parseEther("100"));
        
        // Approve sCELL for withdrawal operations
        await sCellToken.connect(user1).approve(await valoraCore.getAddress(), ethers.parseEther("1000"));
    });

    describe("Withdrawals Disabled", function () {
        it("Should reject withdrawal requests when withdrawals disabled", async function () {
            expect(await valoraCore.withdrawalsEnabled()).to.be.false;
            
            await expect(valoraCore.connect(user1).requestWithdrawal(ethers.parseEther("50")))
                .to.be.revertedWith("Withdrawals not enabled yet");
        });

        it("Should allow withdrawal requests after enabling withdrawals", async function () {
            // Enable withdrawals
            await valoraCore.enableWithdrawals();
            expect(await valoraCore.withdrawalsEnabled()).to.be.true;
            
            // Move to submission window
            await ethers.provider.send("evm_increaseTime", [7 * 24 * 60 * 60]);
            await ethers.provider.send("evm_mine");
            await valoraCore.moveToNextWeek();
            
            // Now withdrawal should work
            await expect(valoraCore.connect(user1).requestWithdrawal(ethers.parseEther("50")))
                .to.emit(valoraCore, "WithdrawalRequested");
        });
    });
}); 
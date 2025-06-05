const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("ValoraCore with Proxy", function () {
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

        // Set ValoraCore as core contract in sCELL
        await sCellToken.setCoreContract(await valoraCore.getAddress());

        // Transfer some CELL to users and approve
        await cellToken.transfer(user1.address, ethers.parseEther("1000"));
        await cellToken.transfer(user2.address, ethers.parseEther("1000"));
        
        await cellToken.connect(user1).approve(await valoraCore.getAddress(), ethers.parseEther("1000"));
        await cellToken.connect(user2).approve(await valoraCore.getAddress(), ethers.parseEther("1000"));

        // Also approve sCELL for withdrawals
        await sCellToken.connect(user1).approve(await valoraCore.getAddress(), ethers.parseEther("1000"));
        await sCellToken.connect(user2).approve(await valoraCore.getAddress(), ethers.parseEther("1000"));
    });

    describe("Initialization", function () {
        it("Should initialize correctly with proxy", async function () {
            expect(await valoraCore.cellToken()).to.equal(await cellToken.getAddress());
            expect(await valoraCore.sCellToken()).to.equal(await sCellToken.getAddress());
            expect(await valoraCore.getTotalAssets()).to.equal(0);
            expect(await valoraCore.oracul()).to.equal(oracle.address);
        });

        it("Should not allow double initialization", async function () {
            await expect(valoraCore.initialize(
                await cellToken.getAddress(),
                await sCellToken.getAddress(),
                oracle.address,
                await mockBridge.getAddress(),
                "0x434C4C",
                "0x1234567890123456789012345678901234567890123456789012345678901234"
            )).to.be.revertedWithCustomError(valoraCore, "InvalidInitialization");
        });
    });

    describe("Exchange Rate", function () {
        it("Should return 1e18 for initial state", async function () {
            expect(await valoraCore.exchangeRate()).to.equal(ethers.parseEther("1"));
        });

        it("Should calculate correct exchange rate after rebase", async function () {
            // First deposit to have some shares
            await valoraCore.connect(user1).deposit(ethers.parseEther("100"));
            
            // Rebase to higher value
            await valoraCore.connect(oracle).rebase(ethers.parseEther("120"));
            
            expect(await valoraCore.exchangeRate()).to.equal(ethers.parseEther("1.2"));
        });
    });

    describe("Staking (deposit)", function () {
        it("Should allow deposits", async function () {
            const amount = ethers.parseEther("100");
            
            await expect(valoraCore.connect(user1).deposit(amount))
                .to.emit(valoraCore, "Staked")
                .withArgs(user1.address, amount);

            expect(await sCellToken.balanceOf(user1.address)).to.equal(amount);
            expect(await valoraCore.getTotalAssets()).to.equal(amount);
        });

        it("Should reject deposits below minimum", async function () {
            const tooSmall = ethers.parseEther("0.000000001");
            await expect(valoraCore.connect(user1).deposit(tooSmall))
                .to.be.revertedWith("Amount too small");
        });

        it("Should handle multiple deposits with correct share calculation", async function () {
            // First deposit
            await valoraCore.connect(user1).deposit(ethers.parseEther("100"));
            
            // Rebase to simulate rewards
            await valoraCore.connect(oracle).rebase(ethers.parseEther("110"));
            
            // Second deposit should get fewer shares
            const amount2 = ethers.parseEther("110");
            await valoraCore.connect(user2).deposit(amount2);
            
            // user2 should get 100 shares (110 * 100 / 110 = 100)
            expect(await sCellToken.balanceOf(user2.address)).to.equal(ethers.parseEther("100"));
        });

        it("Should reject deposits when paused", async function () {
            await valoraCore.pause();
            await expect(valoraCore.connect(user1).deposit(ethers.parseEther("100")))
                .to.be.revertedWith("Pausable: paused");
        });
    });

    describe("Rebase", function () {
        it("Should allow oracle to rebase", async function () {
            await valoraCore.connect(user1).deposit(ethers.parseEther("100"));
            
            await expect(valoraCore.connect(oracle).rebase(ethers.parseEther("110")))
                .to.emit(valoraCore, "Rebased")
                .withArgs(ethers.parseEther("100"), ethers.parseEther("110"));
                
            expect(await valoraCore.getTotalAssets()).to.equal(ethers.parseEther("110"));
        });

        it("Should reject rebase from non-oracle", async function () {
            await expect(valoraCore.connect(user1).rebase(ethers.parseEther("110")))
                .to.be.revertedWith("Only oracle can call this");
        });

        it("Should reject zero rebase", async function () {
            await expect(valoraCore.connect(oracle).rebase(0))
                .to.be.revertedWith("Amount must be greater than 0");
        });
    });

    describe("Admin Functions", function () {
        it("Should allow owner to pause/unpause", async function () {
            await valoraCore.pause();
            expect(await valoraCore.paused()).to.be.true;
            
            await valoraCore.unpause();
            expect(await valoraCore.paused()).to.be.false;
        });

        it("Should allow owner to set oracle", async function () {
            const newOracle = user2.address;
            
            await expect(valoraCore.setOracul(newOracle))
                .to.emit(valoraCore, "OracleUpdated")
                .withArgs(oracle.address, newOracle);
                
            expect(await valoraCore.oracul()).to.equal(newOracle);
        });

        it("Should reject admin functions from non-owner", async function () {
            await expect(valoraCore.connect(user1).pause())
                .to.be.revertedWithCustomError(valoraCore, "OwnableUnauthorizedAccount");
                
            await expect(valoraCore.connect(user1).setOracul(user2.address))
                .to.be.revertedWithCustomError(valoraCore, "OwnableUnauthorizedAccount");
        });

        it("Should allow owner to set withdrawal delay", async function () {
            const newDelay = 14 * 24 * 60 * 60; // 14 days
            
            await expect(valoraCore.setWithdrawalDelay(newDelay))
                .to.emit(valoraCore, "WithdrawalDelayUpdated")
                .withArgs(7 * 24 * 60 * 60, newDelay);
                
            expect(await valoraCore.withdrawalDelay()).to.equal(newDelay);
        });

        it("Should reject withdrawal delay over 30 days", async function () {
            const tooLong = 31 * 24 * 60 * 60; // 31 days
            
            await expect(valoraCore.setWithdrawalDelay(tooLong))
                .to.be.revertedWith("Delay too long");
        });

        it("Should reject setting zero address as oracle", async function () {
            await expect(valoraCore.setOracul(ethers.ZeroAddress))
                .to.be.revertedWith("Invalid oracle address");
        });

        it("Should return correct admin config", async function () {
            const [oracul_, paused_, withdrawalDelay_] = await valoraCore.getAdminConfig();
            
            expect(oracul_).to.equal(await valoraCore.oracul());
            expect(paused_).to.equal(await valoraCore.paused());
            expect(withdrawalDelay_).to.equal(await valoraCore.withdrawalDelay());
        });

        it("Should return operational status", async function () {
            expect(await valoraCore.isOperational()).to.be.true;
            
            await valoraCore.pause();
            expect(await valoraCore.isOperational()).to.be.false;
            
            await valoraCore.unpause();
            expect(await valoraCore.isOperational()).to.be.true;
        });
    });

    describe("Bridge Management", function () {
        it("Should allow owner to set bridge", async function () {
            const newBridge = user2.address;
            
            await expect(valoraCore.setBridge(newBridge))
                .to.emit(valoraCore, "BridgeUpdated")
                .withArgs(await mockBridge.getAddress(), newBridge);
        });

        it("Should reject setting zero address as bridge", async function () {
            await expect(valoraCore.setBridge(ethers.ZeroAddress))
                .to.be.revertedWith("Invalid bridge address");
        });

        it("Should allow owner to set validator address", async function () {
            const newChainId = "0x545354"; // "TEST"
            const newValidatorAddress = "0x9876543210987654321098765432109876543210987654321098765432109876";
            
            await expect(valoraCore.setValidatorAddress(newChainId, newValidatorAddress))
                .to.emit(valoraCore, "ValidatorAddressUpdated")
                .withArgs(newChainId, newValidatorAddress);
        });

        it("Should reject setting zero chain ID", async function () {
            const newValidatorAddress = "0x9876543210987654321098765432109876543210987654321098765432109876";
            
            await expect(valoraCore.setValidatorAddress("0x000000", newValidatorAddress))
                .to.be.revertedWith("Invalid chain ID");
        });

        it("Should reject setting empty validator address", async function () {
            const newChainId = "0x545354"; // "TEST"
            
            await expect(valoraCore.setValidatorAddress(newChainId, "0x"))
                .to.be.revertedWith("Invalid validator address");
        });

        it("Should return correct bridge config", async function () {
            const [bridge_, nativeChainId_, validatorAddress_] = await valoraCore.getBridgeConfig();
            
            expect(bridge_).to.equal(await mockBridge.getAddress());
            expect(nativeChainId_).to.equal("0x434c4c");
            expect(validatorAddress_).to.equal("0x1234567890123456789012345678901234567890123456789012345678901234");
        });

        it("Should check if bridge is configured", async function () {
            expect(await valoraCore.isBridgeConfigured()).to.be.true;
        });

        it("Should reject bridge functions from non-owner", async function () {
            await expect(valoraCore.connect(user1).setBridge(user2.address))
                .to.be.revertedWithCustomError(valoraCore, "OwnableUnauthorizedAccount");
                
            await expect(valoraCore.connect(user1).setValidatorAddress("0x545354", "0x1234567890123456789012345678901234567890123456789012345678901234"))
                .to.be.revertedWithCustomError(valoraCore, "OwnableUnauthorizedAccount");
        });
    });

    describe("Upgradeability", function () {
        it("Should be upgradeable by owner", async function () {
            const ValoraCore = await ethers.getContractFactory("ValoraCore");
            const upgraded = await upgrades.upgradeProxy(await valoraCore.getAddress(), ValoraCore);
            
            // Should still have the same state
            expect(await upgraded.cellToken()).to.equal(await cellToken.getAddress());
            expect(await upgraded.sCellToken()).to.equal(await sCellToken.getAddress());
        });

        it("Should reject upgrade from non-owner", async function () {
            const ValoraCore = await ethers.getContractFactory("ValoraCore");
            
            // Connect as non-owner
            const valoraCoreAsUser = valoraCore.connect(user1);
            
            await expect(
                upgrades.upgradeProxy(await valoraCore.getAddress(), ValoraCore.connect(user1))
            ).to.be.reverted; // Will be reverted by the proxy since user1 is not owner
        });
    });

    describe("Edge Cases", function () {
        it("Should handle zero total supply correctly", async function () {
            expect(await valoraCore.exchangeRate()).to.equal(ethers.parseEther("1"));
        });

        it("Should prevent overflow in large deposits", async function () {
            const maxAmount = ethers.parseEther("999999999");
            
            // Mint additional tokens for this test
            await cellToken.mint(user1.address, maxAmount);
            await cellToken.connect(user1).approve(await valoraCore.getAddress(), maxAmount);
            
            // This should not overflow
            await expect(valoraCore.connect(user1).deposit(maxAmount)).to.not.be.reverted;
        });
    });
}); 
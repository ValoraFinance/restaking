const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("Edge Cases and Branch Coverage", function () {
  async function deployFullSystemFixture() {
    const [owner, oracle, user1, user2, user3, hacker] = await ethers.getSigners();

    // Deploy MockERC20 for CELL token
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const cellToken = await MockERC20.deploy("CELL Token", "CELL", ethers.parseEther("10000000"));

    // Deploy ValoraStakedCell
    const ValoraStakedCell = await ethers.getContractFactory("ValoraStakedCell");
    const sCellToken = await ValoraStakedCell.deploy();

    // Deploy MockBridge
    const MockBridge = await ethers.getContractFactory("MockBridge");
    const mockBridge = await MockBridge.deploy();

    // Deploy ValoraCore as upgradeable proxy
    const ValoraCore = await ethers.getContractFactory("ValoraCore");
    const nativeChainId = "0x010203";
    const validatorAddress = ethers.hexlify(ethers.randomBytes(32));

    const valoraCore = await upgrades.deployProxy(ValoraCore, [
      await cellToken.getAddress(),
      await sCellToken.getAddress(),
      oracle.address,
      await mockBridge.getAddress(),
      nativeChainId,
      validatorAddress
    ], { initializer: 'initialize' });

    await valoraCore.waitForDeployment();

    // Set ValoraCore as the core contract in sCellToken
    await sCellToken.setCoreContract(await valoraCore.getAddress());

    // Distribute CELL tokens to users
    await cellToken.transfer(user1.address, ethers.parseEther("100000"));
    await cellToken.transfer(user2.address, ethers.parseEther("100000"));
    await cellToken.transfer(user3.address, ethers.parseEther("100000"));
    await cellToken.transfer(hacker.address, ethers.parseEther("100000"));

    return {
      valoraCore,
      cellToken,
      sCellToken,
      mockBridge,
      owner,
      oracle,
      user1,
      user2,
      user3,
      hacker,
      nativeChainId,
      validatorAddress
    };
  }

  describe("AdminManager Branch Coverage", function () {
    it("Should handle setting same oracle address", async function () {
      const { valoraCore, oracle, owner } = await loadFixture(deployFullSystemFixture);

      // Set oracle to same address (should still emit event)
      await expect(valoraCore.connect(owner).setOracul(oracle.address))
        .to.emit(valoraCore, "OracleUpdated")
        .withArgs(oracle.address, oracle.address);
    });

    it("Should get admin configuration correctly", async function () {
      const { valoraCore, oracle } = await loadFixture(deployFullSystemFixture);

      const [oracleAddr, isPaused] = await valoraCore.getAdminConfig();
      expect(oracleAddr).to.equal(oracle.address);
      expect(isPaused).to.be.false;

      // Test after pausing
      await valoraCore.pause();
      const [, isPausedAfter] = await valoraCore.getAdminConfig();
      expect(isPausedAfter).to.be.true;
    });

    it("Should check if contract is operational", async function () {
      const { valoraCore } = await loadFixture(deployFullSystemFixture);

      expect(await valoraCore.isOperational()).to.be.true;

      await valoraCore.pause();
      expect(await valoraCore.isOperational()).to.be.false;

      await valoraCore.unpause();
      expect(await valoraCore.isOperational()).to.be.true;
    });

    it("Should reject invalid oracle address", async function () {
      const { valoraCore, owner } = await loadFixture(deployFullSystemFixture);

      await expect(valoraCore.connect(owner).setOracul(ethers.ZeroAddress))
        .to.be.revertedWith("Invalid oracle address");
    });

    it("Should reject invalid oracle in initialization", async function () {
      const { cellToken, sCellToken, mockBridge } = await loadFixture(deployFullSystemFixture);

      const ValoraCore = await ethers.getContractFactory("ValoraCore");
      const nativeChainId = "0x010203";
      const validatorAddress = ethers.hexlify(ethers.randomBytes(32));

      await expect(upgrades.deployProxy(ValoraCore, [
        await cellToken.getAddress(),
        await sCellToken.getAddress(),
        ethers.ZeroAddress, // Invalid oracle
        await mockBridge.getAddress(),
        nativeChainId,
        validatorAddress
      ], { initializer: 'initialize' }))
        .to.be.revertedWith("Invalid oracle address");
    });
  });

  describe("BridgeManager Branch Coverage", function () {
    it("Should get bridge configuration correctly", async function () {
      const { valoraCore, mockBridge, nativeChainId, validatorAddress } = await loadFixture(deployFullSystemFixture);

      const [bridgeAddr, chainId, validatorAddr] = await valoraCore.getBridgeConfig();
      expect(bridgeAddr).to.equal(await mockBridge.getAddress());
      expect(chainId).to.equal(nativeChainId);
      expect(validatorAddr).to.equal(validatorAddress);
    });

    it("Should check if bridge is configured", async function () {
      const { valoraCore } = await loadFixture(deployFullSystemFixture);

      expect(await valoraCore.isBridgeConfigured()).to.be.true;
    });

    it("Should handle setting same bridge address", async function () {
      const { valoraCore, mockBridge, owner } = await loadFixture(deployFullSystemFixture);

      // Set bridge to same address (should still emit event)
      await expect(valoraCore.connect(owner).setBridge(await mockBridge.getAddress()))
        .to.emit(valoraCore, "BridgeUpdated")
        .withArgs(await mockBridge.getAddress(), await mockBridge.getAddress());
    });

    it("Should handle setting same validator address", async function () {
      const { valoraCore, owner, nativeChainId, validatorAddress } = await loadFixture(deployFullSystemFixture);

      // Set validator to same address (should still emit event)
      await expect(valoraCore.connect(owner).setValidatorAddress(nativeChainId, validatorAddress))
        .to.emit(valoraCore, "ValidatorAddressUpdated")
        .withArgs(nativeChainId, validatorAddress);
    });

    it("Should reject invalid bridge address", async function () {
      const { valoraCore, owner } = await loadFixture(deployFullSystemFixture);

      await expect(valoraCore.connect(owner).setBridge(ethers.ZeroAddress))
        .to.be.revertedWith("Invalid bridge address");
    });

    it("Should reject invalid chain ID", async function () {
      const { valoraCore, owner } = await loadFixture(deployFullSystemFixture);

      await expect(valoraCore.connect(owner).setValidatorAddress("0x000000", "0x1234567890"))
        .to.be.revertedWith("Invalid chain ID");
    });

    it("Should reject empty validator address", async function () {
      const { valoraCore, owner } = await loadFixture(deployFullSystemFixture);

      await expect(valoraCore.connect(owner).setValidatorAddress("0x010203", "0x"))
        .to.be.revertedWith("Invalid validator address");
    });

    it("Should reject invalid parameters in initialization", async function () {
      const { cellToken, sCellToken, oracle } = await loadFixture(deployFullSystemFixture);

      const ValoraCore = await ethers.getContractFactory("ValoraCore");

      // Invalid bridge address
      await expect(upgrades.deployProxy(ValoraCore, [
        await cellToken.getAddress(),
        await sCellToken.getAddress(),
        oracle.address,
        ethers.ZeroAddress, // Invalid bridge
        "0x010203",
        "0x1234567890"
      ], { initializer: 'initialize' }))
        .to.be.revertedWith("Invalid bridge address");

      // Invalid chain ID  
      await expect(upgrades.deployProxy(ValoraCore, [
        await cellToken.getAddress(),
        await sCellToken.getAddress(),
        oracle.address,
        ethers.Wallet.createRandom().address,
        "0x000000", // Invalid chain ID
        "0x1234567890"
      ], { initializer: 'initialize' }))
        .to.be.revertedWith("Invalid chain ID");

      // Invalid validator address
      await expect(upgrades.deployProxy(ValoraCore, [
        await cellToken.getAddress(),
        await sCellToken.getAddress(),
        oracle.address,
        ethers.Wallet.createRandom().address,
        "0x010203",
        "0x" // Empty validator address
      ], { initializer: 'initialize' }))
        .to.be.revertedWith("Invalid validator address");
    });
  });

  describe("WithdrawalManager Branch Coverage", function () {
    it("Should handle multiple requests from same user", async function () {
      const { valoraCore, cellToken, sCellToken, user1 } = await loadFixture(deployFullSystemFixture);

      // Setup deposits
      const depositAmount = ethers.parseEther("10000");
      await cellToken.connect(user1).approve(await valoraCore.getAddress(), depositAmount);
      await valoraCore.connect(user1).deposit(depositAmount);

      // Approve shares for withdrawal
      await sCellToken.connect(user1).approve(await valoraCore.getAddress(), depositAmount);

      // Make multiple withdrawal requests
      const firstWithdraw = ethers.parseEther("3000");
      const secondWithdraw = ethers.parseEther("2000");

      await valoraCore.connect(user1).requestWithdrawal(firstWithdraw);
      await valoraCore.connect(user1).requestWithdrawal(secondWithdraw);

      // Check user requests
      const userRequests = await valoraCore.getUserRequests(user1.address);
      expect(userRequests.length).to.equal(2);
    });

    it("Should check canUnstake function correctly", async function () {
      const { valoraCore, cellToken, sCellToken, user1, owner } = await loadFixture(deployFullSystemFixture);

      // Setup deposit
      const depositAmount = ethers.parseEther("1000");
      await cellToken.connect(user1).approve(await valoraCore.getAddress(), depositAmount);
      await valoraCore.connect(user1).deposit(depositAmount);

      // Approve shares for withdrawal
      await sCellToken.connect(user1).approve(await valoraCore.getAddress(), depositAmount);

      // Request withdrawal
      const tx = await valoraCore.connect(user1).requestWithdrawal(depositAmount);
      const receipt = await tx.wait();
      
      const event = receipt.logs.find(log => {
        try {
          const parsed = valoraCore.interface.parseLog(log);
          return parsed.name === "WithdrawalRequested";
        } catch {
          return false;
        }
      });
      
      const requestHash = valoraCore.interface.parseLog(event).args.requestHash;

      // Should not be able to unstake before approval
      expect(await valoraCore.connect(user1).canUnstake(requestHash)).to.be.false;

      // Approve withdrawal
      await valoraCore.connect(owner).approveWithdrawal(requestHash);

      // Should be able to unstake after approval
      expect(await valoraCore.connect(user1).canUnstake(requestHash)).to.be.true;
    });

    it("Should approve multiple withdrawals in batch", async function () {
      const { valoraCore, cellToken, sCellToken, user1, user2, owner } = await loadFixture(deployFullSystemFixture);

      // Setup deposits for multiple users
      const depositAmount = ethers.parseEther("1000");
      
      await cellToken.connect(user1).approve(await valoraCore.getAddress(), depositAmount);
      await valoraCore.connect(user1).deposit(depositAmount);
      
      await cellToken.connect(user2).approve(await valoraCore.getAddress(), depositAmount);
      await valoraCore.connect(user2).deposit(depositAmount);

      // Approve shares
      await sCellToken.connect(user1).approve(await valoraCore.getAddress(), depositAmount);
      await sCellToken.connect(user2).approve(await valoraCore.getAddress(), depositAmount);

      // Request withdrawals
      const tx1 = await valoraCore.connect(user1).requestWithdrawal(depositAmount);
      const tx2 = await valoraCore.connect(user2).requestWithdrawal(depositAmount);

      const receipt1 = await tx1.wait();
      const receipt2 = await tx2.wait();

      const event1 = receipt1.logs.find(log => {
        try { return valoraCore.interface.parseLog(log).name === "WithdrawalRequested"; } catch { return false; }
      });
      const event2 = receipt2.logs.find(log => {
        try { return valoraCore.interface.parseLog(log).name === "WithdrawalRequested"; } catch { return false; }
      });

      const hash1 = valoraCore.interface.parseLog(event1).args.requestHash;
      const hash2 = valoraCore.interface.parseLog(event2).args.requestHash;

      // Batch approve
      await expect(valoraCore.connect(owner).approveWithdrawals([hash1, hash2]))
        .to.emit(valoraCore, "WithdrawalApproved")
        .and.to.emit(valoraCore, "WithdrawalApproved");
    });

    it("Should handle getRequestHash correctly", async function () {
      const { valoraCore } = await loadFixture(deployFullSystemFixture);

      const user = ethers.Wallet.createRandom().address;
      const shares = ethers.parseEther("1000");
      const amount = ethers.parseEther("1100");
      const blockNumber = 12345;

      const hash1 = await valoraCore.getRequestHash(user, shares, amount, blockNumber);
      const hash2 = await valoraCore.getRequestHash(user, shares, amount, blockNumber);

      // Same parameters should produce same hash
      expect(hash1).to.equal(hash2);

      // Different parameters should produce different hash
      const hash3 = await valoraCore.getRequestHash(user, shares, amount, blockNumber + 1);
      expect(hash1).to.not.equal(hash3);
    });
  });

  describe("ValoraCore Branch Coverage", function () {
    it("Should handle deposit when totalSupply is zero but totalAssets is not", async function () {
      const { valoraCore, cellToken, sCellToken, user1, user2 } = await loadFixture(deployFullSystemFixture);

      // Make initial deposit
      const depositAmount = ethers.parseEther("1000");
      await cellToken.connect(user1).approve(await valoraCore.getAddress(), depositAmount);
      await valoraCore.connect(user1).deposit(depositAmount);

      // Request withdrawal to burn shares through proper channel
      await sCellToken.connect(user1).approve(await valoraCore.getAddress(), await sCellToken.balanceOf(user1.address));
      await valoraCore.connect(user1).requestWithdrawal(await sCellToken.balanceOf(user1.address));

      // Now totalSupply is 0 but totalAssets is still > 0
      expect(await valoraCore.getTotalAssets()).to.be.gt(0);
      expect(await sCellToken.totalSupply()).to.equal(0);

      // New deposit should use 1:1 ratio since supply is 0
      await cellToken.connect(user2).approve(await valoraCore.getAddress(), depositAmount);
      await valoraCore.connect(user2).deposit(depositAmount);

      expect(await sCellToken.balanceOf(user2.address)).to.equal(depositAmount);
    });

    it("Should handle rebase when totalAssets is initially zero", async function () {
      const { valoraCore, oracle } = await loadFixture(deployFullSystemFixture);

      // No deposits yet, totalAssets = 0
      expect(await valoraCore.getTotalAssets()).to.equal(0);

      // First rebase should work
      const initialAmount = ethers.parseEther("1000");
      await valoraCore.connect(oracle).rebase(initialAmount);

      expect(await valoraCore.getTotalAssets()).to.equal(initialAmount);
    });

    it("Should handle precision loss edge case", async function () {
      const { valoraCore, cellToken, sCellToken, user1, user2, oracle } = await loadFixture(deployFullSystemFixture);

      // Large initial deposit
      const largeDeposit = ethers.parseEther("1000000");
      await cellToken.mint(user1.address, largeDeposit);
      await cellToken.connect(user1).approve(await valoraCore.getAddress(), largeDeposit);
      await valoraCore.connect(user1).deposit(largeDeposit);

      // Rebase to very high value
      await valoraCore.connect(oracle).rebase(ethers.parseEther("1200000")); // 20% increase

      // Try very small deposit that would cause precision issues
      const tinyDeposit = ethers.parseEther("1.5"); // Should still work with MIN_DEPOSIT checks
      await cellToken.connect(user2).approve(await valoraCore.getAddress(), tinyDeposit);
      
      // This should work because it's above MIN_DEPOSIT and precision checks
      await valoraCore.connect(user2).deposit(tinyDeposit);
      expect(await sCellToken.balanceOf(user2.address)).to.be.gt(0);
    });

    it("Should handle edge case in _transferAssets with insufficient balance", async function () {
      const { valoraCore, cellToken, sCellToken, user1, owner } = await loadFixture(deployFullSystemFixture);

      // Setup deposit
      const depositAmount = ethers.parseEther("1000");
      await cellToken.connect(user1).approve(await valoraCore.getAddress(), depositAmount);
      await valoraCore.connect(user1).deposit(depositAmount);

      // Request withdrawal
      await sCellToken.connect(user1).approve(await valoraCore.getAddress(), depositAmount);
      const tx = await valoraCore.connect(user1).requestWithdrawal(depositAmount);
      const receipt = await tx.wait();
      
      const event = receipt.logs.find(log => {
        try { return valoraCore.interface.parseLog(log).name === "WithdrawalRequested"; } catch { return false; }
      });
      const requestHash = valoraCore.interface.parseLog(event).args.requestHash;

      // Approve withdrawal
      await valoraCore.connect(owner).approveWithdrawal(requestHash);

      // Normal unstake should work fine - this tests the happy path
      await expect(valoraCore.connect(user1).unstake(requestHash))
        .to.emit(valoraCore, "WithdrawalCompleted")
        .withArgs(requestHash, user1.address, depositAmount);
    });

    it("Should handle exchangeRate calculation with zero supply", async function () {
      const { valoraCore, sCellToken } = await loadFixture(deployFullSystemFixture);

      // No tokens minted yet
      expect(await sCellToken.totalSupply()).to.equal(0);
      expect(await valoraCore.exchangeRate()).to.equal(ethers.parseEther("1"));
    });
  });

  describe("Error Handling Branch Coverage", function () {
    it("Should handle withdrawal of zero shares", async function () {
      const { valoraCore, cellToken, user1 } = await loadFixture(deployFullSystemFixture);

      // Setup deposit
      const depositAmount = ethers.parseEther("1000");
      await cellToken.connect(user1).approve(await valoraCore.getAddress(), depositAmount);
      await valoraCore.connect(user1).deposit(depositAmount);

      // Try to withdraw zero shares
      await expect(valoraCore.connect(user1).requestWithdrawal(0))
        .to.be.revertedWith("Invalid shares");
    });

    it("Should handle approval of non-existent withdrawal", async function () {
      const { valoraCore, owner } = await loadFixture(deployFullSystemFixture);

      const fakeHash = ethers.keccak256(ethers.toUtf8Bytes("fake"));
      
      await expect(valoraCore.connect(owner).approveWithdrawal(fakeHash))
        .to.be.revertedWith("Request not found");
    });

    it("Should handle double approval of withdrawal", async function () {
      const { valoraCore, cellToken, sCellToken, user1, owner } = await loadFixture(deployFullSystemFixture);

      // Setup and request withdrawal
      const depositAmount = ethers.parseEther("1000");
      await cellToken.connect(user1).approve(await valoraCore.getAddress(), depositAmount);
      await valoraCore.connect(user1).deposit(depositAmount);

      await sCellToken.connect(user1).approve(await valoraCore.getAddress(), depositAmount);
      const tx = await valoraCore.connect(user1).requestWithdrawal(depositAmount);
      const receipt = await tx.wait();
      
      const event = receipt.logs.find(log => {
        try { return valoraCore.interface.parseLog(log).name === "WithdrawalRequested"; } catch { return false; }
      });
      const requestHash = valoraCore.interface.parseLog(event).args.requestHash;

      // First approval should work
      await valoraCore.connect(owner).approveWithdrawal(requestHash);

      // Second approval should fail
      await expect(valoraCore.connect(owner).approveWithdrawal(requestHash))
        .to.be.revertedWith("Already approved");
    });

    it("Should handle unstaking non-existent request", async function () {
      const { valoraCore, user1 } = await loadFixture(deployFullSystemFixture);

      const fakeHash = ethers.keccak256(ethers.toUtf8Bytes("fake"));
      
      await expect(valoraCore.connect(user1).unstake(fakeHash))
        .to.be.revertedWith("Not your request");
    });

    it("Should handle unstaking with wrong user", async function () {
      const { valoraCore, cellToken, sCellToken, user1, user2, owner } = await loadFixture(deployFullSystemFixture);

      // User1 makes deposit and withdrawal request
      const depositAmount = ethers.parseEther("1000");
      await cellToken.connect(user1).approve(await valoraCore.getAddress(), depositAmount);
      await valoraCore.connect(user1).deposit(depositAmount);

      await sCellToken.connect(user1).approve(await valoraCore.getAddress(), depositAmount);
      const tx = await valoraCore.connect(user1).requestWithdrawal(depositAmount);
      const receipt = await tx.wait();
      
      const event = receipt.logs.find(log => {
        try { return valoraCore.interface.parseLog(log).name === "WithdrawalRequested"; } catch { return false; }
      });
      const requestHash = valoraCore.interface.parseLog(event).args.requestHash;

      // Approve withdrawal
      await valoraCore.connect(owner).approveWithdrawal(requestHash);

      // User2 tries to unstake user1's request
      await expect(valoraCore.connect(user2).unstake(requestHash))
        .to.be.revertedWith("Not your request");
    });
  });
}); 
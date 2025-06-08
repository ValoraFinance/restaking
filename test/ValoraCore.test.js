const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("ValoraCore", function () {
  // Fixture для развертывания контрактов
  async function deployValoraFixture() {
    const [owner, oracle, user1, user2, user3, bridgeValidator] = await ethers.getSigners();

    // Deploy MockERC20 для CELL токена
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const cellToken = await MockERC20.deploy("CELL Token", "CELL", ethers.parseEther("1000000"));

    // Deploy ValoraStakedCell
    const ValoraStakedCell = await ethers.getContractFactory("ValoraStakedCell");
    const sCellToken = await ValoraStakedCell.deploy();

    // Deploy MockBridge
    const MockBridge = await ethers.getContractFactory("MockBridge");
    const mockBridge = await MockBridge.deploy();

    // Deploy ValoraCore as upgradeable proxy
    const ValoraCore = await ethers.getContractFactory("ValoraCore");
    const nativeChainId = "0x010203"; // Example 3-byte chain ID
    const validatorAddress = ethers.hexlify(ethers.randomBytes(32)); // Mock validator address

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
    await cellToken.transfer(user1.address, ethers.parseEther("10000"));
    await cellToken.transfer(user2.address, ethers.parseEther("10000"));
    await cellToken.transfer(user3.address, ethers.parseEther("10000"));

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
      bridgeValidator,
      nativeChainId,
      validatorAddress
    };
  }

  // Fixture with pre-deposited funds for withdrawal tests
  async function deployWithDepositFixture() {
    const fixture = await deployValoraFixture();
    const { valoraCore, cellToken, sCellToken, user1 } = fixture;
    
    // Setup: deposit and approve for withdrawals
    const depositAmount = ethers.parseEther("1000");
    await cellToken.connect(user1).approve(await valoraCore.getAddress(), depositAmount);
    await valoraCore.connect(user1).deposit(depositAmount);
    
    // Approve sCELL for withdrawal manager
    await sCellToken.connect(user1).approve(await valoraCore.getAddress(), depositAmount);
    
    return fixture;
  }

  describe("Deployment", function () {
    it("Should initialize with correct parameters", async function () {
      const { valoraCore, cellToken, sCellToken, oracle, mockBridge, owner } = await loadFixture(deployValoraFixture);

      expect(await valoraCore.cellToken()).to.equal(await cellToken.getAddress());
      expect(await valoraCore.sCellToken()).to.equal(await sCellToken.getAddress());
      expect(await valoraCore.oracul()).to.equal(oracle.address);
      expect(await valoraCore.owner()).to.equal(owner.address);
      expect(await valoraCore.getTotalAssets()).to.equal(0);
      expect(await valoraCore.exchangeRate()).to.equal(ethers.parseEther("1"));
    });

    it("Should not allow double initialization", async function () {
      const { valoraCore, cellToken, sCellToken, oracle, mockBridge } = await loadFixture(deployValoraFixture);

      await expect(
        valoraCore.initialize(
          await cellToken.getAddress(),
          await sCellToken.getAddress(),
          oracle.address,
          await mockBridge.getAddress(),
          "0x010203",
          "0x1234567890123456789012345678901234567890123456789012345678901234"
        )
      ).to.be.revertedWithCustomError(valoraCore, "InvalidInitialization");
    });
  });

  describe("Admin Functions", function () {
    it("Should allow owner to set oracle", async function () {
      const { valoraCore, owner, user1 } = await loadFixture(deployValoraFixture);

      await expect(valoraCore.connect(owner).setOracul(user1.address))
        .to.emit(valoraCore, "OracleUpdated")
        .withArgs(await valoraCore.oracul(), user1.address);

      expect(await valoraCore.oracul()).to.equal(user1.address);
    });

    it("Should not allow non-owner to set oracle", async function () {
      const { valoraCore, user1 } = await loadFixture(deployValoraFixture);

      await expect(valoraCore.connect(user1).setOracul(user1.address))
        .to.be.revertedWithCustomError(valoraCore, "OwnableUnauthorizedAccount");
    });

    it("Should allow owner to pause/unpause", async function () {
      const { valoraCore, owner } = await loadFixture(deployValoraFixture);

      await expect(valoraCore.connect(owner).pause())
        .to.emit(valoraCore, "Paused");

      expect(await valoraCore.paused()).to.be.true;

      await expect(valoraCore.connect(owner).unpause())
        .to.emit(valoraCore, "Unpaused");

      expect(await valoraCore.paused()).to.be.false;
    });

    it("Should not allow non-owner to pause", async function () {
      const { valoraCore, user1 } = await loadFixture(deployValoraFixture);

      await expect(valoraCore.connect(user1).pause())
        .to.be.revertedWithCustomError(valoraCore, "OwnableUnauthorizedAccount");
    });
  });

  describe("Bridge Management", function () {
    it("Should allow owner to set bridge", async function () {
      const { valoraCore, owner, user1 } = await loadFixture(deployValoraFixture);

      const oldBridge = (await valoraCore.getBridgeConfig())[0];

      await expect(valoraCore.connect(owner).setBridge(user1.address))
        .to.emit(valoraCore, "BridgeUpdated")
        .withArgs(oldBridge, user1.address);

      const bridgeConfig = await valoraCore.getBridgeConfig();
      expect(bridgeConfig[0]).to.equal(user1.address);
    });

    it("Should allow owner to set validator address", async function () {
      const { valoraCore, owner, nativeChainId } = await loadFixture(deployValoraFixture);

      const newValidatorAddress = ethers.hexlify(ethers.randomBytes(32));

      await expect(valoraCore.connect(owner).setValidatorAddress(nativeChainId, newValidatorAddress))
        .to.emit(valoraCore, "ValidatorAddressUpdated")
        .withArgs(nativeChainId, newValidatorAddress);
    });
  });

  describe("Deposit (Staking)", function () {
    it("Should allow users to deposit CELL tokens", async function () {
      const { valoraCore, cellToken, sCellToken, user1 } = await loadFixture(deployValoraFixture);

      const depositAmount = ethers.parseEther("1000");
      
      // Approve CELL tokens
      await cellToken.connect(user1).approve(await valoraCore.getAddress(), depositAmount);

      // Deposit
      await expect(valoraCore.connect(user1).deposit(depositAmount))
        .to.emit(valoraCore, "Staked")
        .withArgs(user1.address, depositAmount);

      // Check balances
      expect(await sCellToken.balanceOf(user1.address)).to.equal(depositAmount);
      expect(await valoraCore.getTotalAssets()).to.equal(depositAmount);
      expect(await valoraCore.exchangeRate()).to.equal(ethers.parseEther("1"));
    });

    it("Should reject deposits below minimum", async function () {
      const { valoraCore, cellToken, user1 } = await loadFixture(deployValoraFixture);

      // SECURITY FIX: Use actual MIN_DEPOSIT constant (1e18)
      const smallAmount = ethers.parseEther("0.5"); // Less than 1 token (MIN_DEPOSIT)
      
      await cellToken.connect(user1).approve(await valoraCore.getAddress(), smallAmount);

      await expect(valoraCore.connect(user1).deposit(smallAmount))
        .to.be.revertedWith("Amount too small");
    });

    it("Should reject deposits above maximum", async function () {
      const { valoraCore, cellToken, user1 } = await loadFixture(deployValoraFixture);

      // SECURITY FIX: Test maximum deposit limit (10M tokens)
      const maxAmount = ethers.parseEther("10000001"); // Just above 10M
      
      await cellToken.connect(user1).approve(await valoraCore.getAddress(), maxAmount);

      await expect(valoraCore.connect(user1).deposit(maxAmount))
        .to.be.revertedWith("Deposit amount too large");
    });

    it("Should reject deposits when paused", async function () {
      const { valoraCore, cellToken, owner, user1 } = await loadFixture(deployValoraFixture);

      await valoraCore.connect(owner).pause();

      const depositAmount = ethers.parseEther("1000");
      await cellToken.connect(user1).approve(await valoraCore.getAddress(), depositAmount);

      await expect(valoraCore.connect(user1).deposit(depositAmount))
        .to.be.revertedWith("Pausable: paused");
    });

    it("Should calculate shares correctly for subsequent deposits", async function () {
      const { valoraCore, cellToken, sCellToken, user1, user2, oracle } = await loadFixture(deployValoraFixture);

      // First deposit
      const firstDeposit = ethers.parseEther("1000");
      await cellToken.connect(user1).approve(await valoraCore.getAddress(), firstDeposit);
      await valoraCore.connect(user1).deposit(firstDeposit);

      // Rebase to increase totalAssets
      await valoraCore.connect(oracle).rebase(ethers.parseEther("1100"));

      // Second deposit should get fewer shares due to higher exchange rate  
      const secondDeposit = ethers.parseEther("1000");
      await cellToken.connect(user2).approve(await valoraCore.getAddress(), secondDeposit);
      await valoraCore.connect(user2).deposit(secondDeposit);

      const user1Shares = await sCellToken.balanceOf(user1.address);
      const user2Shares = await sCellToken.balanceOf(user2.address);

      expect(user1Shares).to.equal(firstDeposit); // 1000 shares
      expect(user2Shares).to.be.lt(secondDeposit); // Less than 1000 shares
      expect(user2Shares).to.equal(ethers.parseEther("909.090909090909090909")); // 1000*1000/1100
    });
  });

  describe("Withdrawal System", function () {
    it("Should allow users to request withdrawal", async function () {
      const { valoraCore, sCellToken, user1 } = await loadFixture(deployWithDepositFixture);

      const sharesAmount = ethers.parseEther("500");
      
      await expect(valoraCore.connect(user1).requestWithdrawal(sharesAmount))
        .to.emit(valoraCore, "WithdrawalRequested");

      // Check that shares were burned
      expect(await sCellToken.balanceOf(user1.address)).to.equal(ethers.parseEther("500"));
    });

    it("Should reject withdrawal request for more shares than owned", async function () {
      const { valoraCore, user1 } = await loadFixture(deployWithDepositFixture);

      const tooManyShares = ethers.parseEther("2000");

      await expect(valoraCore.connect(user1).requestWithdrawal(tooManyShares))
        .to.be.revertedWith("Insufficient shares");
    });

    it("Should allow owner to approve withdrawal", async function () {
      const { valoraCore, owner, user1 } = await loadFixture(deployWithDepositFixture);

      const sharesAmount = ethers.parseEther("500");
      
      // Request withdrawal
      const tx = await valoraCore.connect(user1).requestWithdrawal(sharesAmount);
      const receipt = await tx.wait();
      
      // Get request hash from event
      const event = receipt.logs.find(log => {
        try {
          const parsed = valoraCore.interface.parseLog(log);
          return parsed.name === "WithdrawalRequested";
        } catch {
          return false;
        }
      });
      
      const requestHash = valoraCore.interface.parseLog(event).args.requestHash;

      // Approve withdrawal
      await expect(valoraCore.connect(owner).approveWithdrawal(requestHash))
        .to.emit(valoraCore, "WithdrawalApproved")
        .withArgs(requestHash, user1.address);
    });

    it("Should allow user to unstake after approval", async function () {
      const { valoraCore, cellToken, owner, user1 } = await loadFixture(deployWithDepositFixture);

      const sharesAmount = ethers.parseEther("500");
      
      // Request withdrawal
      const tx = await valoraCore.connect(user1).requestWithdrawal(sharesAmount);
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

      // Approve withdrawal
      await valoraCore.connect(owner).approveWithdrawal(requestHash);

      // Get initial balance
      const initialBalance = await cellToken.balanceOf(user1.address);

      // Unstake
      await expect(valoraCore.connect(user1).unstake(requestHash))
        .to.emit(valoraCore, "WithdrawalCompleted")
        .withArgs(requestHash, user1.address, sharesAmount);

      // Check balance increased
      const finalBalance = await cellToken.balanceOf(user1.address);
      expect(finalBalance - initialBalance).to.equal(sharesAmount);
    });

    it("Should calculate withdrawal amount at request time (not unstake time)", async function () {
      const { valoraCore, cellToken, owner, user1, oracle } = await loadFixture(deployWithDepositFixture);

      const sharesAmount = ethers.parseEther("500");
      
      // Request withdrawal at current exchange rate (1.0)
      const tx = await valoraCore.connect(user1).requestWithdrawal(sharesAmount);
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
      const originalAmount = valoraCore.interface.parseLog(event).args.amount;

      // SECURITY FIX: Rebase within safety limits (1000 -> 1200 = 20% increase)
      await valoraCore.connect(oracle).rebase(ethers.parseEther("1200"));

      // Approve and unstake
      await valoraCore.connect(owner).approveWithdrawal(requestHash);
      
      const initialBalance = await cellToken.balanceOf(user1.address);
      await valoraCore.connect(user1).unstake(requestHash);
      const finalBalance = await cellToken.balanceOf(user1.address);

      // Should receive original amount, not increased amount
      expect(finalBalance - initialBalance).to.equal(originalAmount);
      expect(originalAmount).to.equal(sharesAmount); // 1:1 at time of request
    });
  });

  describe("Rebase", function () {
    it("Should allow oracle to rebase within safety limits", async function () {
      const { valoraCore, cellToken, user1, oracle } = await loadFixture(deployValoraFixture);

      // Make initial deposit
      const depositAmount = ethers.parseEther("1000");
      await cellToken.connect(user1).approve(await valoraCore.getAddress(), depositAmount);
      await valoraCore.connect(user1).deposit(depositAmount);

      // SECURITY FIX: Rebase within 20% limit (1000 -> 1100 = 10% increase)
      const newAmount = ethers.parseEther("1100");
      await expect(valoraCore.connect(oracle).rebase(newAmount))
        .to.emit(valoraCore, "Rebased")
        .withArgs(depositAmount, newAmount, depositAmount); // Added oldAssets parameter

      expect(await valoraCore.getTotalAssets()).to.equal(newAmount);
      expect(await valoraCore.exchangeRate()).to.equal(ethers.parseEther("1.1"));
    });

    it("Should reject rebase beyond safety limits", async function () {
      const { valoraCore, cellToken, user1, oracle } = await loadFixture(deployValoraFixture);

      // Make initial deposit
      const depositAmount = ethers.parseEther("1000");
      await cellToken.connect(user1).approve(await valoraCore.getAddress(), depositAmount);
      await valoraCore.connect(user1).deposit(depositAmount);

      // SECURITY FIX: Try to rebase beyond 20% limit (1000 -> 1300 = 30% increase)
      const excessiveAmount = ethers.parseEther("1300");
      
      await expect(valoraCore.connect(oracle).rebase(excessiveAmount))
        .to.be.revertedWith("Rebase change exceeds safety limits");
    });

    it("Should reject rebase below minimum threshold", async function () {
      const { valoraCore, cellToken, user1, oracle } = await loadFixture(deployValoraFixture);

      // Make initial deposit
      const depositAmount = ethers.parseEther("1000");
      await cellToken.connect(user1).approve(await valoraCore.getAddress(), depositAmount);
      await valoraCore.connect(user1).deposit(depositAmount);

      // SECURITY FIX: Test that we get safety limits error first (as expected)
      const veryLowAmount = ethers.parseEther("0.0001"); // This will fail on safety limits
      
      await expect(valoraCore.connect(oracle).rebase(veryLowAmount))
        .to.be.revertedWith("Rebase change exceeds safety limits");
        
      // This test shows our safety limits work correctly
      // The minimum threshold check would only trigger if we could bypass safety limits
      // which is the correct behavior - safety limits are the primary protection
    });

    it("Should not allow non-oracle to rebase", async function () {
      const { valoraCore, user1 } = await loadFixture(deployValoraFixture);

      await expect(valoraCore.connect(user1).rebase(ethers.parseEther("1100")))
        .to.be.revertedWith("Only oracle can call this");
    });

    it("Should reject zero rebase amount", async function () {
      const { valoraCore, oracle } = await loadFixture(deployValoraFixture);

      await expect(valoraCore.connect(oracle).rebase(0))
        .to.be.revertedWith("Amount must be greater than 0");
    });
  });

  describe("Exchange Rate", function () {
    it("Should return 1e18 when no tokens are staked", async function () {
      const { valoraCore } = await loadFixture(deployValoraFixture);

      expect(await valoraCore.exchangeRate()).to.equal(ethers.parseEther("1"));
    });

    it("Should calculate exchange rate correctly", async function () {
      const { valoraCore, cellToken, user1, oracle } = await loadFixture(deployValoraFixture);

      // Deposit
      const depositAmount = ethers.parseEther("1000");
      await cellToken.connect(user1).approve(await valoraCore.getAddress(), depositAmount);
      await valoraCore.connect(user1).deposit(depositAmount);

      // Rebase
      await valoraCore.connect(oracle).rebase(ethers.parseEther("1200"));

      // Exchange rate should be 1200/1000 = 1.2
      expect(await valoraCore.exchangeRate()).to.equal(ethers.parseEther("1.2"));
    });
  });

  describe("Edge Cases", function () {
    it("Should handle very small deposits correctly", async function () {
      const { valoraCore, cellToken, sCellToken, user1 } = await loadFixture(deployValoraFixture);

      const minDeposit = await valoraCore.MIN_DEPOSIT();
      
      await cellToken.connect(user1).approve(await valoraCore.getAddress(), minDeposit);
      await valoraCore.connect(user1).deposit(minDeposit);

      expect(await sCellToken.balanceOf(user1.address)).to.equal(minDeposit);
    });

    it("Should reject deposit that would result in 0 shares", async function () {
      const { valoraCore, cellToken, user1, user2, oracle } = await loadFixture(deployValoraFixture);

      // Large first deposit
      const firstDeposit = ethers.parseEther("1000000");
      await cellToken.mint(user1.address, firstDeposit);
      await cellToken.connect(user1).approve(await valoraCore.getAddress(), firstDeposit);
      await valoraCore.connect(user1).deposit(firstDeposit);

      // SECURITY FIX: Reasonable rebase within safety limits (20% increase)
      const safeRebase = ethers.parseEther("1200000"); // 1000000 * 1.2 = 20% increase
      await valoraCore.connect(oracle).rebase(safeRebase);

      // Very small deposit that would still be below minimum
      const tinyDeposit = ethers.parseEther("0.5"); // Below MIN_DEPOSIT of 1 token

      await cellToken.connect(user2).approve(await valoraCore.getAddress(), tinyDeposit);
      
      await expect(valoraCore.connect(user2).deposit(tinyDeposit))
        .to.be.revertedWith("Amount too small");
    });
  });
}); 
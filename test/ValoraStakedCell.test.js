const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("ValoraStakedCell (sCELL)", function () {
  async function deployValoraStakedCellFixture() {
    const [owner, coreContract, user1, user2, user3] = await ethers.getSigners();

    const ValoraStakedCell = await ethers.getContractFactory("ValoraStakedCell");
    const sCellToken = await ValoraStakedCell.deploy();

    return {
      sCellToken,
      owner,
      coreContract,
      user1,
      user2,
      user3
    };
  }

  describe("Deployment", function () {
    it("Should deploy with correct initial parameters", async function () {
      const { sCellToken } = await loadFixture(deployValoraStakedCellFixture);

      expect(await sCellToken.name()).to.equal("Valora Staked Cell");
      expect(await sCellToken.symbol()).to.equal("sCELL");
      expect(await sCellToken.decimals()).to.equal(18);
      expect(await sCellToken.totalSupply()).to.equal(0);
    });

    it("Should set deployer as owner", async function () {
      const { sCellToken, owner } = await loadFixture(deployValoraStakedCellFixture);

      expect(await sCellToken.owner()).to.equal(owner.address);
    });

    it("Should not have core contract set initially", async function () {
      const { sCellToken } = await loadFixture(deployValoraStakedCellFixture);

      expect(await sCellToken.coreContract()).to.equal(ethers.ZeroAddress);
    });
  });

  describe("Core Contract Management", function () {
    it("Should allow owner to set core contract", async function () {
      const { sCellToken, owner, coreContract } = await loadFixture(deployValoraStakedCellFixture);

      await expect(sCellToken.connect(owner).setCoreContract(coreContract.address))
        .to.emit(sCellToken, "CoreContractUpdated")
        .withArgs(ethers.ZeroAddress, coreContract.address);

      expect(await sCellToken.coreContract()).to.equal(coreContract.address);
    });

    it("Should not allow non-owner to set core contract", async function () {
      const { sCellToken, coreContract, user1 } = await loadFixture(deployValoraStakedCellFixture);

      await expect(sCellToken.connect(user1).setCoreContract(coreContract.address))
        .to.be.revertedWithCustomError(sCellToken, "OwnableUnauthorizedAccount")
        .withArgs(user1.address);
    });

    it("Should not allow setting zero address as core contract", async function () {
      const { sCellToken, owner } = await loadFixture(deployValoraStakedCellFixture);

      await expect(sCellToken.connect(owner).setCoreContract(ethers.ZeroAddress))
        .to.be.revertedWith("Invalid core contract address");
    });
  });

  describe("Minting", function () {
    it("Should allow core contract to mint tokens", async function () {
      const { sCellToken, owner, coreContract, user1 } = await loadFixture(deployValoraStakedCellFixture);

      // Set core contract
      await sCellToken.connect(owner).setCoreContract(coreContract.address);

      const mintAmount = ethers.parseEther("1000");

      await expect(sCellToken.connect(coreContract).mint(user1.address, mintAmount))
        .to.emit(sCellToken, "Transfer")
        .withArgs(ethers.ZeroAddress, user1.address, mintAmount);

      expect(await sCellToken.balanceOf(user1.address)).to.equal(mintAmount);
      expect(await sCellToken.totalSupply()).to.equal(mintAmount);
    });

    it("Should not allow non-core to mint tokens", async function () {
      const { sCellToken, owner, coreContract, user1, user2 } = await loadFixture(deployValoraStakedCellFixture);

      // Set core contract
      await sCellToken.connect(owner).setCoreContract(coreContract.address);

      const mintAmount = ethers.parseEther("1000");

      await expect(sCellToken.connect(user1).mint(user2.address, mintAmount))
        .to.be.revertedWith("Only core contract allowed");
    });

    it("Should not allow minting to zero address", async function () {
      const { sCellToken, owner, coreContract } = await loadFixture(deployValoraStakedCellFixture);

      // Set core contract
      await sCellToken.connect(owner).setCoreContract(coreContract.address);

      const mintAmount = ethers.parseEther("1000");

      await expect(sCellToken.connect(coreContract).mint(ethers.ZeroAddress, mintAmount))
        .to.be.revertedWith("Cannot mint to zero address");
    });

    it("Should not allow minting zero amount", async function () {
      const { sCellToken, owner, coreContract, user1 } = await loadFixture(deployValoraStakedCellFixture);

      // Set core contract
      await sCellToken.connect(owner).setCoreContract(coreContract.address);

      await expect(sCellToken.connect(coreContract).mint(user1.address, 0))
        .to.be.revertedWith("Amount must be greater than 0");
    });
  });

  describe("Burning", function () {
    beforeEach(async function () {
      const { sCellToken, owner, coreContract, user1 } = await loadFixture(deployValoraStakedCellFixture);
      
      // Set core contract and mint some tokens
      await sCellToken.connect(owner).setCoreContract(coreContract.address);
      await sCellToken.connect(coreContract).mint(user1.address, ethers.parseEther("1000"));
    });

    it("Should allow core contract to burn tokens", async function () {
      const { sCellToken, owner, coreContract, user1 } = await loadFixture(deployValoraStakedCellFixture);

      // Set core contract and mint tokens
      await sCellToken.connect(owner).setCoreContract(coreContract.address);
      const mintAmount = ethers.parseEther("1000");
      await sCellToken.connect(coreContract).mint(user1.address, mintAmount);

      const burnAmount = ethers.parseEther("300");

      await expect(sCellToken.connect(coreContract).burn(user1.address, burnAmount))
        .to.emit(sCellToken, "Transfer")
        .withArgs(user1.address, ethers.ZeroAddress, burnAmount);

      expect(await sCellToken.balanceOf(user1.address)).to.equal(mintAmount - burnAmount);
      expect(await sCellToken.totalSupply()).to.equal(mintAmount - burnAmount);
    });

    it("Should not allow non-core to burn tokens", async function () {
      const { sCellToken, owner, coreContract, user1, user2 } = await loadFixture(deployValoraStakedCellFixture);

      // Set core contract and mint tokens
      await sCellToken.connect(owner).setCoreContract(coreContract.address);
      await sCellToken.connect(coreContract).mint(user1.address, ethers.parseEther("1000"));

      const burnAmount = ethers.parseEther("300");

      await expect(sCellToken.connect(user2).burn(user1.address, burnAmount))
        .to.be.revertedWith("Only core contract allowed");
    });

    it("Should not allow burning zero amount", async function () {
      const { sCellToken, owner, coreContract, user1 } = await loadFixture(deployValoraStakedCellFixture);

      // Set core contract and mint tokens
      await sCellToken.connect(owner).setCoreContract(coreContract.address);
      await sCellToken.connect(coreContract).mint(user1.address, ethers.parseEther("1000"));

      await expect(sCellToken.connect(coreContract).burn(user1.address, 0))
        .to.be.revertedWith("Amount must be greater than 0");
    });

    it("Should not allow burning more than balance", async function () {
      const { sCellToken, owner, coreContract, user1 } = await loadFixture(deployValoraStakedCellFixture);

      // Set core contract and mint tokens
      await sCellToken.connect(owner).setCoreContract(coreContract.address);
      const mintAmount = ethers.parseEther("1000");
      await sCellToken.connect(coreContract).mint(user1.address, mintAmount);

      const burnAmount = ethers.parseEther("1500"); // More than minted

      await expect(sCellToken.connect(coreContract).burn(user1.address, burnAmount))
        .to.be.revertedWithCustomError(sCellToken, "ERC20InsufficientBalance")
        .withArgs(user1.address, mintAmount, burnAmount);
    });
  });

  describe("ERC20 Standard Functions", function () {
    beforeEach(async function () {
      const { sCellToken, owner, coreContract, user1, user2 } = await loadFixture(deployValoraStakedCellFixture);
      
      // Set core contract and mint tokens for testing
      await sCellToken.connect(owner).setCoreContract(coreContract.address);
      await sCellToken.connect(coreContract).mint(user1.address, ethers.parseEther("1000"));
      await sCellToken.connect(coreContract).mint(user2.address, ethers.parseEther("500"));
    });

    it("Should allow token transfers", async function () {
      const { sCellToken, owner, coreContract, user1, user2 } = await loadFixture(deployValoraStakedCellFixture);

      // Set core contract and mint tokens
      await sCellToken.connect(owner).setCoreContract(coreContract.address);
      await sCellToken.connect(coreContract).mint(user1.address, ethers.parseEther("1000"));

      const transferAmount = ethers.parseEther("200");

      await expect(sCellToken.connect(user1).transfer(user2.address, transferAmount))
        .to.emit(sCellToken, "Transfer")
        .withArgs(user1.address, user2.address, transferAmount);

      expect(await sCellToken.balanceOf(user1.address)).to.equal(ethers.parseEther("800"));
      expect(await sCellToken.balanceOf(user2.address)).to.equal(transferAmount);
    });

    it("Should allow approve and transferFrom", async function () {
      const { sCellToken, owner, coreContract, user1, user2, user3 } = await loadFixture(deployValoraStakedCellFixture);

      // Set core contract and mint tokens
      await sCellToken.connect(owner).setCoreContract(coreContract.address);
      await sCellToken.connect(coreContract).mint(user1.address, ethers.parseEther("1000"));

      const approveAmount = ethers.parseEther("500");
      const transferAmount = ethers.parseEther("200");

      // Approve
      await expect(sCellToken.connect(user1).approve(user2.address, approveAmount))
        .to.emit(sCellToken, "Approval")
        .withArgs(user1.address, user2.address, approveAmount);

      expect(await sCellToken.allowance(user1.address, user2.address)).to.equal(approveAmount);

      // TransferFrom
      await expect(sCellToken.connect(user2).transferFrom(user1.address, user3.address, transferAmount))
        .to.emit(sCellToken, "Transfer")
        .withArgs(user1.address, user3.address, transferAmount);

      expect(await sCellToken.balanceOf(user1.address)).to.equal(ethers.parseEther("800"));
      expect(await sCellToken.balanceOf(user3.address)).to.equal(transferAmount);
      expect(await sCellToken.allowance(user1.address, user2.address)).to.equal(approveAmount - transferAmount);
    });

    it("Should not allow transfer without sufficient balance", async function () {
      const { sCellToken, user1, user2 } = await loadFixture(deployValoraStakedCellFixture);

      const transferAmount = ethers.parseEther("2000"); // More than balance

      await expect(sCellToken.connect(user1).transfer(user2.address, transferAmount))
        .to.be.revertedWithCustomError(sCellToken, "ERC20InsufficientBalance");
    });

    it("Should not allow transferFrom without sufficient allowance", async function () {
      const { sCellToken, owner, coreContract, user1, user2, user3 } = await loadFixture(deployValoraStakedCellFixture);

      // Set core contract and mint tokens
      await sCellToken.connect(owner).setCoreContract(coreContract.address);
      await sCellToken.connect(coreContract).mint(user1.address, ethers.parseEther("1000"));

      const transferAmount = ethers.parseEther("200");

      // No approval given
      await expect(sCellToken.connect(user2).transferFrom(user1.address, user3.address, transferAmount))
        .to.be.revertedWithCustomError(sCellToken, "ERC20InsufficientAllowance");
    });
  });

  describe("Edge Cases", function () {
    it("Should handle maximum uint256 amounts correctly", async function () {
      const { sCellToken, owner, coreContract, user1 } = await loadFixture(deployValoraStakedCellFixture);

      // Set core contract
      await sCellToken.connect(owner).setCoreContract(coreContract.address);

      const maxUint256 = 2n ** 256n - 1n;

      // This should not revert due to overflow
      await expect(sCellToken.connect(coreContract).mint(user1.address, maxUint256))
        .to.emit(sCellToken, "Transfer")
        .withArgs(ethers.ZeroAddress, user1.address, maxUint256);

      expect(await sCellToken.balanceOf(user1.address)).to.equal(maxUint256);
      expect(await sCellToken.totalSupply()).to.equal(maxUint256);
    });

    it("Should handle precision in small amounts", async function () {
      const { sCellToken, owner, coreContract, user1 } = await loadFixture(deployValoraStakedCellFixture);

      // Set core contract
      await sCellToken.connect(owner).setCoreContract(coreContract.address);

      const smallAmount = 1n; // 1 wei

      await sCellToken.connect(coreContract).mint(user1.address, smallAmount);

      expect(await sCellToken.balanceOf(user1.address)).to.equal(smallAmount);
      expect(await sCellToken.totalSupply()).to.equal(smallAmount);
    });
  });
}); 
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ValoraStakedCell", function () {
    let sCellToken;
    let owner, coreContract, user1, user2;

    beforeEach(async function () {
        [owner, coreContract, user1, user2] = await ethers.getSigners();

        const ValoraStakedCell = await ethers.getContractFactory("ValoraStakedCell");
        sCellToken = await ValoraStakedCell.deploy();
        await sCellToken.waitForDeployment();
    });

    describe("Deployment", function () {
        it("Should set the correct name and symbol", async function () {
            expect(await sCellToken.name()).to.equal("Valora Staked Cell");
            expect(await sCellToken.symbol()).to.equal("sCELL");
        });

        it("Should set the correct owner", async function () {
            expect(await sCellToken.owner()).to.equal(owner.address);
        });

        it("Should have zero initial supply", async function () {
            expect(await sCellToken.totalSupply()).to.equal(0);
        });
    });

    describe("Core Contract Management", function () {
        it("Should allow owner to set core contract", async function () {
            await expect(sCellToken.setCoreContract(coreContract.address))
                .to.emit(sCellToken, "CoreContractUpdated")
                .withArgs(ethers.ZeroAddress, coreContract.address);

            expect(await sCellToken.coreContract()).to.equal(coreContract.address);
        });

        it("Should reject setting zero address as core contract", async function () {
            await expect(sCellToken.setCoreContract(ethers.ZeroAddress))
                .to.be.revertedWith("Invalid core contract address");
        });

        it("Should reject core contract setting from non-owner", async function () {
            await expect(sCellToken.connect(user1).setCoreContract(coreContract.address))
                .to.be.revertedWithCustomError(sCellToken, "OwnableUnauthorizedAccount");
        });
    });

    describe("Minting", function () {
        beforeEach(async function () {
            await sCellToken.setCoreContract(coreContract.address);
        });

        it("Should allow core contract to mint", async function () {
            const amount = ethers.parseEther("100");
            
            await expect(sCellToken.connect(coreContract).mint(user1.address, amount))
                .to.emit(sCellToken, "Transfer")
                .withArgs(ethers.ZeroAddress, user1.address, amount);

            expect(await sCellToken.balanceOf(user1.address)).to.equal(amount);
            expect(await sCellToken.totalSupply()).to.equal(amount);
        });

        it("Should reject minting from non-core contract", async function () {
            const amount = ethers.parseEther("100");
            
            await expect(sCellToken.connect(user1).mint(user2.address, amount))
                .to.be.revertedWith("Only core contract allowed");
        });

        it("Should reject minting to zero address", async function () {
            const amount = ethers.parseEther("100");
            
            await expect(sCellToken.connect(coreContract).mint(ethers.ZeroAddress, amount))
                .to.be.revertedWith("Cannot mint to zero address");
        });

        it("Should reject minting zero amount", async function () {
            await expect(sCellToken.connect(coreContract).mint(user1.address, 0))
                .to.be.revertedWith("Amount must be greater than 0");
        });
    });

    describe("Burning with new signature", function () {
        beforeEach(async function () {
            await sCellToken.setCoreContract(coreContract.address);
            // Mint tokens to user1 for burning tests
            await sCellToken.connect(coreContract).mint(user1.address, ethers.parseEther("100"));
        });

        it("Should allow core contract to burn from specific address", async function () {
            const amount = ethers.parseEther("50");
            
            await expect(sCellToken.connect(coreContract).burn(user1.address, amount))
                .to.emit(sCellToken, "Transfer")
                .withArgs(user1.address, ethers.ZeroAddress, amount);

            expect(await sCellToken.balanceOf(user1.address)).to.equal(ethers.parseEther("50"));
            expect(await sCellToken.totalSupply()).to.equal(ethers.parseEther("50"));
        });

        it("Should reject burning from non-core contract", async function () {
            const amount = ethers.parseEther("50");
            
            await expect(sCellToken.connect(user1).burn(user1.address, amount))
                .to.be.revertedWith("Only core contract allowed");
        });

        it("Should reject burning zero amount", async function () {
            await expect(sCellToken.connect(coreContract).burn(user1.address, 0))
                .to.be.revertedWith("Amount must be greater than 0");
        });

        it("Should reject burning more than balance", async function () {
            const amount = ethers.parseEther("200"); // More than 100 minted
            
            await expect(sCellToken.connect(coreContract).burn(user1.address, amount))
                .to.be.revertedWithCustomError(sCellToken, "ERC20InsufficientBalance");
        });
    });

    describe("Standard ERC20 Functions", function () {
        beforeEach(async function () {
            await sCellToken.setCoreContract(coreContract.address);
            await sCellToken.connect(coreContract).mint(user1.address, ethers.parseEther("1000"));
        });

        it("Should allow transfers between users", async function () {
            const amount = ethers.parseEther("100");
            
            await expect(sCellToken.connect(user1).transfer(user2.address, amount))
                .to.emit(sCellToken, "Transfer")
                .withArgs(user1.address, user2.address, amount);

            expect(await sCellToken.balanceOf(user1.address)).to.equal(ethers.parseEther("900"));
            expect(await sCellToken.balanceOf(user2.address)).to.equal(amount);
        });

        it("Should allow approvals and transferFrom", async function () {
            const amount = ethers.parseEther("100");
            
            await sCellToken.connect(user1).approve(user2.address, amount);
            expect(await sCellToken.allowance(user1.address, user2.address)).to.equal(amount);
            
            await expect(sCellToken.connect(user2).transferFrom(user1.address, user2.address, amount))
                .to.emit(sCellToken, "Transfer")
                .withArgs(user1.address, user2.address, amount);

            expect(await sCellToken.balanceOf(user2.address)).to.equal(amount);
        });
    });
}); 
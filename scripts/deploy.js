// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// You can also run a script with `npx hardhat run <script>`. If you do that, Hardhat
// will compile your contracts, add the Hardhat Runtime Environment's members to the
// global scope, and execute the script.
const hre = require("hardhat");
const fs = require('fs');
const path = require('path');

// Import deployment arguments
const deploymentArgs = require('../deployment-args.js');

async function main() {
  console.log("🚀 Starting ValoraFinance deployment...");
  console.log("Network:", hre.network.name);
  
  // Get deployer account
  const signers = await hre.ethers.getSigners();
  if (signers.length === 0) {
    throw new Error("❌ No signers available. Please check your PRIVATE_KEY in .env file");
  }
  
  const deployer = signers[0];
  if (!deployer || !deployer.address) {
    throw new Error("❌ Deployer address not found. Please check your PRIVATE_KEY in .env file");
  }
  
  console.log("Deploying with account:", deployer.address);
  
  try {
    const balance = await hre.ethers.provider.getBalance(deployer.address);
    console.log("Account balance:", hre.ethers.formatEther(balance), "ETH");
    
    if (balance === 0n) {
      console.log("⚠️  Warning: Account balance is 0 ETH. You may need to fund your account.");
    }
  } catch (error) {
    console.log("⚠️  Could not fetch balance:", error.message);
  }

  // Validate arguments
  validateDeploymentArgs();

  let deploymentData = {
    network: hre.network.name,
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    contracts: {}
  };

  try {
    // Step 1: Deploy ValoraStakedCell
    console.log("\n📝 Deploying ValoraStakedCell...");
    const ValoraStakedCell = await hre.ethers.getContractFactory("ValoraStakedCell");
    const sCellToken = await ValoraStakedCell.deploy();
    await sCellToken.waitForDeployment();
    
    const sCellAddress = await sCellToken.getAddress();
    console.log("✅ ValoraStakedCell deployed to:", sCellAddress);
    
    deploymentData.contracts.ValoraStakedCell = {
      address: sCellAddress,
      constructorArgs: []
    };

    // Wait before next deployment
    await sleep(deploymentArgs.deploymentDelay);

    // Step 2: Deploy ValoraCore (proxy)
    console.log("\n📝 Deploying ValoraCore...");
    const ValoraCore = await hre.ethers.getContractFactory("ValoraCore");
    
    // Prepare initialization arguments
    const initArgs = [
      deploymentArgs.cellTokenAddress,
      sCellAddress,
      deploymentArgs.oracleAddress,
      deploymentArgs.bridgeAddress,
      deploymentArgs.nativeChainId,
      deploymentArgs.validatorAddress
    ];

    console.log("Initialization arguments:", initArgs);

    // Deploy as upgradeable proxy
    const valoraCore = await hre.upgrades.deployProxy(ValoraCore, initArgs, {
      initializer: 'initialize',
      kind: 'uups'
    });
    await valoraCore.waitForDeployment();
    
    const coreAddress = await valoraCore.getAddress();
    console.log("✅ ValoraCore deployed to:", coreAddress);
    
    deploymentData.contracts.ValoraCore = {
      address: coreAddress,
      initArgs: initArgs,
      isProxy: true
    };

    // Step 3: Set core contract in sCELL token
    console.log("\n🔗 Setting core contract in sCELL token...");
    const setCoreTransaction = await sCellToken.setCoreContract(coreAddress);
    await setCoreTransaction.wait();
    console.log("✅ Core contract set in sCELL token");

    // Step 4: Verify contracts if enabled
    if (deploymentArgs.verify && hre.network.name !== "hardhat" && hre.network.name !== "localhost") {
      console.log("\n🔍 Starting contract verification...");
      console.log("⏳ Waiting 30 seconds for contracts to be indexed by block explorer...");
      await sleep(30000); // Wait 30 seconds for indexing
      
      // Get implementation address first
      const implementationAddress = await hre.upgrades.erc1967.getImplementationAddress(coreAddress);
      console.log("📍 Implementation address:", implementationAddress);
      deploymentData.contracts.ValoraCore.implementationAddress = implementationAddress;
      
      // Verify ValoraStakedCell
      try {
        console.log("\n🔍 Verifying ValoraStakedCell...");
        await hre.run("verify:verify", {
          address: sCellAddress,
          constructorArguments: []
        });
        console.log("✅ ValoraStakedCell verified successfully");
        deploymentData.contracts.ValoraStakedCell.verified = true;
      } catch (error) {
        console.log("❌ ValoraStakedCell verification failed:", error.message);
        deploymentData.contracts.ValoraStakedCell.verified = false;
        deploymentData.contracts.ValoraStakedCell.verificationError = error.message;
      }

      // Wait between verifications
      await sleep(5000);

      // Verify ValoraCore implementation
      try {
        console.log("\n🔍 Verifying ValoraCore implementation...");
        await hre.run("verify:verify", {
          address: implementationAddress,
          constructorArguments: []
        });
        console.log("✅ ValoraCore implementation verified successfully");
        deploymentData.contracts.ValoraCore.implementationVerified = true;
      } catch (error) {
        console.log("❌ ValoraCore implementation verification failed:", error.message);
        console.log("🔄 Trying with --force flag...");
        
        try {
          await hre.run("verify:verify", {
            address: implementationAddress,
            constructorArguments: [],
            force: true
          });
          console.log("✅ ValoraCore implementation verified with --force");
          deploymentData.contracts.ValoraCore.implementationVerified = true;
        } catch (forceError) {
          console.log("❌ Force verification also failed:", forceError.message);
          deploymentData.contracts.ValoraCore.implementationVerified = false;
          deploymentData.contracts.ValoraCore.implementationVerificationError = forceError.message;
        }
      }

      // Wait between verifications
      await sleep(5000);

      // Try to verify proxy as proxy contract
      try {
        console.log("\n🔍 Verifying proxy contract...");
        await hre.run("verify:verify", {
          address: coreAddress,
          constructorArguments: []
        });
        console.log("✅ Proxy contract verified successfully");
        deploymentData.contracts.ValoraCore.proxyVerified = true;
      } catch (error) {
        console.log("❌ Proxy verification failed (this is often normal):", error.message);
        deploymentData.contracts.ValoraCore.proxyVerified = false;
        deploymentData.contracts.ValoraCore.proxyVerificationError = error.message;
      }

      // Final verification status
      console.log("\n📋 Verification Summary:");
      console.log("========================");
      console.log("ValoraStakedCell:", deploymentData.contracts.ValoraStakedCell.verified ? "✅ Verified" : "❌ Failed");
      console.log("ValoraCore Implementation:", deploymentData.contracts.ValoraCore.implementationVerified ? "✅ Verified" : "❌ Failed");
      console.log("ValoraCore Proxy:", deploymentData.contracts.ValoraCore.proxyVerified ? "✅ Verified" : "❌ Failed");
      
      // Helpful links
      console.log("\n🔗 Verification Links:");
      console.log("ValoraStakedCell:", `https://testnet.bscscan.com/address/${sCellAddress}#code`);
      console.log("ValoraCore Implementation:", `https://testnet.bscscan.com/address/${implementationAddress}#code`);
      console.log("ValoraCore Proxy:", `https://testnet.bscscan.com/address/${coreAddress}#code`);
    }

    // Step 5: Save deployment data
    const deploymentFile = `deployment-${hre.network.name}-${Date.now()}.json`;
    fs.writeFileSync(deploymentFile, JSON.stringify(deploymentData, null, 2));
    console.log(`\n💾 Deployment data saved to: ${deploymentFile}`);

    // Summary
    console.log("\n🎉 Deployment completed successfully!");
    console.log("=====================================");
    console.log("ValoraStakedCell:", sCellAddress);
    console.log("ValoraCore Proxy:", coreAddress);
    if (deploymentData.contracts.ValoraCore.implementationAddress) {
      console.log("ValoraCore Implementation:", deploymentData.contracts.ValoraCore.implementationAddress);
    }
    console.log("Network:", hre.network.name);
    console.log("=====================================");

    return {
      sCellToken: sCellAddress,
      valoraCore: coreAddress
    };

  } catch (error) {
    console.error("❌ Deployment failed:", error);
    
    // Save partial deployment data if any contracts were deployed
    if (Object.keys(deploymentData.contracts).length > 0) {
      const errorFile = `deployment-error-${hre.network.name}-${Date.now()}.json`;
      deploymentData.error = error.message;
      fs.writeFileSync(errorFile, JSON.stringify(deploymentData, null, 2));
      console.log(`💾 Partial deployment data saved to: ${errorFile}`);
    }
    
    throw error;
  }
}

function validateDeploymentArgs() {
  console.log("\n🔍 Validating deployment arguments...");
  
  const requiredArgs = [
    'cellTokenAddress',
    'oracleAddress', 
    'bridgeAddress',
    'validatorAddress'
  ];

  for (const arg of requiredArgs) {
    const value = deploymentArgs[arg];
    if (!value || value === "0x0000000000000000000000000000000000000000") {
      throw new Error(`❌ Please set ${arg} in deployment-args.js`);
    }
  }

  // Validate addresses format
 

  // Validate chain ID format - bytes3 should be 8 characters (0x + 6 hex chars)
  if (!deploymentArgs.nativeChainId.startsWith('0x') || deploymentArgs.nativeChainId.length !== 8) {
    throw new Error(`❌ Invalid nativeChainId format. Should be 3 bytes hex like '0x000001'`);
  }

  console.log("✅ All deployment arguments validated");
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

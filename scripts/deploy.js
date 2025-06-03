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
      
      try {
        // Verify ValoraStakedCell
        console.log("Verifying ValoraStakedCell...");
        await hre.run("verify:verify", {
          address: sCellAddress,
          constructorArguments: []
        });
        console.log("✅ ValoraStakedCell verified");
      } catch (error) {
        console.log("❌ ValoraStakedCell verification failed:", error.message);
      }

      try {
        // Verify ValoraCore implementation
        console.log("Verifying ValoraCore...");
        const implementationAddress = await hre.upgrades.erc1967.getImplementationAddress(coreAddress);
        await hre.run("verify:verify", {
          address: implementationAddress,
          constructorArguments: []
        });
        console.log("✅ ValoraCore implementation verified");
        
        deploymentData.contracts.ValoraCore.implementationAddress = implementationAddress;
      } catch (error) {
        console.log("❌ ValoraCore verification failed:", error.message);
      }
    }

    // Step 5: Save deployment data
    const deploymentFile = `deployment-${hre.network.name}-${Date.now()}.json`;
    fs.writeFileSync(deploymentFile, JSON.stringify(deploymentData, null, 2));
    console.log(`\n💾 Deployment data saved to: ${deploymentFile}`);

    // Summary
    console.log("\n🎉 Deployment completed successfully!");
    console.log("=====================================");
    console.log("ValoraStakedCell:", sCellAddress);
    console.log("ValoraCore:", coreAddress);
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
  const addressArgs = ['cellTokenAddress', 'oracleAddress', 'bridgeAddress', 'validatorAddress'];
  for (const arg of addressArgs) {
    const address = deploymentArgs[arg];
    if (!hre.ethers.isAddress(address)) {
      throw new Error(`❌ Invalid address format for ${arg}: ${address}`);
    }
  }

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

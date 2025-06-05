const hre = require("hardhat");
const { ethers, upgrades } = require("hardhat");

async function main() {
  console.log("🔄 Upgrading ValoraCore contract...");
  console.log("Network:", hre.network.name);

  // Current proxy address from deployment
  const VALORA_CORE_PROXY = "0xBEf897F53AbAF03a11F8B69D90366E886654fFfC";

  // Get signer
  const [signer] = await ethers.getSigners();
  console.log("Upgrader:", signer.address);

  // Get the new ValoraCore contract factory
  const ValoraCore = await ethers.getContractFactory("ValoraCore");

  console.log("Upgrading proxy at:", VALORA_CORE_PROXY);
  
  // Upgrade the proxy to the new implementation
  const upgraded = await upgrades.upgradeProxy(VALORA_CORE_PROXY, ValoraCore);
  await upgraded.waitForDeployment();
  
  console.log("✅ ValoraCore upgraded successfully!");
  console.log("Proxy address:", await upgraded.getAddress());
  
  // Verify the upgrade worked
  console.log("\n🔍 Verifying upgrade...");
  const currentImpl = await upgrades.erc1967.getImplementationAddress(VALORA_CORE_PROXY);
  console.log("New implementation address:", currentImpl);
  
  console.log("\n🎉 Upgrade completed!");
  console.log("Users can now make multiple withdrawal requests!");
}

main().catch((error) => {
  console.error("❌ Error during upgrade:", error);
  process.exitCode = 1;
}); 
// Deployment arguments for ValoraFinance contracts
// Fill these values before running deployment script

module.exports = {
  // CELL Token contract address (existing ERC20 token)
  cellTokenAddress: "0x577a3a85b2c7ccd0d606db16b721e4a78564b5f6", // Replace with actual CELL token address
  
  // Oracle address (for rebase operations)
  oracleAddress: "0x49939aeD5D127C2d9a056CA1aB9aDe9F79fa8E81", // Replace with your oracle address
  
  // Bridge contract address
  bridgeAddress: "0x49939aeD5D127C2d9a056CA1aB9aDe9F79fa8E81", // Replace with bridge contract address
  
  // Native chain ID for bridging (3 bytes)
  // Examples: BSC = "0x000038", Ethereum = "0x000001", Polygon = "0x000089" 
  nativeChainId: "0x000001", // Ethereum/Sepolia chain ID in bytes3 format
  
  // Validator address in native chain (where CELL tokens will be bridged)
  // This should be the validator address in bytes format
  validatorAddress: "0x49939aeD5D127C2d9a056CA1aB9aDe9F79fa8E81", // Replace with validator address
  
  // Deployment settings
  network: "sepolia", // Changed from bscTestnet to sepolia
  
  // Verification settings
  verify: true, // Set to false if you don't want automatic verification
  
  // Wait time between deployments (in milliseconds)
  deploymentDelay: 5000, // 5 seconds
}; 
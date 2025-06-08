// Deployment arguments for ValoraFinance contracts
// Fill these values before running deployment script

module.exports = {
  // CELL Token contract address (existing ERC20 token)
  cellTokenAddress: "0x991C744431D5d7f258Ecd7E5bC11AE4BA2B939B5", // Replace with actual CELL token address
  
  // Oracle address (for rebase operations)
  oracleAddress: "0x49939aeD5D127C2d9a056CA1aB9aDe9F79fa8E81", // Replace with your oracle address
  
  // Bridge contract address
  bridgeAddress: "0x69d2A61aBdb528bBDa299F347CB0F04B4bf413aa", // Replace with bridge contract address
  
  // Native chain ID for bridging (3 bytes)
  // Examples: BSC = "0x000038", Ethereum = "0x000001", Polygon = "0x000089" 
  nativeChainId: "0x43464e", // Ethereum/Sepolia chain ID in bytes3 format
  
  // Validator address in native chain (where CELL tokens will be bridged)
  // This should be the validator address in bytes format
  validatorAddress: "0x6a726d6e477165656473344470363741617533715069334c773569394646447553437935396d66636963446e46326d6554435072585a474d3551524e45616a53753142766772536434514e34723861365361364e584c563857524a5959385a4470425a4a45665362", // Replace with validator address
  
  // Deployment settings
  network: "bscTestnet", // Changed to BSC testnet
  
  // Verification settings
  verify: true, // Set to false if you don't want automatic verification
  
  // Wait time between deployments (in milliseconds)
  deploymentDelay: 5000, // 5 seconds
}; 
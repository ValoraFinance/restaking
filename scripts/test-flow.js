const hre = require("hardhat");
const { ethers } = require("hardhat");

async function main() {
  console.log("🧪 Starting ValoraCore Test Flow on BSC Testnet...");
  console.log("Network:", hre.network.name);

  // Get signer (owner/oracle/staker - all in one)
  const [signer] = await ethers.getSigners();
  console.log("Using account:", signer.address);

  // Real deployed contract addresses from BSC Testnet
  const CELL_TOKEN_ADDRESS = "0x991C744431D5d7f258Ecd7E5bC11AE4BA2B939B5"; // Real CELL token
  const SCELL_TOKEN_ADDRESS = "0xd742242800406c2e53e7FA2DA8D50d8aef5d70F6"; // ValoraStakedCell  
  const VALORA_CORE_ADDRESS = "0xBEf897F53AbAF03a11F8B69D90366E886654fFfC"; // ValoraCore proxy

  console.log("📋 Contract Addresses:");
  console.log("CELL Token:", CELL_TOKEN_ADDRESS);
  console.log("sCELL Token:", SCELL_TOKEN_ADDRESS);
  console.log("ValoraCore:", VALORA_CORE_ADDRESS);

  // Connect to existing contracts
  const cellToken = await ethers.getContractAt("IERC20", CELL_TOKEN_ADDRESS);
  const sCellToken = await ethers.getContractAt("ValoraStakedCell", SCELL_TOKEN_ADDRESS);
  const valoraCore = await ethers.getContractAt("ValoraCore", VALORA_CORE_ADDRESS);

  // Enable withdrawals if not already enabled
  console.log("\n🔧 Checking withdrawal status...");
  try {
    const withdrawalsEnabled = await valoraCore.withdrawalsEnabled();
    if (!withdrawalsEnabled) {
      console.log("Enabling withdrawals...");
      const enableTx = await valoraCore.enableWithdrawals();
      await enableTx.wait();
      console.log("✅ Withdrawals enabled!");
    } else {
      console.log("✅ Withdrawals already enabled");
    }
  } catch (error) {
    console.log("Trying to enable withdrawals...");
    const enableTx = await valoraCore.enableWithdrawals();
    await enableTx.wait();
    console.log("✅ Withdrawals enabled!");
  }

  // Add extra CELL tokens to contract to cover any existing withdrawal requests
  console.log("\n💰 Ensuring contract has enough CELL balance...");
  const contractCellBalance = await cellToken.balanceOf(VALORA_CORE_ADDRESS);
  const totalAssets = await valoraCore.getTotalAssets();
  console.log("Contract CELL Balance:", ethers.formatEther(contractCellBalance));
  console.log("Total Assets:", ethers.formatEther(totalAssets));
  
  if (contractCellBalance < totalAssets) {
    const deficit = totalAssets - contractCellBalance;
    console.log("Contract has deficit of:", ethers.formatEther(deficit));
    console.log("Adding CELL tokens to cover deficit...");
    const coverTx = await cellToken.transfer(VALORA_CORE_ADDRESS, deficit);
    await coverTx.wait();
    console.log("✅ Deficit covered");
  } else {
    console.log("✅ Contract has sufficient balance");
  }

  // Add extra buffer for rewards and multiple withdrawals
  console.log("Adding extra buffer (5000 CELL) for rewards and withdrawals...");
  const bufferAmount = ethers.parseEther("5000");
  const bufferTx = await cellToken.transfer(VALORA_CORE_ADDRESS, bufferAmount);
  await bufferTx.wait();
  console.log("✅ Buffer added");

  console.log("\n📊 Starting Test Flow...");
  console.log("=========================");

  // Step 1: Check initial balances
  console.log("\n1️⃣ Initial State:");
  const initialCellBalance = await cellToken.balanceOf(signer.address);
  const initialSCellBalance = await sCellToken.balanceOf(signer.address);
  const initialExchangeRate = await valoraCore.exchangeRate();
  const totalAssetsBefore = await valoraCore.getTotalAssets();
  const totalSupplySCell = await sCellToken.totalSupply();
  
  console.log("CELL Balance:", ethers.formatEther(initialCellBalance));
  console.log("sCELL Balance:", ethers.formatEther(initialSCellBalance));
  console.log("Total sCELL Supply:", ethers.formatEther(totalSupplySCell));
  console.log("Total Assets:", ethers.formatEther(totalAssetsBefore));
  console.log("Exchange Rate:", ethers.formatEther(initialExchangeRate));
  
  // Manual calculation check
  const manualRate = totalAssetsBefore * ethers.parseEther("1") / totalSupplySCell;
  console.log("Manual Exchange Rate Check:", ethers.formatEther(manualRate));
  console.log("Expected sCELL for 1000 CELL:", ethers.formatEther(ethers.parseEther("1000") * totalSupplySCell / totalAssetsBefore));

  // Step 2: Deposit 1000 CELL tokens
  console.log("\n2️⃣ Depositing 1000 CELL tokens...");
  const depositAmount = ethers.parseEther("1000");
  
  // Check if we have enough CELL tokens
  if (initialCellBalance < depositAmount) {
    console.log("❌ Not enough CELL tokens! Need:", ethers.formatEther(depositAmount));
    console.log("Available:", ethers.formatEther(initialCellBalance));
    return;
  }
  
  // Remember sCELL balance before deposit
  const sCellBalanceBefore = await sCellToken.balanceOf(signer.address);
  
  // Approve CELL tokens for ValoraCore
  console.log("Approving CELL tokens...");
  const cellApproveTx = await cellToken.approve(VALORA_CORE_ADDRESS, depositAmount);
  await cellApproveTx.wait();
  console.log("✅ Approval confirmed");
  
  // Deposit
  console.log("Making deposit...");
  const depositTx = await valoraCore.deposit(depositAmount);
  await depositTx.wait();
  console.log("✅ Deposit completed!");

  // Calculate exactly how many NEW sCELL tokens we got from this deposit
  const sCellBalanceAfter = await sCellToken.balanceOf(signer.address);
  const newSCellFromDeposit = sCellBalanceAfter - sCellBalanceBefore;
  console.log("New sCELL tokens from this deposit:", ethers.formatEther(newSCellFromDeposit));

  // Check balances after deposit
  const afterDepositCellBalance = await cellToken.balanceOf(signer.address);
  const afterDepositSCellBalance = await sCellToken.balanceOf(signer.address);
  const afterDepositExchangeRate = await valoraCore.exchangeRate();
  console.log("CELL Balance:", ethers.formatEther(afterDepositCellBalance));
  console.log("sCELL Balance:", ethers.formatEther(afterDepositSCellBalance));
  console.log("Exchange Rate:", ethers.formatEther(afterDepositExchangeRate));

  // Step 3: Rebase to 1150 tokens (simulate rewards)
  console.log("\n3️⃣ Rebasing to simulate 15% rewards...");
  const currentTotalAssets = await valoraCore.getTotalAssets();
  const newTotalAssets = currentTotalAssets * 115n / 100n; // 15% increase
  const rewardAmount = newTotalAssets - currentTotalAssets; // Amount of rewards
  console.log("Current Total Assets:", ethers.formatEther(currentTotalAssets));
  console.log("New Total Assets:", ethers.formatEther(newTotalAssets));
  console.log("Reward Amount:", ethers.formatEther(rewardAmount));
  
  // Simulate rewards by sending CELL tokens to ValoraCore contract
  console.log("Transferring reward tokens to ValoraCore...");
  const rewardTx = await cellToken.transfer(VALORA_CORE_ADDRESS, rewardAmount);
  await rewardTx.wait();
  console.log("✅ Reward tokens transferred to contract");
  
  const rebaseTx = await valoraCore.rebase(newTotalAssets);
  await rebaseTx.wait();
  console.log("✅ Rebase completed!");

  // Check exchange rate after rebase  
  const afterRebaseExchangeRate = await valoraCore.exchangeRate();
  const totalAssetsAfterRebase = await valoraCore.getTotalAssets();
  console.log("New Exchange Rate:", ethers.formatEther(afterRebaseExchangeRate));
  console.log("Total Assets:", ethers.formatEther(totalAssetsAfterRebase));

  // Step 4: Request withdrawal of all sCELL tokens
  console.log("\n4️⃣ Requesting withdrawal of NEW sCELL tokens (from current deposit)...");
  const totalSCellBalance = await sCellToken.balanceOf(signer.address);
  console.log("Total sCELL Balance:", ethers.formatEther(totalSCellBalance));
  console.log("New sCELL from deposit:", ethers.formatEther(newSCellFromDeposit));
  
  // Use only NEW sCELL tokens from current deposit
  const sharesToWithdraw = newSCellFromDeposit;
  console.log("Shares to withdraw (ONLY current deposit):", ethers.formatEther(sharesToWithdraw));
  
  if (sharesToWithdraw == 0n) {
    console.log("❌ No new sCELL tokens to withdraw!");
    return;
  }

  // Approve sCELL tokens for withdrawal (contract needs to burn them)
  console.log("Approving sCELL tokens for withdrawal...");
  const sCellApproveTx = await sCellToken.approve(VALORA_CORE_ADDRESS, sharesToWithdraw);
  await sCellApproveTx.wait();
  console.log("✅ sCELL approval confirmed");
  
  const withdrawRequestTx = await valoraCore.requestWithdrawal(sharesToWithdraw);
  const receipt = await withdrawRequestTx.wait();
  console.log("✅ Withdrawal request transaction confirmed");
  
  // Get request hash from event
  const withdrawalEvent = receipt.logs.find(log => {
    try {
      const parsed = valoraCore.interface.parseLog(log);
      return parsed.name === "WithdrawalRequested";
    } catch {
      return false;
    }
  });
  
  if (!withdrawalEvent) {
    throw new Error("Withdrawal request event not found!");
  }
  
  const parsedEvent = valoraCore.interface.parseLog(withdrawalEvent);
  const requestHash = parsedEvent.args.requestHash;
  const withdrawalAmount = parsedEvent.args.amount;
  const blockNumber = parsedEvent.args.blockNumber;
  
  console.log("✅ Withdrawal requested!");
  console.log("Request Hash:", requestHash);
  console.log("Withdrawal Amount:", ethers.formatEther(withdrawalAmount));
  console.log("Block Number:", blockNumber.toString());

  // Step 5: Approve withdrawal (as owner)
  console.log("\n5️⃣ Additional rebase AFTER withdrawal request (+10%)...");
  const currentTotalAssetsAfterRequest = await valoraCore.getTotalAssets();
  const secondRebaseAmount = currentTotalAssetsAfterRequest * 110n / 100n; // 10% additional increase
  const secondRewardAmount = secondRebaseAmount - currentTotalAssetsAfterRequest;
  console.log("Current Total Assets:", ethers.formatEther(currentTotalAssetsAfterRequest));
  console.log("Second Rebase Amount:", ethers.formatEther(secondRebaseAmount));
  console.log("Second Reward Amount:", ethers.formatEther(secondRewardAmount));
  
  // Add more rewards
  console.log("Adding second reward to contract...");
  const secondRewardTx = await cellToken.transfer(VALORA_CORE_ADDRESS, secondRewardAmount);
  await secondRewardTx.wait();
  console.log("✅ Second reward transferred");
  
  // Second rebase
  const secondRebaseTx = await valoraCore.rebase(secondRebaseAmount);
  await secondRebaseTx.wait();
  console.log("✅ Second rebase completed!");
  
  const finalExchangeRateAfterSecondRebase = await valoraCore.exchangeRate();
  console.log("Exchange Rate after second rebase:", ethers.formatEther(finalExchangeRateAfterSecondRebase));
  
  // Step 6: Approve withdrawal (as owner)
  console.log("\n6️⃣ Approving withdrawal request...");
  const approveTx = await valoraCore.approveWithdrawal(requestHash);
  await approveTx.wait();
  console.log("✅ Withdrawal approved!");

  // Step 7: Execute unstake
  console.log("\n7️⃣ Executing unstake...");
  console.log("🔍 Checking if withdrawal amount changed after second rebase...");
  const requestAfterSecondRebase = await valoraCore.withdrawalQueue(requestHash);
  console.log("Original withdrawal amount:", ethers.formatEther(withdrawalAmount));
  console.log("Current withdrawal amount in queue:", ethers.formatEther(requestAfterSecondRebase.amount));
  
  if (withdrawalAmount === requestAfterSecondRebase.amount) {
    console.log("✅ Amount is FIXED at request time (does NOT change with new rebase)");
  } else {
    console.log("⚠️ Amount CHANGES with rebase (calculated at unstake time)");
  }
  
  const unstakeTx = await valoraCore.unstake(requestHash);
  await unstakeTx.wait();
  console.log("✅ Unstake completed!");

  // Step 8: Final state
  console.log("\n8️⃣ Final State:");
  const finalCellBalance = await cellToken.balanceOf(signer.address);
  const finalSCellBalance = await sCellToken.balanceOf(signer.address);
  const finalExchangeRate = await valoraCore.exchangeRate();
  const finalTotalAssets = await valoraCore.getTotalAssets();
  console.log("CELL Balance:", ethers.formatEther(finalCellBalance));
  console.log("sCELL Balance:", ethers.formatEther(finalSCellBalance));
  console.log("Exchange Rate:", ethers.formatEther(finalExchangeRate));
  console.log("Total Assets:", ethers.formatEther(finalTotalAssets));

  // Calculate profit
  const profit = finalCellBalance - initialCellBalance;
  console.log("\n💰 Profit from rewards:", ethers.formatEther(profit), "CELL");

  console.log("\n🎉 Test flow completed successfully on BSC Testnet!");
  console.log("\n📋 Summary:");
  console.log("- Deposited: 1000 CELL");
  console.log("- First rebase: +15% rewards");
  console.log("- Created withdrawal request");
  console.log("- Second rebase: +10% rewards (AFTER request)");
  console.log("- Withdrawn:", ethers.formatEther(withdrawalAmount), "CELL");
  console.log("- Net Profit:", ethers.formatEther(profit), "CELL");
  console.log("- Transaction fees paid in BNB");
  console.log("");
  console.log("🔬 Test Result:");
  if (withdrawalAmount === requestAfterSecondRebase.amount) {
    console.log("✅ Withdrawal amount is FIXED at request creation time");
    console.log("   Users do NOT get rewards from rebase after withdrawal request");
  } else {
    console.log("⚠️ Withdrawal amount CHANGES with rebase"); 
    console.log("   Users get rewards from rebase even after withdrawal request");
  }
}

// Helper function to create mock ERC20 (add this to the contracts if needed)
// This should be in contracts/mocks/MockERC20.sol

main().catch((error) => {
  console.error("❌ Error in test flow:", error);
  process.exitCode = 1;
}); 
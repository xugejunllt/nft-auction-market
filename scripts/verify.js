const { run } = require("hardhat");

/**
 * 合约验证脚本
 * 用于在区块浏览器上验证合约代码
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  const networkName = network.name;
  
  console.log(`🔍 开始验证合约 on ${networkName}...\n`);

  // 读取部署信息
  const fs = require("fs");
  const path = require("path");
  
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  const files = fs.readdirSync(deploymentsDir)
    .filter(file => file.startsWith(`deployment-${networkName}`) && file.endsWith('.json'))
    .sort()
    .reverse();

  if (files.length === 0) {
    console.error(`❌ 在 ${networkName} 网络上没有找到部署记录`);
    process.exit(1);
  }

  const deploymentFile = path.join(deploymentsDir, files[0]);
  const deploymentInfo = JSON.parse(fs.readFileSync(deploymentFile, 'utf8'));

  console.log("📋 要验证的合约:");
  console.log(`   1. MyNFT: ${deploymentInfo.contracts.MyNFT}`);
  console.log(`   2. AuctionFactory (实现): ${deploymentInfo.contracts.AuctionFactoryImplementation}`);

  if (deploymentInfo.contracts.MockUSDC) {
    console.log(`   3. MockUSDC: ${deploymentInfo.contracts.MockUSDC}`);
  }

  console.log("\n⏳ 开始验证...");

  try {
    // 验证 MyNFT
    console.log("\n1. 验证 MyNFT...");
    await run("verify:verify", {
      address: deploymentInfo.contracts.MyNFT,
      constructorArguments: [],
    });
    console.log("   ✅ MyNFT 验证成功");

    // 验证 AuctionFactory 实现
    console.log("\n2. 验证 AuctionFactory 实现...");
    await run("verify:verify", {
      address: deploymentInfo.contracts.AuctionFactoryImplementation,
      constructorArguments: [],
    });
    console.log("   ✅ AuctionFactory 实现验证成功");

    // 验证 MockUSDC（如果存在）
    if (deploymentInfo.contracts.MockUSDC) {
      console.log("\n3. 验证 MockUSDC...");
      await run("verify:verify", {
        address: deploymentInfo.contracts.MockUSDC,
        constructorArguments: ["Mock USDC", "mUSDC", 6],
      });
      console.log("   ✅ MockUSDC 验证成功");
    }

    console.log("\n🎉 所有合约验证完成！");
    
  } catch (error) {
    if (error.message.includes("Already Verified")) {
      console.log("   ℹ️  合约已经验证过");
    } else {
      console.error("   ❌ 验证失败:", error.message);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ 验证脚本执行失败:", error);
    process.exit(1);
  });
const { ethers } = require("hardhat");

/**
 * 单独部署 Mock ERC20 代币的脚本
 * 用于测试环境或需要额外代币的情况
 */
async function main() {
  console.log("🚀 开始部署 Mock ERC20 代币...\n");

  const [deployer] = await ethers.getSigners();
  
  console.log(`📡 网络: ${network.name}`);
  console.log(`👤 部署者: ${deployer.address}`);

  // 部署多种测试代币
  const tokens = [
    { name: "Test USDC", symbol: "USDC", decimals: 6 },
    { name: "Test DAI", symbol: "DAI", decimals: 18 },
    { name: "Test WBTC", symbol: "WBTC", decimals: 8 }
  ];

  const deploymentResults = [];

  for (const tokenConfig of tokens) {
    console.log(`\n🔨 部署 ${tokenConfig.symbol}...`);
    
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const token = await MockERC20.deploy(
      tokenConfig.name,
      tokenConfig.symbol,
      tokenConfig.decimals
    );
    await token.waitForDeployment();

    // 给部署者分配测试代币
    const mintAmount = ethers.parseUnits("1000000", tokenConfig.decimals)
    await token.mint(deployer.address, mintAmount);

    deploymentResults.push({
      name: tokenConfig.name,
      symbol: tokenConfig.symbol,
      address: await token.getAddress(),
      decimals: tokenConfig.decimals
    });

    console.log(`   ✅ ${tokenConfig.symbol} 部署成功: ${await token.getAddress()}`);
    console.log(`   💰 已分配: ${ethers.formatUnits(mintAmount, tokenConfig.decimals)} ${tokenConfig.symbol}`);
  }

  console.log("\n🎉 Mock ERC20 代币部署完成！");
  console.log("==========================================");
  deploymentResults.forEach(token => {
    console.log(`   ${token.symbol}: ${token.address}`);
  });
  console.log("==========================================\n");

  // 保存部署信息
  const fs = require("fs");
  const path = require("path");
  
  const deploymentInfo = {
    network: network.name,
    timestamp: new Date().toISOString(),
    deployer: deployer.address,
    tokens: deploymentResults
  };

  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir);
  }

  const deploymentFile = path.join(deploymentsDir, `mock-tokens-${network.name}-${Date.now()}.json`);
  fs.writeFileSync(deploymentFile, JSON.stringify(deploymentInfo, null, 2));
  console.log(`📄 部署信息已保存: ${deploymentFile}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ 部署失败:", error);
    process.exit(1);
  });
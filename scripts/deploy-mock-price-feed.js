// SPDX-License-Identifier: MIT
const { ethers } = require("hardhat");

async function main() {
  console.log("🚀 开始部署 MockPriceFeed 合约...");
  console.log(`📡 网络: ${network.name}`);
  
  // 获取部署者地址
  const [deployer] = await ethers.getSigners();
  console.log(`👤 部署者: ${deployer.address}`);
  console.log(`💰 部署者余额: ${ethers.formatEther(await deployer.provider.getBalance(deployer.address))} ETH`);

  // 部署ETH/USD价格预言机
  console.log("\n📦 部署 ETH/USD 价格预言机...");
  // ETH价格：3000 USD，8位小数（Chainlink标准）
  const ethPrice = ethers.parseUnits("3000", 8);
  const MockPriceFeed = await ethers.getContractFactory("MockPriceFeed");
  const ethPriceFeed = await MockPriceFeed.deploy(ethPrice, 8);
  await ethPriceFeed.waitForDeployment();
  const ethPriceFeedAddress = await ethPriceFeed.getAddress();
  
  console.log(`✅ ETH/USD 价格预言机部署成功: ${ethPriceFeedAddress}`);
  console.log(`   价格设置为: 3000 USD (8位小数)`);

  // 部署USDC/USD价格预言机
  console.log("\n📦 部署 USDC/USD 价格预言机...");
  // USDC价格：1 USD，6位小数（USDC标准）
  const usdcPrice = ethers.parseUnits("1", 6);
  const usdcPriceFeed = await MockPriceFeed.deploy(usdcPrice, 6);
  await usdcPriceFeed.waitForDeployment();
  const usdcPriceFeedAddress = await usdcPriceFeed.getAddress();
  
  console.log(`✅ USDC/USD 价格预言机部署成功: ${usdcPriceFeedAddress}`);
  console.log(`   价格设置为: 1 USD (6位小数)`);

  // 部署BTC/USD价格预言机（可选）
  console.log("\n📦 部署 BTC/USD 价格预言机...");
  // BTC价格：40000 USD，8位小数
  const btcPrice = ethers.parseUnits("40000", 8);
  const btcPriceFeed = await MockPriceFeed.deploy(btcPrice, 8);
  await btcPriceFeed.waitForDeployment();
  const btcPriceFeedAddress = await btcPriceFeed.getAddress();
  
  console.log(`✅ BTC/USD 价格预言机部署成功: ${btcPriceFeedAddress}`);
  console.log(`   价格设置为: 40000 USD (8位小数)`);

  // 验证部署
  console.log("\n🔍 验证部署结果...");
  const ethLatestPrice = await ethPriceFeed.latestRoundData();
  const usdcLatestPrice = await usdcPriceFeed.latestRoundData();
  const btcLatestPrice = await btcPriceFeed.latestRoundData();
  
  console.log(`   ETH/USD 最新价格: ${ethers.formatUnits(ethLatestPrice.answer.toString(), 8)} USD`);
  console.log(`   USDC/USD 最新价格: ${ethers.formatUnits(usdcLatestPrice.answer.toString(), 6)} USD`);
  console.log(`   BTC/USD 最新价格: ${ethers.formatUnits(btcLatestPrice.answer.toString(), 8)} USD`);

  // 保存部署信息到JSON文件
  const fs = require('fs');
  const deploymentInfo = {
    network: network.name,
    timestamp: new Date().toISOString(),
    deployer: deployer.address,
    priceFeeds: {
      eth: {
        address: ethPriceFeedAddress,
        price: "3000",
        decimals: 8
      },
      usdc: {
        address: usdcPriceFeedAddress,
        price: "1",
        decimals: 6
      },
      btc: {
        address: btcPriceFeedAddress,
        price: "40000",
        decimals: 8
      }
    }
  };

  // 确保deployments目录存在
  const deploymentsDir = './deployments';
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const fileName = `price-feeds-${network.name}-${Date.now()}.json`;
  fs.writeFileSync(
    `${deploymentsDir}/${fileName}`,
    JSON.stringify(deploymentInfo, null, 2)
  );

  console.log(`\n💾 部署信息已保存到: ${deploymentsDir}/${fileName}`);
  console.log("\n🎉 MockPriceFeed 合约部署完成！");
}

// 执行主函数
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ 部署失败:", error);
    process.exit(1);
  });
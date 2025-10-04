const { ethers, upgrades, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

/**
 * 合约升级脚本
 * 将 AuctionFactory 从 V1 升级到 V2
 */
async function main() {
  console.log("🔄 开始升级 NFT 拍卖市场合约...\n");

  const [deployer] = await ethers.getSigners();
  const networkName = network.name;
  
  console.log(`📡 网络: ${networkName}`);
  console.log(`👤 升级执行者: ${deployer.address}`);
  console.log(`💰 余额: ${ethers.formatEther(await deployer.provider.getBalance(deployer.address))} ETH\n`);

  // 1. 读取之前的部署信息
  console.log("1. 查找之前的部署信息...");
  
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  let deploymentFile;
  
  // 查找最新的部署文件
  try {
    const files = fs.readdirSync(deploymentsDir)
      .filter(file => file.startsWith(`deployment-${networkName}`) && file.endsWith('.json'))
      .sort()
      .reverse();
    
    if (files.length === 0) {
      throw new Error(`在 ${networkName} 网络上没有找到部署记录`);
    }
    
    deploymentFile = path.join(deploymentsDir, files[0]);
    const deploymentInfo = JSON.parse(fs.readFileSync(deploymentFile, 'utf8'));
    
    console.log(`   ✅ 找到部署记录: ${files[0]}`);
    console.log(`   📅 部署时间: ${deploymentInfo.timestamp}`);
    console.log(`   📝 代理地址: ${deploymentInfo.contracts.AuctionFactory}`);
    console.log(`   🏗️  旧实现地址: ${deploymentInfo.contracts.AuctionFactoryImplementation}`);
  } catch (error) {
    console.error(`   ❌ 错误: ${error.message}`);
    console.log(`   💡 提示: 请先运行部署脚本: npx hardhat run scripts/deploy.js --network ${networkName}`);
    process.exit(1);
  }

  const proxyAddress = JSON.parse(fs.readFileSync(deploymentFile, 'utf8')).contracts.AuctionFactory;

  // 2. 验证当前实现版本
  console.log("\n2. 验证当前合约版本...");
  
  const AuctionFactoryV1 = await ethers.getContractFactory("AuctionFactory");
  const currentInstance = AuctionFactoryV1.attach(proxyAddress);
  
  try {
    const currentVersion = await currentInstance.version();
    console.log(`   ✅ 当前版本: ${currentVersion}`);
  } catch (error) {
    console.log(`   ℹ️  无法获取当前版本（可能是旧版本）`);
  }

  // 3. 执行升级
  console.log("\n3. 执行合约升级...");
  
  const AuctionFactoryV2 = await ethers.getContractFactory("AuctionFactoryV2");
  
  console.log("   ⏳ 正在升级合约...");
  const upgraded = await upgrades.upgradeProxy(proxyAddress, AuctionFactoryV2, {
    kind: 'uups',
    timeout: 0,
    pollingInterval: 1000
  });
  
  // 等待升级完成
  // await upgraded.deployed();
  await upgraded.waitForDeployment();
  console.log(`   ✅ 合约升级成功！`);

  // 4. 验证升级结果
  console.log("\n4. 验证升级结果...");
  
  const newImplementationAddress = await upgrades.erc1967.getImplementationAddress(await upgraded.getAddress());
  console.log(`   ✅ 新实现地址: ${newImplementationAddress}`);
  
  const newVersion = await upgraded.version();
  console.log(`   ✅ 新版本: ${newVersion}`);
  
  // 验证原有数据保持
  const factoryConfig = await upgraded.getFactoryStats();
  console.log(`   ✅ 配置数据保持验证:`);
  console.log(`      - 手续费接收地址: ${factoryConfig.platformFeeRecipient}`);
  console.log(`      - 总拍卖数量: ${factoryConfig.totalAuctionsCreated}`);

  // 5. 测试新功能
  console.log("\n5. 测试 V2 新功能...");
  
  // 测试用户等级功能
  await upgraded.updateUserLevel(deployer.address);
  const [level, discount] = await upgraded.getUserLevelAndDiscount(deployer.address);
  console.log(`   ✅ 用户等级功能测试成功:`);
  console.log(`      - 等级: ${level}`);
  console.log(`      - 折扣率: ${discount}%`);
  
  // 测试平台统计功能
  const platformStats = await upgraded.getPlatformStats();
  console.log(`   ✅ 平台统计功能测试成功:`);
  console.log(`      - 总成功拍卖: ${platformStats.totalSuccessful}`);
  console.log(`      - 成功率: ${platformStats.successRate}%`);

  // 6. 保存升级记录
  console.log("\n6. 保存升级记录...");
  
  const upgradeInfo = {
    network: networkName,
    timestamp: new Date().toISOString(),
    upgradedBy: deployer.address,
    fromImplementation: JSON.parse(fs.readFileSync(deploymentFile, 'utf8')).contracts.AuctionFactoryImplementation,
    toImplementation: newImplementationAddress,
    proxyAddress: proxyAddress,
    fromVersion: "v1.1.0", // 假设从 V1 升级
    toVersion: newVersion
  };

  const upgradesDir = path.join(__dirname, "..", "deployments", "upgrades");
  if (!fs.existsSync(upgradesDir)) {
    fs.mkdirSync(upgradesDir, { recursive: true });
  }

  const upgradeFile = path.join(upgradesDir, `upgrade-${networkName}-${Date.now()}.json`);
  fs.writeFileSync(upgradeFile, JSON.stringify(upgradeInfo, null, 2));
  console.log(`   ✅ 升级记录已保存: ${upgradeFile}`);

  // 7. 更新部署记录
  console.log("\n7. 更新部署记录...");
  
  const updatedDeploymentInfo = JSON.parse(fs.readFileSync(deploymentFile, 'utf8'));
  updatedDeploymentInfo.contracts.AuctionFactoryImplementation = newImplementationAddress; // 更新实现地址
  updatedDeploymentInfo.lastUpgraded = new Date().toISOString();
  updatedDeploymentInfo.upgradeHistory = updatedDeploymentInfo.upgradeHistory || [];
  updatedDeploymentInfo.upgradeHistory.push(upgradeInfo);
  
  fs.writeFileSync(deploymentFile, JSON.stringify(updatedDeploymentInfo, null, 2));
  console.log(`   ✅ 部署记录已更新`);

  console.log("\n🎉 合约升级完成！");
  console.log("==========================================");
  console.log("📊 升级摘要:");
  console.log(`   代理地址: ${proxyAddress}`);
  console.log(`   旧实现: ${upgradeInfo.fromImplementation}`);
  console.log(`   新实现: ${newImplementationAddress}`);
  console.log(`   旧版本: ${upgradeInfo.fromVersion}`);
  console.log(`   新版本: ${upgradeInfo.toVersion}`);
  console.log("==========================================\n");

  // 提示下一步操作
  console.log("📝 下一步操作:");
  console.log("   1. 运行测试验证功能: npx hardhat test");
  console.log("   2. 验证新实现合约: npx hardhat verify --network " + networkName + " " + newImplementationAddress);
  console.log("   3. 在前端更新合约 ABI");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ 升级失败:", error);
    process.exit(1);
  });
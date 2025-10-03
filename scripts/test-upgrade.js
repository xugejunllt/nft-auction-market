const { ethers, upgrades } = require("hardhat");

async function main() {
  console.log("开始测试可升级部署功能...");
  
  const [deployer] = await ethers.getSigners();
  console.log("部署账户:", deployer.address);
  
  // 部署MockPriceFeed
  console.log("部署MockPriceFeed...");
  const MockPriceFeed = await ethers.getContractFactory("MockPriceFeed");
  const priceFeed = await MockPriceFeed.deploy(300000000000, 8);
  
  // 等待交易确认
  await priceFeed.deploymentTransaction().wait();
  console.log("MockPriceFeed 地址:", await priceFeed.getAddress());
  
  // 测试可升级部署
  console.log("测试 AuctionFactory 可升级部署...");
  try {
    const AuctionFactory = await ethers.getContractFactory("AuctionFactory");
    const factoryProxy = await upgrades.deployProxy(AuctionFactory, [deployer.address]);
    
    // 等待部署完成
    await factoryProxy.deploymentTransaction().wait();
    console.log("✅ AuctionFactory 代理部署成功:", await factoryProxy.getAddress());
    
    // 验证初始化是否成功
    try {
      // 直接访问factoryConfig状态变量
      const factoryConfig = await factoryProxy.factoryConfig();
      console.log("初始化结果验证: ✅ 成功，平台手续费接收地址:", factoryConfig.platformFeeRecipient);
      console.log("是否与部署地址匹配:", factoryConfig.platformFeeRecipient === deployer.address ? "✅ 匹配" : "❌ 不匹配");
    } catch (error) {
      console.error("初始化结果验证: ❌ 失败", error);
      console.log("尝试使用fallback方法验证...");
      // 如果直接访问失败，尝试使用其他方式验证部署成功
      try {
        // 尝试获取合约所有者或其他公开状态来验证部署成功
        const owner = await factoryProxy.owner();
        console.log("初始化结果验证: ✅ 成功，合约所有者:", owner);
      } catch (fallbackError) {
        console.error("Fallback验证也失败:", fallbackError);
      }
    }
    
  } catch (error) {
    console.error("❌ 代理部署失败:", error.message);
  }
  
  console.log("测试完成");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
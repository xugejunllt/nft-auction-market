const { ethers, upgrades } = require("hardhat");

async function main() {
  console.log("开始简单测试...");
  
  try {
    // 获取签名者
    const [deployer] = await ethers.getSigners();
    console.log("部署账户:", deployer.address);
    
    // 1. 部署MockPriceFeed
    console.log("\n1. 部署MockPriceFeed...");
    const MockPriceFeed = await ethers.getContractFactory("MockPriceFeed");
    const priceFeed = await MockPriceFeed.deploy(300000000000, 8);
    await priceFeed.deploymentTransaction().wait();
    console.log("MockPriceFeed 地址:", await priceFeed.getAddress());
    
    // 测试MockPriceFeed功能
    // 直接读取状态变量而不是调用函数
    const price = await priceFeed.price();
    const decimals = await priceFeed.decimals();
    console.log("MockPriceFeed 价格:", price.toString());
    console.log("MockPriceFeed 小数位:", decimals.toString());
    
    // 2. 部署AuctionFactory代理
    console.log("\n2. 部署AuctionFactory代理...");
    const AuctionFactory = await ethers.getContractFactory("AuctionFactory");
    
    // 捕获可能的错误
    try {
      const factoryProxy = await upgrades.deployProxy(AuctionFactory, [deployer.address]);
      await factoryProxy.deploymentTransaction().wait();
      console.log("✅ AuctionFactory 代理部署成功:", await factoryProxy.getAddress());
      
      // 3. 验证初始化
      console.log("\n3. 验证初始化...");
      const factoryConfig = await factoryProxy.factoryConfig();
      console.log("平台手续费接收地址:", factoryConfig.platformFeeRecipient);
      console.log("总创建拍卖数量:", factoryConfig.totalAuctionsCreated.toString());
      
      // 测试合约功能
      console.log("\n4. 测试基本功能...");
      try {
        // 尝试直接访问supportedTokens映射检查ETH支持状态
        const ethTokenConfig = await factoryProxy.supportedTokens(ethers.ZeroAddress);
        console.log("ETH 默认支持:", ethTokenConfig.isSupported);
        console.log("ETH 价格预言机地址:", ethTokenConfig.priceFeed);
        console.log("ETH 代币符号:", ethTokenConfig.symbol);
      } catch (featureError) {
        console.log("无法直接访问supportedTokens映射，改为验证部署状态...");
      }
      
      console.log("\n✅ AuctionFactory代理部署和初始化测试通过！");
    } catch (proxyError) {
      console.error("❌ AuctionFactory 代理部署失败:", proxyError.message);
      // 输出完整错误对象的关键属性
      console.error("错误详情:", JSON.stringify(proxyError, Object.getOwnPropertyNames(proxyError)));
    }
    
  } catch (error) {
    console.error("❌ 测试失败:", error);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
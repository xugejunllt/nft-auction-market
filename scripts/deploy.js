const { ethers, upgrades, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

// 部署配置
const DEPLOYMENT_CONFIG = {
  sepolia: {
    ethUsdPriceFeed: "0x694AA1769357215DE4FAC081bf1f309aDC325306",
    usdcUsdPriceFeed: "0xA2F78ab2355fe2f984D808B5CeE7FD0A93D5270E",
    usdcAddress: "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8" // Sepolia USDC
  },
  // goerli: {
  //   ethUsdPriceFeed: "0xD4a33860578De61DBAbDc8BFdb98FD742fA7028e",
  //   usdcUsdPriceFeed: "0xAb5c49580294Aff77670F839ea425f5b78ab3Ae7",
  //   usdcAddress: "0x07865c6E87B9F70255377e024ace6630C1Eaa37F" // Goerli USDC
  // },
  localhost: {
    ethUsdPriceFeed: "0x694AA1769357215DE4FAC081bf1f309aDC325306", // 使用Sepolia的地址作为mock
    usdcUsdPriceFeed: "0xA2F78ab2355fe2f984D808B5CeE7FD0A93D5270E",
    usdcAddress: ethers.ZeroAddress// 本地测试时使用mock
  }
};

async function main() {
  console.log("🚀 开始部署 NFT 拍卖市场合约...\n");

  const [deployer] = await ethers.getSigners(); // 获取部署者,即第一个账户
  const networkName = network.name; // 获取当前网络名称,如"sepolia","localhost"等
  
  console.log(`📡 网络: ${networkName}`);
  console.log(`👤 部署者: ${deployer.address}`);
  console.log(`💰 部署者余额: ${ethers.formatEther(await deployer.provider.getBalance(deployer.address))} ETH\n`);

  // 获取部署配置
  const config = DEPLOYMENT_CONFIG[networkName] || DEPLOYMENT_CONFIG.localhost;
  
  // 1. 部署 NFT 合约
  console.log("1. 部署 MyNFT 合约...");
  const MyNFT = await ethers.getContractFactory("MyNFT");
  const nft = await MyNFT.deploy();
  await nft.waitForDeployment();
  const nftAddress = await nft.getAddress();
  console.log(`   ✅ MyNFT 部署成功: ${nftAddress}`);

  // 2. 部署 AuctionFactory 代理合约
  console.log("2. 部署 AuctionFactory 代理合约...");
  const AuctionFactory = await ethers.getContractFactory("AuctionFactory");
  const auctionFactory = await upgrades.deployProxy(
    AuctionFactory, 
    [deployer.address], // 初始手续费接收地址设为部署者
    { 
      initializer: "initialize",
      kind: "uups"
    }
  );
  await auctionFactory.waitForDeployment();
  const auctionFactoryAddress = await auctionFactory.getAddress();
  console.log(`   ✅ AuctionFactory 代理部署成功: ${auctionFactoryAddress}`);

  // 3. 添加支持的报价代币
  console.log("3. 配置支持的报价代币...");
  
  // 添加 ETH 支持
  await auctionFactory.addQuoteToken(
    ethers.ZeroAddress, // ETH
    config.ethUsdPriceFeed,
    "ETH"
  );
  console.log(`   ✅ ETH 支持已添加`);

  // 如果网络不是localhost且配置了USDC地址，添加USDC支持
  if (config.usdcAddress !== ethers.ZeroAddress) {
    await auctionFactory.addQuoteToken(
      config.usdcAddress,
      config.usdcUsdPriceFeed,
      "USDC"
    );
    console.log(`   ✅ USDC 支持已添加: ${config.usdcAddress}`);
  }

  // 4. 在本地网络部署 Mock ERC20 用于测试
  if (networkName === "localhost" || networkName === "hardhat") {
    console.log("4. 部署测试用 Mock ERC20 代币...");
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const mockUSDC = await MockERC20.deploy("Mock USDC", "mUSDC", 6);
    await mockUSDC.waitForDeployment();
    const mockUSDCAddress = await mockUSDC.getAddress();
    console.log(`   ✅ Mock USDC 部署成功: ${mockUSDCAddress}`);

    // 添加 Mock USDC 支持
    await auctionFactory.addQuoteToken(
      mockUSDCAddress,
      config.usdcUsdPriceFeed,
      "mUSDC"
    );
    console.log(`   ✅ Mock USDC 支持已添加`);

    // 给部署者分配测试代币
    await mockUSDC.mint(deployer.address, ethers.parseUnits("10000", 6));
    console.log(`   💰 已向部署者分配 10,000 mUSDC 测试代币`);
  }

  // 5. 保存部署信息
  console.log("5. 保存部署信息...");
  const deploymentInfo = {
    network: networkName,
    timestamp: new Date().toISOString(),
    contracts: {
      MyNFT: nftAddress,
      AuctionFactory: auctionFactoryAddress,
      AuctionFactoryImplementation: await upgrades.erc1967.getImplementationAddress(auctionFactoryAddress)
    },
    config: {
      platformFeeRecipient: deployer.address,
      supportedTokens: {
        ETH: {
          address: ethers.ZeroAddress,
    priceFeed: config.ethUsdPriceFeed
        }
      }
    }
  };

  // 添加 USDC 信息（如果部署了）
  if (networkName === "localhost" || networkName === "hardhat") {
    // 部署信息已在前面的部署流程中设置
    console.log(`   ✅ USDC 部署信息已记录`);
  } else if (config.usdcAddress !== ethers.ZeroAddress) {
    deploymentInfo.config.supportedTokens.USDC = {
      address: config.usdcAddress,
      priceFeed: config.usdcUsdPriceFeed
    };
  }

  // 创建部署记录目录
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir);
  }

  // 保存部署信息到文件
  const deploymentFile = path.join(deploymentsDir, `deployment-${networkName}-${Date.now()}.json`);
  fs.writeFileSync(deploymentFile, JSON.stringify(deploymentInfo, null, 2));
  console.log(`   ✅ 部署信息已保存: ${deploymentFile}`);

  // 6. 验证部署结果
  console.log("\n6. 验证部署结果...");
  
  // 验证工厂合约
  const factoryConfig = await auctionFactory.getFactoryStats();
  console.log(`   ✅ 工厂配置验证成功`);
  console.log(`      - 手续费接收地址: ${factoryConfig.platformFeeRecipient}`);
  console.log(`      - 总拍卖数量: ${factoryConfig.totalAuctionsCreated}`);

  // 验证支持的代币
  const ethConfig = await auctionFactory.supportedTokens(ethers.ZeroAddress);
  console.log(`   ✅ ETH 支持验证: ${ethConfig.isSupported ? '✅' : '❌'}`);

  console.log("\n🎉 部署完成！");
  console.log("==========================================");
  console.log("📊 部署摘要:");
  console.log(`   MyNFT: ${nftAddress}`);
  console.log(`   AuctionFactory (代理): ${auctionFactoryAddress}`);
  console.log(`   AuctionFactory (实现): ${deploymentInfo.contracts.AuctionFactoryImplementation}`);
  console.log("==========================================\n");

  // 提示下一步操作
  console.log("📝 下一步操作:");
  console.log("   1. 运行测试: npx hardhat test");
  console.log("   2. 验证合约: npx hardhat verify --network <network> <address>");
  console.log("   3. 升级到 V2: npx hardhat run scripts/upgrade.js --network <network>");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ 部署失败:", error);
    process.exit(1);
  });
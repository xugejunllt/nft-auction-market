async function main() {
  const [deployer] = await ethers.getSigners();
  
  console.log("Deploying cross-chain auction contracts...");
  
  // 部署跨链拍卖合约
  const CrossChainAuction = await ethers.getContractFactory("CrossChainAuction");
  
  // 使用对应网络的Router地址
  const routerAddresses = {
    sepolia: "0x0BF3dE8c5D3e8A2B34D2BEeB17ABfCeBaf363A59",
    arbitrum: "0x...", // 添加其他网络的Router地址
  };
  
  const crossChainAuction = await CrossChainAuction.deploy(routerAddresses.sepolia);
  await crossChainAuction.deployed();
  
  console.log("CrossChainAuction deployed to:", crossChainAuction.address);
  
  // 配置支持的链
  await crossChainAuction.addSupportedChain(16015286601757825753); // Sepolia
  await crossChainAuction.addSupportedChain(3478487238524512106); // Arbitrum Sepolia
  
  console.log("Cross-chain auction setup completed!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
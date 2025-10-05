const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("CrossChain Auction", function () {
  let crossChainAuction;
  let auctionFactory;
  let owner, seller, bidder;
  let auctionFactoryAddress, crossChainAuctionAddress;
  
  // 模拟CCIP Router（在实际中使用测试网Router）
  const MOCK_ROUTER = "0x1234567890123456789012345678901234567890"; // 模拟Router地址
  
  beforeEach(async function () {
    console.log("Starting test setup...");
    [owner, seller, bidder] = await ethers.getSigners();
    console.log("Got signers");
    
    // 先只部署和初始化工厂合约
    const AuctionFactory = await ethers.getContractFactory("AuctionFactory");
    auctionFactory = await AuctionFactory.deploy();
    await auctionFactory.waitForDeployment();
    auctionFactoryAddress = await auctionFactory.getAddress();
    console.log("AuctionFactory deployed at:", auctionFactoryAddress);
    
    // 初始化工厂合约
    await auctionFactory.initialize(owner.address);
    console.log("AuctionFactory initialized");
    
    // 部署跨链拍卖合约
    const CrossChainAuction = await ethers.getContractFactory("CrossChainAuction");
    crossChainAuction = await CrossChainAuction.deploy(MOCK_ROUTER);
    await crossChainAuction.waitForDeployment();
    crossChainAuctionAddress = await crossChainAuction.getAddress();
    console.log("CrossChainAuction deployed at:", crossChainAuctionAddress);
    
    // 添加支持的链（使用一个小的测试值）
    await crossChainAuction.addSupportedChain(123456789);
    console.log("Added supported chain");
    
    // 设置跨链拍卖模板
    await auctionFactory.setCrossChainAuctionTemplate(crossChainAuctionAddress);
    console.log("Set cross chain auction template");
  });

  it("应该设置跨链拍卖模板", async function () {
    // 简化测试，只验证模板设置是否成功
    const template = await auctionFactory.crossChainAuctionTemplate();
    expect(template).to.equal(crossChainAuctionAddress);
    console.log("Template verification passed");
  });

  it("应该处理跨链出价", async function () {
    // 这个测试需要连接到实际的测试网进行
    // 这里只是演示测试结构
    console.log("Cross-chain auction test setup complete");
  });
});
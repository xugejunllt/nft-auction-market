const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Simple Contract Deployment Test", function () {
  it("应该成功部署CrossChainAuction合约", async function () {
    console.log("Starting simple test...");
    
    // 使用零地址作为模拟Router地址
    // 使用一个有效的地址作为mock router
    const MOCK_ROUTER = "0x1234567890123456789012345678901234567890";
    
    // 部署跨链拍卖合约
    console.log("Deploying CrossChainAuction...");
    const CrossChainAuction = await ethers.getContractFactory("CrossChainAuction");
    const crossChainAuction = await CrossChainAuction.deploy(MOCK_ROUTER);
    
    // 在ethers.js v6中，等待部署完成并获取地址
    await crossChainAuction.waitForDeployment();
    const address = await crossChainAuction.getAddress();
    
    console.log("CrossChainAuction deployed at:", address);
    expect(address).to.be.properAddress;
    
    // 测试一个简单的方法调用
    await crossChainAuction.addSupportedChain(123456789);
    console.log("Added supported chain successfully");
    
    // 验证链选择器是否被正确添加
    const isSupported = await crossChainAuction.supportedChains(123456789);
    expect(isSupported).to.be.true;
    console.log("Chain support verified");
  });
});
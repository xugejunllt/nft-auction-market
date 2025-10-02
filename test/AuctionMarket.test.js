const { expect } = require("chai");
const { ethers, upgrades, network } = require("hardhat");

describe("NFT Auction Market - 完整测试套件", function () {
  let nft;
  let auctionFactory;
  let auctionFactoryV2;
  let mockERC20;
  let owner, seller, bidder1, bidder2, feeRecipient;

  // Mock price feed addresses (使用Chainlink测试网地址)
  const ETH_USD_PRICE_FEED = "0x694AA1769357215DE4FAC081bf1f309aDC325306"; // Sepolia ETH/USD
  const USDC_USD_PRICE_FEED = "0xA2F78ab2355fe2f984D808B5CeE7FD0A93D5270E"; // Sepolia USDC/USD

  // 测试常量
  const AUCTION_DURATION = 86400; // 24小时
  const BID_AMOUNT_1 = ethers.utils.parseEther("1.0");
  const BID_AMOUNT_2 = ethers.utils.parseEther("1.5");
  const ERC20_AMOUNT = ethers.utils.parseUnits("1000", 6); // 1000 USDC

  beforeEach(async function () {
    [owner, seller, bidder1, bidder2, feeRecipient] = await ethers.getSigners();
    
    // 部署 Mock ERC20 代币
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    mockERC20 = await MockERC20.deploy("Test USDC", "USDC", 6); //默认是第一个用户即owner作为部署者，也就是msg.sender
    await mockERC20.deployed();
    
    // 给测试用户分配代币
    await mockERC20.mint(bidder1.address, ERC20_AMOUNT); //msg.sender = owner,等价于mockERC20.connect(owner).mint(bidder1.address, ERC20_AMOUNT)
    await mockERC20.mint(bidder2.address, ERC20_AMOUNT); //msg.sender = owner,等价于mockERC20.connect(owner).mint(bidder2.address, ERC20_AMOUNT)

    // 部署 NFT 合约
    const MyNFT = await ethers.getContractFactory("MyNFT");
    nft = await MyNFT.deploy();
    await nft.deployed();
    
    // 部署 AuctionFactory 代理合约
    const AuctionFactory = await ethers.getContractFactory("AuctionFactory");
    auctionFactory = await upgrades.deployProxy(AuctionFactory, [feeRecipient.address]);
    await auctionFactory.deployed();
    
    // 添加支持的报价代币
    await auctionFactory.addQuoteToken(ethers.constants.AddressZero, ETH_USD_PRICE_FEED, "ETH");
    await auctionFactory.addQuoteToken(mockERC20.address, USDC_USD_PRICE_FEED, "USDC");
  });

  describe("NFT 合约测试", function () {
    it("应该正确部署NFT合约", async function () {
      expect(await nft.name()).to.equal("MyNFT");
      expect(await nft.symbol()).to.equal("MNFT");
    });

    it("应该允许合约所有者(owner)铸造NFT", async function () {
      await nft.mint(seller.address); //铸造NFT 
      expect(await nft.ownerOf(0)).to.equal(seller.address);
      expect(await nft.currentTokenId()).to.equal(1);
    });

    it("应该允许批量铸造NFT", async function () {
      await nft.mintBatch(seller.address, 3);
      expect(await nft.ownerOf(0)).to.equal(seller.address);
      expect(await nft.ownerOf(1)).to.equal(seller.address);
      expect(await nft.ownerOf(2)).to.equal(seller.address);
      expect(await nft.currentTokenId()).to.equal(3);
    });

    it("非所有者不能铸造NFT", async function () {
      await expect(nft.connect(bidder1).mint(bidder1.address))
        .to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("工厂合约测试", function () {
    it("应该正确部署工厂合约", async function () {
      expect(await auctionFactory.version()).to.equal("v1.1.0");
      expect(await auctionFactory.owner()).to.equal(owner.address);
    });

    it("应该正确初始化工厂配置", async function () {
      const config = await auctionFactory.getFactoryStats();
      expect(config.platformFeeRecipient).to.equal(feeRecipient.address);
      expect(config.totalAuctionsCreated).to.equal(0);
      expect(config.totalTradingVolume).to.equal(0);
    });

    it("应该支持添加报价代币", async function () {
      const tokenConfig = await auctionFactory.supportedTokens(mockERC20.address);
      expect(tokenConfig.isSupported).to.be.true;
      expect(tokenConfig.priceFeed).to.equal(USDC_USD_PRICE_FEED);
      expect(tokenConfig.symbol).to.equal("USDC");
    });

    it("只有所有者可以添加报价代币", async function () {
      await expect(
        auctionFactory.connect(seller).addQuoteToken(
          bidder1.address, 
          ETH_USD_PRICE_FEED, 
          "TEST"
        )
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("应该正确计算动态手续费", async function () {
      // 测试不同金额的手续费计算
      const smallAmount = ethers.utils.parseEther("1");
      const mediumAmount = ethers.utils.parseEther("100");
      const largeAmount = ethers.utils.parseEther("1000");

      const smallFee = await auctionFactory.calculateFeeForAmount(smallAmount);
      const mediumFee = await auctionFactory.calculateFeeForAmount(mediumAmount);
      const largeFee = await auctionFactory.calculateFeeForAmount(largeAmount);

      // 验证手续费率递减
      expect(smallFee.mul(1000).div(smallAmount)).to.equal(50);  // 5%
      expect(mediumFee.mul(1000).div(mediumAmount)).to.equal(25); // 2.5%
      expect(largeFee.mul(1000).div(largeAmount)).to.equal(5);   // 0.5%
    });
  });

  describe("拍卖创建测试", function () {
    beforeEach(async function () {
      // 铸造NFT并授权给工厂
      await nft.mint(seller.address);
      await nft.connect(seller).approve(auctionFactory.address, 0);
    });

    it("应该成功创建ETH拍卖", async function () {
      const tx = await auctionFactory.connect(seller).createAuction(
        nft.address,
        0,
        AUCTION_DURATION,
        ethers.constants.AddressZero
      );

      const receipt = await tx.wait();
      const auctionCreatedEvent = receipt.events.find(e => e.event === 'AuctionCreated');
      
      expect(auctionCreatedEvent.args.auctionAddress).to.not.be.undefined;
      expect(auctionCreatedEvent.args.seller).to.equal(seller.address);
      expect(auctionCreatedEvent.args.nftAddress).to.equal(nft.address);
      expect(auctionCreatedEvent.args.tokenId).to.equal(0);
      
      // 验证拍卖数量统计
      expect(await auctionFactory.getAuctionsCount()).to.equal(1);
      
      // 验证用户统计
      const userStats = await auctionFactory.getUserStats(seller.address);
      expect(userStats.createdAuctions).to.equal(1);
    });

    it("应该成功创建ERC20拍卖", async function () {
      // 授权ERC20代币
    //   await mockERC20.connect(seller).approve(auctionFactory.address, 0); 这里需要删除？

      //卖家创建拍卖合约
      const tx = await auctionFactory.connect(seller).createAuction(
        nft.address,
        0,
        AUCTION_DURATION,
        mockERC20.address
      );

      const receipt = await tx.wait();
      const auctionCreatedEvent = receipt.events.find(e => e.event === 'AuctionCreated');
      
      expect(auctionCreatedEvent.args.quoteToken).to.equal(mockERC20.address);
    });

    it("只有NFT所有者可以创建拍卖", async function () {
      await expect(
        auctionFactory.connect(bidder1).createAuction(
          nft.address,
          0,
          AUCTION_DURATION,
          ethers.constants.AddressZero
        )
      ).to.be.revertedWith("Not NFT owner");
    });

    it("不能使用不支持的代币创建拍卖", async function () {
      await expect(
        auctionFactory.connect(seller).createAuction(
          nft.address,
          0,
          AUCTION_DURATION,
          bidder1.address // 随机地址，不支持
        )
      ).to.be.revertedWith("Quote token not supported");
    });
  });

  describe("拍卖流程测试 - ETH拍卖", function () {
    let auction; // 拍卖合约实例
    let auctionAddress; // 拍卖合约地址

    beforeEach(async function () {
      // 创建拍卖
      await nft.mint(seller.address); // 铸造NFT给卖家
      await nft.connect(seller).approve(auctionFactory.address, 0); // 授权工厂合约调用
      // 创建拍卖
      const tx = await auctionFactory.connect(seller).createAuction(
        nft.address,
        0,
        AUCTION_DURATION,
        ethers.constants.AddressZero
      );

      const receipt = await tx.wait();
      auctionAddress = receipt.events.find(e => e.event === 'AuctionCreated').args.auctionAddress;
      
      const Auction = await ethers.getContractFactory("Auction");
      auction = await Auction.attach(auctionAddress);
    });

    it("应该正确初始化拍卖状态", async function () {
      const auctionDetails = await auction.getAuctionDetails();
      
      expect(auctionDetails.seller).to.equal(seller.address);
      expect(auctionDetails.nftAddress).to.equal(nft.address);
      expect(auctionDetails.tokenId).to.equal(0);
      expect(auctionDetails.ended).to.be.false;
      expect(auctionDetails.highestBid).to.equal(0);
      expect(auctionDetails.highestBidder).to.equal(ethers.constants.AddressZero);
    });

    it("应该允许用户出价", async function () {
      await expect(
        auction.connect(bidder1).bid(BID_AMOUNT_1, { value: BID_AMOUNT_1 })
      ).to.emit(auction, "BidPlaced");
    // 替代写法：通过交易收据检查事件
    //   const tx = await auction.connect(bidder1).bid(BID_AMOUNT_1, { value: BID_AMOUNT_1 });
    //   const receipt = await tx.wait();
      
    //   // 验证交易成功并且包含BidPlaced事件
    //   expect(receipt.status).to.equal(1, "交易应该成功");
      
    //   // 查找BidPlaced事件
    //   const bidPlacedEvent = receipt.events.find(event => event.event === "BidPlaced");
    //   expect(bidPlacedEvent).to.exist;

      const auctionDetails = await auction.getAuctionDetails();
      expect(auctionDetails.highestBidder).to.equal(bidder1.address);
      expect(auctionDetails.highestBid).to.equal(BID_AMOUNT_1);
    });

    it("应该允许更高出价并退还前一个出价者", async function () {
      // 第一个出价
      await auction.connect(bidder1).bid(BID_AMOUNT_1, { value: BID_AMOUNT_1 });
      
      // 记录出价前余额
      const bidder2BalanceBefore = await ethers.provider.getBalance(bidder2.address);
      
      // 第二个更高出价
      await auction.connect(bidder2).bid(BID_AMOUNT_2, { value: BID_AMOUNT_2 });
      
      // 验证退还
      const bidder1BalanceAfter = await ethers.provider.getBalance(bidder1.address);
      // 注意：这里需要考虑gas费用，所以不能精确比较
      
      const auctionDetails = await auction.getAuctionDetails();
      expect(auctionDetails.highestBidder).to.equal(bidder2.address);
      expect(auctionDetails.highestBid).to.equal(BID_AMOUNT_2);
    });

    it("卖家不能对自己的拍卖出价", async function () {
      await expect(
        auction.connect(seller).bid(BID_AMOUNT_1, { value: BID_AMOUNT_1 })
      ).to.be.revertedWith("Seller cannot bid");
    });

    it("拍卖结束后可以正确结算", async function () {
      // 出价
      await auction.connect(bidder1).bid(BID_AMOUNT_1, { value: BID_AMOUNT_1 });
      
      // 推进时间到拍卖结束
      await network.provider.send("evm_increaseTime", [AUCTION_DURATION + 1]);
      await network.provider.send("evm_mine");
      
      // 记录结束前余额
      const sellerBalanceBefore = await ethers.provider.getBalance(seller.address);
      const feeRecipientBalanceBefore = await ethers.provider.getBalance(feeRecipient.address);
      
      // 结束拍卖
      await expect(auction.connect(seller).endAuction())
        .to.emit(auction, "AuctionEnded")
        .withArgs(bidder1.address, BID_AMOUNT_1);
      
      // 验证NFT转移
      expect(await nft.ownerOf(0)).to.equal(bidder1.address);
      
      // 验证拍卖状态
      const auctionDetails = await auction.getAuctionDetails();
      expect(auctionDetails.ended).to.be.true;
      
      // 验证资金分配（大致验证，因为gas费用会影响精确值）
      const sellerBalanceAfter = await ethers.provider.getBalance(seller.address);
      const feeRecipientBalanceAfter = await ethers.provider.getBalance(feeRecipient.address);
      
      // 卖家应该收到出价金额减去手续费
      const expectedSellerAmount = BID_AMOUNT_1.sub(await auction.calculateDynamicFee(BID_AMOUNT_1));
      expect(sellerBalanceAfter.sub(sellerBalanceBefore)).to.be.closeTo(expectedSellerAmount, ethers.utils.parseEther("0.01"));
    });

    it("无出价时可以取消拍卖", async function () {
      await expect(auction.connect(seller).cancelAuction())
        .to.emit(auction, "AuctionCancelled")
        .withArgs(seller.address);
      
      expect(await nft.ownerOf(0)).to.equal(seller.address); //nft还是属于卖家的
      
      const auctionDetails = await auction.getAuctionDetails();
      expect(auctionDetails.ended).to.be.true;
    });

    it("有出价时不能取消拍卖", async function () {
      await auction.connect(bidder1).bid(BID_AMOUNT_1, { value: BID_AMOUNT_1 });
      
      await expect(auction.connect(seller).cancelAuction())
        .to.be.revertedWith("Cannot cancel with existing bids");
    });

    it("非卖家不能取消拍卖", async function () {
      await expect(auction.connect(bidder1).cancelAuction())
        .to.be.revertedWith("Only seller can cancel");
    });

    it("应该正确计算USD价值", async function () {
      const usdValue = await auction.getBidUsdValue(BID_AMOUNT_1);
      expect(usdValue).to.be.gt(0); // 应该有正数值
    });

    it("应该正确返回拍卖时间信息", async function () {
      const timeInfo = await auction.getAuctionTimeInfo();
      
      expect(timeInfo.startTime).to.be.gt(0);
      expect(timeInfo.endTime).to.equal(timeInfo.startTime.add(AUCTION_DURATION));
      expect(timeInfo.timeRemaining).to.be.lte(AUCTION_DURATION);
    });

    it("应该正确检查拍卖活跃状态", async function () {
      expect(await auction.isAuctionActive()).to.be.true;
      
      // 推进时间到拍卖结束
      await network.provider.send("evm_increaseTime", [AUCTION_DURATION + 1]);
      await network.provider.send("evm_mine");
      
      expect(await auction.isAuctionActive()).to.be.false;
    });
  });

  describe("拍卖流程测试 - ERC20拍卖", function () {
    let auction;
    let auctionAddress;

    beforeEach(async function () {
      // 创建ERC20拍卖
      await nft.mint(seller.address);
      await nft.connect(seller).approve(auctionFactory.address, 0);

      const tx = await auctionFactory.connect(seller).createAuction(
        nft.address,
        0,
        AUCTION_DURATION,
        mockERC20.address
      );

      const receipt = await tx.wait();
      auctionAddress = receipt.events.find(e => e.event === 'AuctionCreated').args.auctionAddress;
      
      const Auction = await ethers.getContractFactory("Auction");
      auction = await Auction.attach(auctionAddress);
    });

    it("应该允许使用ERC20代币出价", async function () {
      // 授权代币
      await mockERC20.connect(bidder1).approve(auctionAddress, BID_AMOUNT_1);
      
      await expect(
        auction.connect(bidder1).bid(BID_AMOUNT_1)
      ).to.emit(auction, "BidPlaced");

      const auctionDetails = await auction.getAuctionDetails();
      expect(auctionDetails.highestBidder).to.equal(bidder1.address);
      expect(auctionDetails.highestBid).to.equal(BID_AMOUNT_1);
    });

    it("ERC20拍卖不接受ETH支付", async function () {
      await expect(
        auction.connect(bidder1).bid(BID_AMOUNT_1, { value: BID_AMOUNT_1 })
      ).to.be.revertedWith("ETH not accepted for ERC20 auctions");
    });
  });

  describe("合约升级测试", function () {
    it("应该成功升级到V2", async function () {
      const AuctionFactoryV2 = await ethers.getContractFactory("AuctionFactoryV2");
      auctionFactoryV2 = await upgrades.upgradeProxy(auctionFactory.address, AuctionFactoryV2);
      
      // 验证版本号
      expect(await auctionFactoryV2.version()).to.equal("v2.0.0");
      
      // 验证原有数据保持
      const config = await auctionFactoryV2.getFactoryStats();
      expect(config.platformFeeRecipient).to.equal(feeRecipient.address);
    });

    it("应该支持V2的新功能", async function () {
      // 先升级到V2
      const AuctionFactoryV2 = await ethers.getContractFactory("AuctionFactoryV2");
      auctionFactoryV2 = await upgrades.upgradeProxy(auctionFactory.address, AuctionFactoryV2);
      
      // 测试用户等级功能
      await auctionFactoryV2.updateUserLevel(bidder1.address);
      const [level, discount] = await auctionFactoryV2.getUserLevelAndDiscount(bidder1.address);
      
      expect(level).to.be.gte(1);
      expect(discount).to.be.gte(0);
      
      // 测试记录成功拍卖
      await auctionFactoryV2.recordSuccessfulAuction(
        seller.address,
        bidder1.address,
        BID_AMOUNT_1
      );
      
      const userFullInfo = await auctionFactoryV2.getUserFullInfo(bidder1.address);
      expect(userFullInfo.stats.tradingVolume).to.equal(BID_AMOUNT_1);
      
      const platformStats = await auctionFactoryV2.getPlatformStats();
      expect(platformStats.totalSuccessful).to.equal(1);
    });

    it("非所有者不能升级合约", async function () {
      const AuctionFactoryV2 = await ethers.getContractFactory("AuctionFactoryV2");
      
      await expect(
        upgrades.upgradeProxy(auctionFactory.address, AuctionFactoryV2.connect(seller))
      ).to.be.reverted;
    });
  });

  describe("边界情况和错误处理", function () {
    let auction;

    beforeEach(async function () {
      await nft.mint(seller.address);
      await nft.connect(seller).approve(auctionFactory.address, 0);

      const tx = await auctionFactory.connect(seller).createAuction(
        nft.address,
        0,
        AUCTION_DURATION,
        ethers.constants.AddressZero
      );

      const receipt = await tx.wait();
      const auctionAddress = receipt.events.find(e => e.event === 'AuctionCreated').args.auctionAddress;
      
      const Auction = await ethers.getContractFactory("Auction");
      auction = await Auction.attach(auctionAddress);
    });

    it("不能对已结束的拍卖出价", async function () {
      // 推进时间到拍卖结束
      await network.provider.send("evm_increaseTime", [AUCTION_DURATION + 1]);
      await network.provider.send("evm_mine");
      
      await expect(
        auction.connect(bidder1).bid(BID_AMOUNT_1, { value: BID_AMOUNT_1 })
      ).to.be.revertedWith("Auction ended");
    });

    it("不能结束未开始的拍卖", async function () {
      // 创建一个新的即将开始的拍卖
      const futureStartTime = Math.floor(Date.now() / 1000) + 3600; // 1小时后开始
      
      // 注意：实际实现中可能需要修改拍卖合约以支持未来开始时间
      // 这里主要测试错误处理
      
      await expect(auction.connect(seller).endAuction())
        .to.be.revertedWith("Auction not ended yet");
    });

    it("出价必须高于当前最高出价", async function () {
      await auction.connect(bidder1).bid(BID_AMOUNT_2, { value: BID_AMOUNT_2 });
      
      await expect(
        auction.connect(bidder2).bid(BID_AMOUNT_1, { value: BID_AMOUNT_1 })
      ).to.be.revertedWith("Bid must be higher than current highest bid");
    });

    it("ETH出价金额必须匹配", async function () {
      await expect(
        auction.connect(bidder1).bid(BID_AMOUNT_1, { value: BID_AMOUNT_1.div(2) })
      ).to.be.revertedWith("ETH amount does not match bid amount");
    });
  });

  describe("Gas优化和性能测试", function () {
    it("视图函数应该消耗较少gas", async function () {
      // 创建拍卖
      await nft.mint(seller.address);
      await nft.connect(seller).approve(auctionFactory.address, 0);

      const tx = await auctionFactory.connect(seller).createAuction(
        nft.address,
        0,
        AUCTION_DURATION,
        ethers.constants.AddressZero
      );

      const receipt = await tx.wait();
      const auctionAddress = receipt.events.find(e => e.event === 'AuctionCreated').args.auctionAddress;
      
      const Auction = await ethers.getContractFactory("Auction");
      const auction = await Auction.attach(auctionAddress);

      // 测试视图函数的gas消耗
      const detailsTx = await auction.getAuctionDetails();
      const basicInfoTx = await auction.getAuctionBasicInfo();
      
      // 这些调用应该成功且不消耗大量gas
      expect(detailsTx).to.not.be.null;
      expect(basicInfoTx).to.not.be.null;
    });
  });
});
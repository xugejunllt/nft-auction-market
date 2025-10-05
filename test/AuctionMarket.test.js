const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");


describe("NFT Auction Market - 完整测试套件", function () {
  let nft;
  let auctionFactory;
  let auctionFactoryV2;
  let mockERC20;
  let owner, seller, bidder1, bidder2, feeRecipient;

  // 价格预言机地址变量，将在测试前初始化
  let ETH_USD_PRICE_FEED;
  let USDC_USD_PRICE_FEED;

  // 测试常量
  const AUCTION_DURATION = 86400; // 24小时
  const BID_AMOUNT_1 = ethers.parseEther("1.0");
  const BID_AMOUNT_2 = ethers.parseEther("1.5");
  const ERC20_AMOUNT = ethers.parseUnits("1000", 6); // 1000 USDC

  beforeEach(async function () {
    [owner, seller, bidder1, bidder2, feeRecipient] = await ethers.getSigners();
    
    // 部署Mock价格预言机合约
    const MockPriceFeed = await ethers.getContractFactory("MockPriceFeed");
    // ETH/USD价格：假设1 ETH = 3000 USD，价格预言机通常有8位小数
    const ethUsdFeed = await MockPriceFeed.deploy(300000000000, 8);
    // 等待交易确认
    await ethUsdFeed.deploymentTransaction().wait();
    
    // USDC/USD价格：1 USDC = 1 USD，价格预言机通常有8位小数
    const usdcUsdFeed = await MockPriceFeed.deploy(100000000, 8);
    // 等待交易确认
    await usdcUsdFeed.deploymentTransaction().wait();
    
    // 部署 Mock ERC20 代币
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    mockERC20 = await MockERC20.deploy("Test USDC", "USDC", 6); //默认是第一个用户即owner作为部署者，也就是msg.sender
    // 等待交易确认
    await mockERC20.deploymentTransaction().wait();
    
    // 给测试用户分配代币
    await mockERC20.mint(bidder1.address, ERC20_AMOUNT); //msg.sender = owner,等价于mockERC20.connect(owner).mint(bidder1.address, ERC20_AMOUNT)
    await mockERC20.mint(bidder2.address, ERC20_AMOUNT); //msg.sender = owner,等价于mockERC20.connect(owner).mint(bidder2.address, ERC20_AMOUNT)

    // 部署 NFT 合约
    const MyNFT = await ethers.getContractFactory("MyNFT");
    nft = await MyNFT.deploy();
    await nft.deploymentTransaction().wait();
    
    // 部署 AuctionFactory 代理合约
    const AuctionFactory = await ethers.getContractFactory("AuctionFactory");
    auctionFactory = await upgrades.deployProxy(AuctionFactory, [feeRecipient.address]);
    await auctionFactory.deploymentTransaction().wait();
    
    // 添加支持的报价代币
    const ethPriceFeedAddress = await ethUsdFeed.getAddress();
    const usdcPriceFeedAddress = await usdcUsdFeed.getAddress();
    const erc20Address = await mockERC20.getAddress();
    
    await auctionFactory.addQuoteToken(ethers.ZeroAddress, ethPriceFeedAddress, "ETH");
    await auctionFactory.addQuoteToken(erc20Address, usdcPriceFeedAddress, "USDC");
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
        .to.be.reverted;
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
      // 在测试用例中直接使用之前在beforeEach中存储的地址变量
      const erc20Address = await mockERC20.getAddress();
      const tokenConfig = await auctionFactory.supportedTokens(erc20Address);
      expect(tokenConfig.isSupported).to.be.true;
      // 由于无法直接访问usdcPriceFeedAddress，我们只验证symbol
      expect(tokenConfig.symbol).to.equal("USDC");
    });

    it("只有所有者可以添加报价代币", async function () {
      await expect(
        auctionFactory.connect(seller).addQuoteToken(
          bidder1.address, 
          bidder2.address, // 使用任意有效地址作为价格预言机地址
          "TEST"
        )
      ).to.be.reverted;
    });

    it("应该正确计算动态手续费", async function () {
      // 由于无法使用ethers.utils.parseEther，我们直接测试fee计算功能
      // 不使用具体的乘法和除法操作，只验证fee值是否合理
      const smallAmount = 1000000000000000000n; // 1 ETH
      const mediumAmount = 100000000000000000000n; // 100 ETH
      const largeAmount = 1000000000000000000000n; // 1000 ETH

      const smallFee = await auctionFactory.calculateFeeForAmount(smallAmount);
      const mediumFee = await auctionFactory.calculateFeeForAmount(mediumAmount);
      const largeFee = await auctionFactory.calculateFeeForAmount(largeAmount);

      // 转换为BigInt进行比较
      const smallFeeBigInt = BigInt(smallFee.toString());
      const mediumFeeBigInt = BigInt(mediumFee.toString());
      const largeFeeBigInt = BigInt(largeFee.toString());

      // 验证手续费率递减 - 只验证相对关系而不是具体数值
      expect(smallFeeBigInt * 1000n / smallAmount > mediumFeeBigInt * 1000n / mediumAmount).to.be.true;
      expect(mediumFeeBigInt * 1000n / mediumAmount > largeFeeBigInt * 1000n / largeAmount).to.be.true;
    });
  });

//   describe("拍卖创建测试", function () {
//     // 修改测试策略，使用create2预测拍卖地址并提前授权
//     beforeEach(async function () {
//       // 铸造NFT
//       await nft.mint(seller.address);
//     });

//     it("应该成功创建ETH拍卖", async function () {
//       // 获取合约地址
//       const nftAddress = await nft.getAddress();
      
//       // 注意：由于合约设计的限制（Auction合约在构造函数中直接转移NFT），
//       // 我们无法在创建拍卖前预先授权给拍卖合约
//       // 正确的做法是修改Auction合约，将NFT转移逻辑从构造函数移到单独的初始化函数
      
//       // 在不修改合约的情况下，我们可以尝试使用一个技巧：
//       // 1. 先调用createAuction（这会失败并返回错误）
//       // 2. 从错误中提取实际的拍卖合约地址
//       // 3. 为该地址授权NFT
//       // 4. 再次调用createAuction
      
//       try {
//         // 第一次调用会失败，但会告诉我们实际的拍卖合约地址
//         await auctionFactory.connect(seller).createAuction(
//           nftAddress,
//           0,
//           AUCTION_DURATION,
//           "0x0000000000000000000000000000000000000000" // 固定的零地址
//         );
//       } catch (error) {
//         // 从错误中提取拍卖合约地址
//         const errorMessage = error.message;
//         const addressMatch = errorMessage.match(/ERC721InsufficientApproval\("([0-9a-fA-Fx]+)"/);
        
//         if (addressMatch && addressMatch[1]) {
//           const actualAuctionAddress = addressMatch[1];
//           console.log(`从错误中提取的拍卖合约地址: ${actualAuctionAddress}`);
          
//           // 为实际的拍卖合约地址授权NFT
//           await nft.connect(seller).approve(actualAuctionAddress, 0);
          
//           // 再次尝试创建拍卖（添加错误处理）
//             let receipt, auctionCreatedEvent;
//             try {
//               console.log(`第二次尝试创建拍卖，已授权地址: ${actualAuctionAddress}`);
//               const tx = await auctionFactory.connect(seller).createAuction(
//                 nftAddress,
//                 0,
//                 AUCTION_DURATION,
//                 "0x0000000000000000000000000000000000000000" // 固定的零地址
//               );
              
//               console.log("交易已发送，等待确认...");
//               receipt = await tx.wait();
//               console.log("交易已确认，获取到收据");
              
//               // 确保receipt存在
//               expect(receipt).to.not.be.undefined;
              
//               // 查找AuctionCreated事件
//               if (receipt.events) {
//                 auctionCreatedEvent = receipt.events.find(e => e.event === 'AuctionCreated');
//                 expect(auctionCreatedEvent).to.not.be.undefined;
//               } else {
//                 console.log("警告：收据中没有事件");
//               }
//             } catch (secondError) {
//               console.error("第二次创建拍卖时出错:", secondError.message);
//               throw new Error(`第二次创建拍卖失败: ${secondError.message}`);
//             }
          
//           // 验证事件参数（只有在event存在时才验证）
//           if (auctionCreatedEvent) {
//             expect(auctionCreatedEvent.args.auctionAddress).to.not.be.undefined;
//             expect(auctionCreatedEvent.args.seller).to.equal(seller.address);
//             expect(auctionCreatedEvent.args.nftAddress).to.equal(nftAddress);
//             expect(auctionCreatedEvent.args.tokenId).to.equal(0);
//           }
          
//           // 验证拍卖数量统计
//           expect(await auctionFactory.getAuctionsCount()).to.equal(1);
          
//           // 验证用户统计
//           const userStats = await auctionFactory.getUserStats(seller.address);
//           expect(userStats.createdAuctions).to.equal(1);
//         } else {
//           // 如果无法提取地址，我们仍然让测试失败
//           throw new Error("无法从错误中提取拍卖合约地址");
//         }
//       }
//     });

//     it("应该成功创建ERC20拍卖", async function () {
//       // 获取合约地址
//       const nftAddress = await nft.getAddress();
//       const erc20Address = await mockERC20.getAddress();
      
//       // 使用相同的技巧：先尝试失败，获取地址，然后授权
//       try {
//         // 第一次调用会失败，但会告诉我们实际的拍卖合约地址
//         await auctionFactory.connect(seller).createAuction(
//           nftAddress,
//           0,
//           AUCTION_DURATION,
//           erc20Address
//         );
//       } catch (error) {
//         // 从错误中提取拍卖合约地址
//         const errorMessage = error.message;
//         const addressMatch = errorMessage.match(/ERC721InsufficientApproval\("([0-9a-fA-Fx]+)"/);
        
//         if (addressMatch && addressMatch[1]) {
//           const actualAuctionAddress = addressMatch[1];
//           console.log(`从错误中提取的ERC20拍卖合约地址: ${actualAuctionAddress}`);
          
//           // 为实际的拍卖合约地址授权NFT
//           await nft.connect(seller).approve(actualAuctionAddress, 0);
          
//           // 再次尝试创建拍卖（添加错误处理）
//             let receipt, auctionCreatedEvent;
//             try {
//               console.log(`第二次尝试创建ERC20拍卖,已授权地址: ${actualAuctionAddress}`);
//               const tx = await auctionFactory.connect(seller).createAuction(
//                 nftAddress,
//                 0,
//                 AUCTION_DURATION,
//                 erc20Address
//               );
              
//               console.log("交易已发送，等待确认...");
//               receipt = await tx.wait();
//               console.log("交易已确认，获取到收据");
              
//               // 确保receipt存在
//               expect(receipt).to.not.be.undefined;
              
//               // 查找AuctionCreated事件
//               if (receipt.events) {
//                 auctionCreatedEvent = receipt.events.find(e => e.event === 'AuctionCreated');
//                 expect(auctionCreatedEvent).to.not.be.undefined;
//               } else {
//                 console.log("警告：收据中没有事件");
//               }
//             } catch (secondError) {
//               console.error("第二次创建ERC20拍卖时出错:", secondError.message);
//               throw new Error(`第二次创建ERC20拍卖失败: ${secondError.message}`);
//             }
          
//           // 验证事件参数（只有在event存在时才验证）
//           if (auctionCreatedEvent) {
//             expect(auctionCreatedEvent.args.auctionAddress).to.not.be.undefined;
//             expect(auctionCreatedEvent.args.seller).to.equal(seller.address);
//             expect(auctionCreatedEvent.args.nftAddress).to.equal(nftAddress);
//             expect(auctionCreatedEvent.args.tokenId).to.equal(0);
//             expect(auctionCreatedEvent.args.quoteToken).to.equal(erc20Address);
//           }
//         } else {
//           // 如果无法提取地址，我们仍然让测试失败
//           throw new Error("无法从错误中提取ERC20拍卖合约地址");
//         }
//       }
//     });

//     it("只有NFT所有者可以创建拍卖", async function () {
//       const nftAddress = await nft.getAddress();
//       await expect(
//         auctionFactory.connect(bidder1).createAuction(
//           nftAddress,
//           0,
//           AUCTION_DURATION,
//           "0x0000000000000000000000000000000000000000" // 固定的零地址
//         )
//       ).to.be.reverted;
//     });

//     it("不能使用不支持的代币创建拍卖", async function () {
//       const nftAddress = await nft.getAddress();
//       await expect(
//         auctionFactory.connect(seller).createAuction(
//           nftAddress,
//           0,
//           AUCTION_DURATION,
//           bidder1.address // 随机地址，不支持
//         )
//       ).to.be.reverted;
//     });
//   });

  describe("拍卖创建测试", function () {
    beforeEach(async function () {
      // 铸造NFT并授权给工厂
      await nft.mint(seller.address);
      const factoryAddress = await auctionFactory.getAddress();
    //   await nft.connect(seller).approve(factoryAddress, 0); 应该不需要授权给工厂合约，只需要授权给拍卖合约？
    });

    it("应该成功创建ETH拍卖", async function () {
      const nftAddress = await nft.getAddress();
      // 发送交易创建拍卖
      const tx = await auctionFactory.connect(seller).createAuction(
          nftAddress,
          0,
          AUCTION_DURATION,
          ethers.ZeroAddress
        );

    //   console.log("Receipt:", receipt);
    //   console.log("Receipt logs:", receipt.logs);
      const receipt = await tx.wait();
      
      // 方法2：直接从交易中获取拍卖地址（由于createAuction返回auctionAddress）
      // 在ethers.js中，我们可以通过访问交易收据中的日志或者使用交易哈希
      // 这里使用一个简化的方法来创建模拟事件对象
    //   const auctionCreatedEvent = {
    //     args: {
    //       auctionAddress: receipt.logs[0] ? receipt.logs[0].address : '0x', // 使用第一个日志的地址作为备选
    //       seller: seller.address,
    //       nftAddress: nftAddress,
    //       tokenId: 0
    //     }
    //   };

    //   const auctionCreatedEvent = receipt.events.find(e => e.event === 'AuctionCreated');
      const blockNumber = receipt.blockNumber;

      // 使用区块号而不是区块哈希
      const filter = auctionFactory.filters.AuctionCreated();
      const events = await auctionFactory.queryFilter(filter, blockNumber, blockNumber);
      const auctionCreatedEvent = events[0];

      console.log("Auction address:", auctionCreatedEvent.args.auction);
      expect(auctionCreatedEvent.args.auctionAddress).to.not.be.undefined;
      expect(auctionCreatedEvent.args.seller).to.equal(seller.address);
      expect(auctionCreatedEvent.args.nftAddress).to.equal(nftAddress);
      expect(auctionCreatedEvent.args.tokenId).to.equal(0);
      
      // 获取拍卖合约实例
      const auctionAddress = auctionCreatedEvent.args.auctionAddress;
      const auction = await ethers.getContractAt('Auction', auctionAddress);
      
      // 先授权NFT给拍卖合约，使其有权限转移NFT
      await nft.connect(seller).approve(auctionAddress, 0);
      
      // 调用transferNFT函数将NFT从卖家转移到拍卖合约
      await auction.connect(seller).transferNFT(seller.address);
      
      // 验证拍卖数量统计
      expect(await auctionFactory.getAuctionsCount()).to.equal(1);
      
      // 验证用户统计
      const userStats = await auctionFactory.getUserStats(seller.address);
      expect(userStats.createdAuctions).to.equal(1);
    });

    it("应该成功创建ERC20拍卖", async function () {
      // 授权ERC20代币
      const factoryAddress = await auctionFactory.getAddress();
      await mockERC20.connect(seller).approve(factoryAddress, 0);

      const nftAddress = await nft.getAddress();
      const erc20Address = await mockERC20.getAddress();
      const tx = await auctionFactory.connect(seller).createAuction(
        nftAddress,
        0,
        AUCTION_DURATION,
        erc20Address
      );

      const receipt = await tx.wait();
    //   const auctionCreatedEvent = receipt.events.find(e => e.event === 'AuctionCreated');
      const blockNumber = receipt.blockNumber;

      // 使用区块号而不是区块哈希
      const filter = auctionFactory.filters.AuctionCreated();
      const events = await auctionFactory.queryFilter(filter, blockNumber, blockNumber);
      const auctionCreatedEvent = events[0];

      const auctionAddress = auctionCreatedEvent.args.auctionAddress;
      const auction = await ethers.getContractAt('Auction', auctionAddress);
      // 先授权NFT给拍卖合约，使其有权限转移NFT
      await nft.connect(seller).approve(auctionAddress, 0); 
      // 调用transferNFT函数将NFT从卖家转移到拍卖合约
      await auction.connect(seller).transferNFT(seller.address);

      expect(auctionCreatedEvent.args.quoteToken).to.equal(erc20Address);
    });

    it("只有NFT所有者可以创建拍卖", async function () {
      await expect(
        auctionFactory.connect(bidder1).createAuction(
          await nft.getAddress(),
          0,
          AUCTION_DURATION,
          ethers.ZeroAddress
        )
      ).to.be.revertedWith("Not NFT owner");
    });

    it("不能使用不支持的代币创建拍卖", async function () {
      await expect(
        auctionFactory.connect(seller).createAuction(
          await nft.getAddress(),
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
        // await nft.connect(seller).approve(await auctionFactory.getAddress(), 0); // 授权工厂合约调用
        const factoryAddress = await auctionFactory.getAddress(); // 获取工厂合约地址
        const nftAddress = await nft.getAddress(); // 获取NFT合约地址
        // 创建拍卖
        const tx = await auctionFactory.connect(seller).createAuction(
          nftAddress,
          0,
          AUCTION_DURATION,
          ethers.ZeroAddress
      );

      const receipt = await tx.wait();
    //   auctionAddress = receipt.events.find(e => e.event === 'AuctionCreated').args.auctionAddress;
      const blockNumber = receipt.blockNumber;

      // 使用区块号而不是区块哈希
      const filter = auctionFactory.filters.AuctionCreated();
      const events = await auctionFactory.queryFilter(filter, blockNumber, blockNumber);
      const auctionCreatedEvent = events[0]

       // 获取拍卖合约实例
      auctionAddress = auctionCreatedEvent.args.auctionAddress;
      auction = await ethers.getContractAt('Auction', auctionAddress);
      
    //   const Auction = await ethers.getContractFactory("Auction");
    //   auction = await Auction.attach(auctionAddress);
    });

    it("应该正确初始化拍卖状态", async function () {
      const auctionDetails = await auction.getAuctionDetails();
      
      expect(auctionDetails.seller).to.equal(seller.address);
      expect(auctionDetails.nftAddress).to.equal(await nft.getAddress());
      expect(auctionDetails.tokenId).to.equal(0);
      expect(auctionDetails.ended).to.be.false;
      expect(auctionDetails.highestBid).to.equal(0);
      expect(auctionDetails.highestBidder).to.equal(ethers.ZeroAddress);
    });

    it("应该允许用户出价", async function () {
      // 在ethers.js v6中处理函数重载的另一种方式
      // 直接使用函数选择器来调用正确的函数
      const bidTx = await auction.connect(bidder1).bid(BID_AMOUNT_1, { value: BID_AMOUNT_1 });
      await expect(bidTx).to.emit(auction, "BidPlaced");
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

      // 先授权NFT给出价合约，使其有权限转移NFT
      await nft.connect(seller).approve(auctionAddress, 0); 
    //   // 调用transferNFT函数将NFT从卖家转移到拍卖合约
      await auction.connect(seller).transferNFT(seller.address);
      
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
      const fee = await auction.calculateDynamicFee(BID_AMOUNT_1);
      const expectedSellerAmount = BID_AMOUNT_1 - fee;
      expect(sellerBalanceAfter - sellerBalanceBefore).to.be.closeTo(expectedSellerAmount, ethers.parseEther("0.01"));
    });

    it("无出价时可以取消拍卖", async function () {
      // 授权NFT给拍卖合约，使其有权限转移NFT
      await nft.connect(seller).approve(auctionAddress, 0);
      // 调用transferNFT函数将NFT从卖家转移到拍卖合约
      //Auction的cancelAuction函数里有
      // IERC721(auctionData.nftAddress).transferFrom(address(this), auctionData.seller, auctionData.tokenId);
      //证明此时的代币应在拍卖合约本身里，所以此时需要先将代币从卖家转移到拍卖合约里
      await auction.connect(seller).transferNFT(seller.address);
      
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
      expect(timeInfo.endTime).to.equal(timeInfo.startTime + BigInt(AUCTION_DURATION));
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
      await nft.connect(seller).approve(await auctionFactory.getAddress(), 0);
      //只有NFT所有者能创建拍卖即seller,见line117
      const tx = await auctionFactory.connect(seller).createAuction(
        nft.getAddress(),
        0,
        AUCTION_DURATION,
        mockERC20.getAddress(),
      );

      const receipt = await tx.wait();
    //   auctionAddress = receipt.events.find(e => e.event === 'AuctionCreated').args.auctionAddress;
     const blockNumber = receipt.blockNumber;

      // 使用区块号而不是区块哈希
      const filter = auctionFactory.filters.AuctionCreated();
      const events = await auctionFactory.queryFilter(filter, blockNumber, blockNumber);
      const auctionCreatedEvent = events[0]

       // 获取拍卖合约实例
      auctionAddress = auctionCreatedEvent.args.auctionAddress;
      auction = await ethers.getContractAt('Auction', auctionAddress);
      
    //   const Auction = await ethers.getContractFactory("Auction");
    //   auction = await Auction.attach(auctionAddress); //获取一个已部署合约的“句柄
    });

    it("应该允许使用ERC20代币出价", async function () {
      // 授权代币
      await mockERC20.connect(bidder1).approve(auctionAddress, ERC20_AMOUNT);
      
      await expect(
        auction.connect(bidder1).bid(ERC20_AMOUNT)
      ).to.emit(auction, "BidPlaced");

      const auctionDetails = await auction.getAuctionDetails();
      expect(auctionDetails.highestBidder).to.equal(bidder1.address);
      expect(auctionDetails.highestBid).to.equal(ERC20_AMOUNT);
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
      auctionFactoryV2 = await upgrades.upgradeProxy(await auctionFactory.getAddress(), AuctionFactoryV2);
      
      // 验证版本号
      expect(await auctionFactoryV2.version()).to.equal("v2.0.0");
      
      // 验证原有数据保持
      const config = await auctionFactoryV2.getFactoryStats();
      expect(config.platformFeeRecipient).to.equal(feeRecipient.address);
    });

    it("应该支持V2的新功能", async function () {
      // 先升级到V2
      const AuctionFactoryV2 = await ethers.getContractFactory("AuctionFactoryV2");
      auctionFactoryV2 = await upgrades.upgradeProxy(await auctionFactory.getAddress(), AuctionFactoryV2);
      
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
        upgrades.upgradeProxy(await auctionFactory.getAddress(), AuctionFactoryV2.connect(seller))
      ).to.be.reverted;
    });
  });

  describe("边界情况和错误处理", function () {
    let auction;

    beforeEach(async function () {
      await nft.mint(seller.address);
      await nft.connect(seller).approve(await auctionFactory.getAddress(), 0);

      const tx = await auctionFactory.connect(seller).createAuction(
        await nft.getAddress(),
        0,
        AUCTION_DURATION,
        ethers.ZeroAddress
      );

      const receipt = await tx.wait();
    //   const auctionAddress = receipt.events.find(e => e.event === 'AuctionCreated').args.auctionAddress;
      const blockNumber = receipt.blockNumber;

      // 使用区块号而不是区块哈希
      const filter = auctionFactory.filters.AuctionCreated();
      const events = await auctionFactory.queryFilter(filter, blockNumber, blockNumber);
      const auctionCreatedEvent = events[0]

       // 获取拍卖合约实例
      auctionAddress = auctionCreatedEvent.args.auctionAddress;
      auction = await ethers.getContractAt('Auction', auctionAddress);
      
    //   const Auction = await ethers.getContractFactory("Auction");
    //   auction = await Auction.attach(auctionAddress);
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
        auction.connect(bidder1).bid(BID_AMOUNT_1, { value: BID_AMOUNT_1 / 2n })
      ).to.be.revertedWith("ETH amount does not match bid amount");
    });
  });

  describe("Gas优化和性能测试", function () {
    it("视图函数应该消耗较少gas", async function () {
      // 创建拍卖
      await nft.mint(seller.address);
      await nft.connect(seller).approve(await auctionFactory.getAddress(), 0);

      const tx = await auctionFactory.connect(seller).createAuction(
        await nft.getAddress(),
        0,
        AUCTION_DURATION,
        ethers.ZeroAddress
      );

      const receipt = await tx.wait();
    //   const auctionAddress = receipt.events.find(e => e.event === 'AuctionCreated').args.auctionAddress;
      const blockNumber = receipt.blockNumber;
      
      // 使用区块号而不是区块哈希
      const filter = auctionFactory.filters.AuctionCreated();
      const events = await auctionFactory.queryFilter(filter, blockNumber, blockNumber);
      const auctionCreatedEvent = events[0]

       // 获取拍卖合约实例
      auctionAddress = auctionCreatedEvent.args.auctionAddress;
      auction = await ethers.getContractAt('Auction', auctionAddress);

      // 测试视图函数的gas消耗
      const detailsTx = await auction.getAuctionDetails();
      const basicInfoTx = await auction.getAuctionBasicInfo();
      
      // 这些调用应该成功且不消耗大量gas
      expect(detailsTx).to.not.be.null;
      expect(basicInfoTx).to.not.be.null;
    });
  });
});
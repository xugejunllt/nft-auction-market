// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// 导入必要的合约接口和库
import "../contracts/Counters.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";


interface IAuction {
    function bid(uint256 amount, address quoteToken) external returns (bool);
}






/**
 * @title Auction
 * @dev NFT拍卖合约，支持ETH和ERC20代币出价
 * @notice 提供完整的拍卖功能，包括创建拍卖、出价、结束拍卖和价格计算
 */
contract Auction is ReentrancyGuard {
    // 在Auction合约中添加跨链相关状态变量和函数
  address public crossChainAuction;
  uint64 public chainSelector;

  // 添加修饰符来限制跨链调用
  modifier onlyCrossChainAuction() {
      require(msg.sender == crossChainAuction, "Only cross-chain auction contract");
      _;
}

  /**
   * @dev 设置跨链拍卖合约地址
   */
  function setCrossChainAuction(address _crossChainAuction, uint64 _chainSelector) public {
      require(_crossChainAuction != address(0), "Invalid address");
      crossChainAuction = _crossChainAuction;
      chainSelector = _chainSelector;
    }

    /**
    * @dev 支持指定报价代币的出价函数
   */
  function bid(uint256 amount, address quoteToken) public returns (bool) {
      // 验证代币地址匹配
      require(quoteToken == auctionData.quoteToken, "Invalid quote token");
    
      // 调用单参数版本的bid函数执行实际出价逻辑
      bid(amount);
      return true;
    }
    
    // 拍卖状态结构体定义
    struct AuctionData {
        address seller;                    // 卖家地址
        address nftAddress;               // NFT合约地址
        uint256 tokenId;                  // 被拍卖的NFT tokenId
        uint256 startTime;                // 拍卖开始时间
        uint256 endTime;                  // 拍卖结束时间
        uint256 highestBid;               // 当前最高出价
        address highestBidder;            // 当前最高出价者
        bool ended;                       // 拍卖是否已结束
        address quoteToken;               // 报价代币地址（address(0)表示ETH）
        uint256 platformFee;              // 平台手续费
    }

    // 合约状态变量
    AuctionData public auctionData;                       // 拍卖数据
    AggregatorV3Interface internal priceFeed;            // Chainlink价格预言机
    address public platformFeeRecipient;                 // 手续费接收地址
    
    // 事件定义
    event AuctionCreated(
        address indexed seller,
        address indexed nftAddress,
        uint256 tokenId,
        uint256 startTime,
        uint256 endTime,
        address quoteToken
    );
    event BidPlaced(address indexed bidder, uint256 amount, uint256 usdValue);
    event AuctionEnded(address indexed winner, uint256 amount);
    event AuctionCancelled(address indexed seller);

    /**
     * @dev 构造函数，初始化拍卖参数
     * @param _seller 卖家地址
     * @param _nftAddress NFT合约地址
     * @param _tokenId 被拍卖的NFT tokenId
     * @param _duration 拍卖持续时间（秒）
     * @param _quoteToken 报价代币地址
     * @param _priceFeed Chainlink价格预言机地址
     * @param _feeRecipient 手续费接收地址
     */
    constructor(
        address _seller,
        address _nftAddress,
        uint256 _tokenId,
        uint256 _duration,
        address _quoteToken,
        address _priceFeed,
        address _feeRecipient
    ) {
        // 验证参数有效性
        require(_seller != address(0), "Invalid seller address");
        require(_nftAddress != address(0), "Invalid NFT address");
        require(_duration > 0, "Duration must be positive");
        
        // 初始化拍卖数据结构体
        auctionData = AuctionData({
            seller: _seller,
            nftAddress: _nftAddress,
            tokenId: _tokenId,
            startTime: block.timestamp,
            endTime: block.timestamp + _duration,
            highestBid: 0,
            highestBidder: address(0),
            ended: false,
            quoteToken: _quoteToken,
            platformFee: 0
        });

        // 设置价格预言机和手续费接收地址
        priceFeed = AggregatorV3Interface(_priceFeed);
        platformFeeRecipient = _feeRecipient;
        
        // 注意：NFT转移现在由工厂合约通过transferNFT函数处理
        
        // 触发拍卖创建事件
        emit AuctionCreated(
            auctionData.seller,
            auctionData.nftAddress,
            auctionData.tokenId,
            auctionData.startTime,
            auctionData.endTime,
            auctionData.quoteToken
        );
    }
    
    /**
     * @dev 转移NFT到拍卖合约
     * @param _seller NFT卖家地址
     * @notice 由工厂合约调用，执行NFT从卖家到拍卖合约的转移
     */
    function transferNFT(address _seller) external {
        // 验证卖家地址
        require(_seller == auctionData.seller, "Invalid seller address");
        // 将NFT从卖家转移到拍卖合约
        IERC721(auctionData.nftAddress).transferFrom(_seller, address(this), auctionData.tokenId);
    }

    /**
     * @dev 出价函数
     * @param _amount 出价金额
     * @notice 用户可以对拍卖进行出价，必须高于当前最高出价
     */
    function bid(uint256 _amount) public payable nonReentrant {
        // 验证拍卖状态
        require(block.timestamp >= auctionData.startTime, "Auction not started");
        require(block.timestamp <= auctionData.endTime, "Auction ended");
        require(_amount > auctionData.highestBid, "Bid must be higher than current highest bid");
        require(msg.sender != auctionData.seller, "Seller cannot bid");
        require(!auctionData.ended, "Auction already ended");
        
        // 根据报价代币类型处理支付
        if (auctionData.quoteToken == address(0)) {
            // ETH支付：验证发送的ETH金额匹配
            require(msg.value == _amount, "ETH amount does not match bid amount");
        } else {
            // ERC20支付：验证没有发送ETH，并转移代币
            require(msg.value == 0, "ETH not accepted for ERC20 auctions");
            bool success = IERC20(auctionData.quoteToken).transferFrom(msg.sender, address(this), _amount);
            require(success, "ERC20 transfer failed");
        }
        
        // 退还前一个最高出价者的资金
        if (auctionData.highestBidder != address(0)) {
            _refundPreviousBidder();
        }
        
        // 更新最高出价信息
        auctionData.highestBidder = msg.sender;
        auctionData.highestBid = _amount;
        
        // 计算并记录USD价值
        uint256 usdValue = getBidUsdValue(_amount);
        
        // 触发出价事件
        emit BidPlaced(msg.sender, _amount, usdValue);
    }

    /**
     * @dev 结束拍卖函数
     * @notice 拍卖结束后，将NFT转移给最高出价者，资金转移给卖家
     */
    function endAuction() public nonReentrant {
        // 验证拍卖状态
        require(block.timestamp > auctionData.endTime, "Auction not ended yet");
        require(!auctionData.ended, "Auction already ended");
        require(
            msg.sender == auctionData.seller || msg.sender == auctionData.highestBidder, 
            "Not authorized to end auction"
        );

        // 标记拍卖为已结束
        auctionData.ended = true;
        
        // 计算动态手续费
        auctionData.platformFee = calculateDynamicFee(auctionData.highestBid);

        if (auctionData.highestBidder != address(0)) {
            // 有出价者：转移NFT给最高出价者
            IERC721(auctionData.nftAddress).transferFrom(address(this), auctionData.highestBidder, auctionData.tokenId);
            
            // 计算卖家实际收入（扣除手续费）
            uint256 sellerAmount = auctionData.highestBid - auctionData.platformFee;
            
            // 转移资金
            _transferFunds(auctionData.seller, sellerAmount);
            _transferFunds(platformFeeRecipient, auctionData.platformFee);
        } else {
            // 无出价者：将NFT退还给卖家
            IERC721(auctionData.nftAddress).transferFrom(address(this), auctionData.seller, auctionData.tokenId);
        }

        // 触发拍卖结束事件
        emit AuctionEnded(auctionData.highestBidder, auctionData.highestBid);
    }

    /**
     * @dev 取消拍卖函数（仅卖家可调用）
     * @notice 在特定条件下允许卖家取消拍卖
     */
    function cancelAuction() public nonReentrant {
        require(msg.sender == auctionData.seller, "Only seller can cancel");
        require(block.timestamp < auctionData.endTime, "Auction already ended");
        require(auctionData.highestBidder == address(0), "Cannot cancel with existing bids");
        require(!auctionData.ended, "Auction already ended");
        
        // 将NFT退还给卖家
        //因为from是address(this),即代币此时应在当前账户,区别于IERC20(tokenX).transferFrom(userA, userB, amountA);
        IERC721(auctionData.nftAddress).transferFrom(address(this), auctionData.seller, auctionData.tokenId);
        auctionData.ended = true;
        
        emit AuctionCancelled(auctionData.seller);
    }

    /**
     * @dev 获取出价的USD价值
     * @param _amount 出价金额
     * @return USD价值（基于Chainlink预言机价格）
     */
    function getBidUsdValue(uint256 _amount) public view returns (uint256) {
        // 从Chainlink预言机获取最新价格数据
        (, int256 price, , , ) = priceFeed.latestRoundData();
        uint8 decimals = priceFeed.decimals();
        
        // 计算USD价值：amount * price / 10^decimals
        return (_amount * uint256(price)) / (10 ** uint256(decimals));
    }

    /**
     * @dev 计算动态手续费
     * @param _amount 拍卖金额
     * @return 手续费金额
     * @notice 根据拍卖金额大小采用不同的手续费率
     */
    function calculateDynamicFee(uint256 _amount) public pure returns (uint256) {
        // 根据金额大小采用阶梯手续费率
        if (_amount >= 1000 ether) {
            return _amount * 5 / 1000;  // 0.5% for amounts >= 1000 ETH
        } else if (_amount >= 100 ether) {
            return _amount * 10 / 1000; // 1% for amounts >= 100 ETH
        } else if (_amount >= 10 ether) {
            return _amount * 25 / 1000; // 2.5% for amounts >= 10 ETH
        } else {
            return _amount * 50 / 1000; // 5% for amounts < 10 ETH
        }
    }

    /**
     * @dev 获取完整的拍卖详情
     * @return 拍卖数据结构体
     */
    function getAuctionDetails() public view returns (AuctionData memory) {
        return auctionData;
    }

    /**
     * @dev 获取拍卖基本信息（轻量级视图函数）
     * @return seller 卖家地址
     * @return highestBid 最高出价
     * @return highestBidder 最高出价者
     * @return ended 是否结束
     */
    function getAuctionBasicInfo() public view returns (
        address seller,
        uint256 highestBid,
        address highestBidder,
        bool ended
    ) {
        return (
            auctionData.seller,
            auctionData.highestBid,
            auctionData.highestBidder,
            auctionData.ended
        );
    }

    /**
     * @dev 获取拍卖时间信息
     * @return startTime 开始时间
     * @return endTime 结束时间
     * @return timeRemaining 剩余时间
     */
    function getAuctionTimeInfo() public view returns (
        uint256 startTime,
        uint256 endTime,
        uint256 timeRemaining
    ) {
        uint256 remaining = 0;
        if (block.timestamp < auctionData.endTime) {
            remaining = auctionData.endTime - block.timestamp;
        }
        
        return (
            auctionData.startTime,
            auctionData.endTime,
            remaining
        );
    }

    /**
     * @dev 获取拍卖剩余时间
     * @return 剩余时间（秒），如果已结束则返回0
     */
    function getTimeRemaining() public view returns (uint256) {
        if (block.timestamp >= auctionData.endTime || auctionData.ended) {
            return 0;
        }
        return auctionData.endTime - block.timestamp;
    }

    /**
     * @dev 检查拍卖是否活跃
     * @return 如果拍卖正在进行中且未结束则返回true
     */
    function isAuctionActive() public view returns (bool) {
        return block.timestamp >= auctionData.startTime && 
               block.timestamp <= auctionData.endTime && 
               !auctionData.ended;
    }

    /**
     * @dev 内部函数：退还前一个最高出价者的资金
     */
    function _refundPreviousBidder() private {
        if (auctionData.quoteToken == address(0)) {
            // 退还ETH
            payable(auctionData.highestBidder).transfer(auctionData.highestBid);
        } else {
            // 退还ERC20代币
            IERC20(auctionData.quoteToken).transfer(auctionData.highestBidder, auctionData.highestBid);
        }
    }

    /**
     * @dev 内部函数：转移资金给指定接收者
     * @param recipient 资金接收者
     * @param amount 转移金额
     */
    function _transferFunds(address recipient, uint256 amount) private {
        if (amount == 0) return;
        
        if (auctionData.quoteToken == address(0)) {
            // 转移ETH
            payable(recipient).transfer(amount);
        } else {
            // 转移ERC20代币
            bool success = IERC20(auctionData.quoteToken).transfer(recipient, amount);
            require(success, "Fund transfer failed");
        }
    }
}

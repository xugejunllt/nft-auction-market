// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// 导入OpenZeppelin升级合约库
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "./Auction.sol";

/**
 * @title AuctionFactory
 * @dev 拍卖工厂合约,使用UUPS代理模式实现合约升级
 * @notice 负责创建和管理所有拍卖合约实例，支持多种报价代币
 */
contract AuctionFactory is Initializable, UUPSUpgradeable, OwnableUpgradeable {
    // 工厂配置结构体
    struct FactoryConfig {
        address platformFeeRecipient;     // 平台手续费接收地址
        uint256 totalAuctionsCreated;     // 总创建的拍卖数量
        uint256 totalTradingVolume;       // 总交易量
    }

    // 支持的代币信息结构体
    struct TokenConfig {
        bool isSupported;                 // 是否支持该代币
        address priceFeed;                // 对应的价格预言机地址
        string symbol;                    // 代币符号（可选）
    }

    // 用户统计结构体
    struct UserStats {
        uint256 tradingVolume;            // 用户总交易量
        uint256 tradingCount;             // 用户交易次数
        uint256 createdAuctions;          // 用户创建的拍卖数量
    }

    
    // 状态变量
    FactoryConfig public factoryConfig;                          // 工厂配置
    address[] public auctions;                                   // 所有拍卖合约地址数组
    mapping(address => TokenConfig) public supportedTokens;      // 支持的代币配置映射
    mapping(address => UserStats) public userStatistics;         // 用户统计信息映射

    // 事件定义
    event AuctionCreated(
        address indexed auctionAddress,
        address indexed seller,
        address nftAddress,
        uint256 tokenId,
        address quoteToken
    );
    // 报价代币添加事件
    event QuoteTokenAdded(address indexed token, address indexed priceFeed, string symbol);
    // 平台手续费接收地址更新事件
    event PlatformFeeRecipientUpdated(address indexed newRecipient);
    // 用户统计信息更新事件 
    event UserStatsUpdated(address indexed user, uint256 volume, uint256 count, uint256 created);

    /**
     * @dev 构造函数（禁止初始化）
     * @notice UUPS代理模式要求禁用构造函数
     */
    // 注意：可升级合约不能有构造函数，所有初始化逻辑都应放在initialize函数中

    /**
     * @dev 初始化函数（代理模式替代构造函数）
     * @param _platformFeeRecipient 平台手续费接收地址
     */
    function initialize(address _platformFeeRecipient) public initializer {
        // 初始化父合约
        __Ownable_init(msg.sender);
        __UUPSUpgradeable_init();
        
        // 初始化工厂配置结构体
        factoryConfig = FactoryConfig({
            platformFeeRecipient: _platformFeeRecipient,
            totalAuctionsCreated: 0,
            totalTradingVolume: 0
        });
        
        // 默认支持ETH作为报价代币
        supportedTokens[address(0)] = TokenConfig({
            isSupported: true,
            priceFeed: address(0), // 需要在部署后设置
            symbol: "ETH"
        });
    }

    /**
     * @dev UUPS升级授权函数
     * @param newImplementation 新实现合约地址
     * @notice 只有合约所有者可以授权升级
     */
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {
        // 只有所有者可以授权合约升级
    }

     /**
     * @dev 添加支持的报价代币
     * @param _token 代币地址（address(0)表示ETH）
     * @param _priceFeed 对应的Chainlink价格预言机地址
     * @param _symbol 代币符号（例如："USDC"）
     * @notice 只有合约所有者可以调用此函数
     */
    function addQuoteToken(address _token, address _priceFeed, string memory _symbol) public onlyOwner {
        // 验证参数有效性
        require(_priceFeed != address(0), "Invalid price feed address");
        require(bytes(_symbol).length > 0, "Token symbol cannot be empty");
        
        // 添加代币支持配置
        supportedTokens[_token] = TokenConfig({
            isSupported: true,
            priceFeed: _priceFeed,
            symbol: _symbol
        });
        
        // 触发代币添加事件
        emit QuoteTokenAdded(_token, _priceFeed, _symbol);
    }

    /**
     * @dev 创建新的拍卖合约
     * @param _nftAddress NFT合约地址
     * @param _tokenId 被拍卖的NFT tokenId
     * @param _duration 拍卖持续时间（秒）
     * @param _quoteToken 报价代币地址
     * @return 新创建的拍卖合约地址
     */
    function createAuction(
        address _nftAddress,
        uint256 _tokenId,
        uint256 _duration,
        address _quoteToken
    ) public virtual returns (address) {
        // 验证报价代币是否支持
        require(supportedTokens[_quoteToken].isSupported, "Quote token not supported");
        
        // 获取对应的价格预言机地址
        address priceFeed = supportedTokens[_quoteToken].priceFeed;
        require(priceFeed != address(0), "Price feed not configured for token");
        
        // 验证调用者拥有该NFT
        require(IERC721(_nftAddress).ownerOf(_tokenId) == msg.sender, "Not NFT owner");
        
        // 创建新的拍卖合约实例
        Auction newAuction = new Auction(
            msg.sender,                           // 卖家地址
            _nftAddress,                          // NFT合约地址
            _tokenId,                             // NFT tokenId
            _duration,                            // 拍卖持续时间
            _quoteToken,                          // 报价代币地址
            priceFeed,                            // 价格预言机地址
            factoryConfig.platformFeeRecipient    // 手续费接收地址
        );
        
        // 记录新拍卖合约地址
        address auctionAddress = address(newAuction);
        auctions.push(auctionAddress);
        
        // 更新统计信息
        factoryConfig.totalAuctionsCreated++;
        userStatistics[msg.sender].createdAuctions++;
        
        // 触发拍卖创建事件
        emit AuctionCreated(auctionAddress, msg.sender, _nftAddress, _tokenId, _quoteToken);
        
        return auctionAddress;
    }

     /**
     * @dev 获取所有拍卖合约地址
     * @return 拍卖地址数组
     */
    function getAllAuctions() public view returns (address[] memory) {
        return auctions;
    }

    /**
     * @dev 获取拍卖合约总数
     * @return 拍卖合约数量
     */
    function getAuctionsCount() public view returns (uint256) {
        return auctions.length;
    }

    /**
     * @dev 更新平台手续费接收地址
     * @param _newRecipient 新的手续费接收地址
     * @notice 只有合约所有者可以调用此函数
     */
    function updatePlatformFeeRecipient(address _newRecipient) public onlyOwner {
        require(_newRecipient != address(0), "Invalid recipient address");
        factoryConfig.platformFeeRecipient = _newRecipient;
        emit PlatformFeeRecipientUpdated(_newRecipient);
    }

     /**
     * @dev 更新用户交易统计信息
     * @param user 用户地址
     * @param amount 交易金额
     * @notice 内部调用，用于记录用户交易行为
     */
    function updateUserStats(address user, uint256 amount) public {
        // 更新用户统计信息
        userStatistics[user].tradingVolume += amount;
        userStatistics[user].tradingCount += 1;
        
        // 更新总交易量
        factoryConfig.totalTradingVolume += amount;
        
        // 触发统计更新事件
        emit UserStatsUpdated(
            user, 
            userStatistics[user].tradingVolume, 
            userStatistics[user].tradingCount,
            userStatistics[user].createdAuctions
        );
    }

     /**
     * @dev 获取用户统计信息
     * @param user 用户地址
     * @return 用户统计结构体
     */
    function getUserStats(address user) public view returns (UserStats memory) {
        return userStatistics[user];
    }

    /**
     * @dev 获取工厂统计信息
     * @return 工厂配置结构体
     */
    function getFactoryStats() public view returns (FactoryConfig memory) {
        return factoryConfig;
    }

    /**
     * @dev 计算指定金额的手续费
     * @param _amount 金额
     * @return 手续费金额
     * @notice 使用与拍卖合约相同的动态手续费计算逻辑
     */
    function calculateFeeForAmount(uint256 _amount) public pure returns (uint256) {
        // 使用与Auction合约相同的动态手续费计算逻辑
        if (_amount >= 1000 ether) {
            return _amount * 5 / 1000;  // 0.5%
        } else if (_amount >= 100 ether) {
            return _amount * 10 / 1000; // 1%
        } else if (_amount >= 10 ether) {
            return _amount * 25 / 1000; // 2.5%
        } else {
            return _amount * 50 / 1000; // 5%
        }
    }

     /**
     * @dev 获取合约版本信息
     * @return 版本字符串
     */
    function version() public pure virtual returns (string memory) {
        return "v1.1.0"; // 版本号更新，反映结构体重构
    }
}
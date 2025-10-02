// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// 导入基础工厂合约
import "./AuctionFactory.sol";

/**
 * @title AuctionFactoryV2
 * @dev 拍卖工厂合约的升级版本，增加用户交易统计和高级分析功能
 * @notice 在V1基础上添加了用户等级系统和高级统计功能
 */
contract AuctionFactoryV2 is AuctionFactory {
    // V2新增结构体
    struct UserLevelInfo {
        uint256 level;                    // 用户等级（1-5级）
        uint256 discountRate;             // 手续费折扣率（基于等级）
        uint256 lastLevelUpdate;          // 最后等级更新时间
    }

    struct AuctionStats {
        uint256 successfulAuctions;       // 成功拍卖数量
        uint256 totalBidsPlaced;          // 总出价次数
        uint256 averageBidAmount;         // 平均出价金额
    }

    // V2新增状态变量
    mapping(address => UserLevelInfo) public userLevels;          // 用户等级信息映射
    mapping(address => AuctionStats) public auctionStatistics;    // 拍卖统计信息映射
    uint256 public totalSuccessfulAuctions;                       // 总成功拍卖数量
    
    // V2新增事件
    event UserLevelUpdated(address indexed user, uint256 newLevel, uint256 discountRate);
    event AuctionSuccessful(address indexed auction, address indexed winner, uint256 amount);

    /**
     * @dev 更新用户等级信息
     * @param user 用户地址
     * @notice 根据用户交易行为自动计算和更新等级
     */
    function updateUserLevel(address user) public {
        UserStats memory stats = userStatistics[user];
        
        // 根据交易量和成功次数计算用户等级
        uint256 newLevel = _calculateUserLevel(stats.tradingVolume, stats.createdAuctions);
        uint256 discountRate = _calculateDiscountRate(newLevel);
        
        // 更新用户等级信息
        userLevels[user] = UserLevelInfo({
            level: newLevel,
            discountRate: discountRate,
            lastLevelUpdate: block.timestamp
        });
        
        // 触发等级更新事件
        emit UserLevelUpdated(user, newLevel, discountRate);
    }

    /**
     * @dev 记录成功拍卖
     * @param auctionAddress 拍卖合约地址
     * @param winner 获胜者地址
     * @param amount 成交金额
     * @notice 当拍卖成功结束时调用
     */
    function recordSuccessfulAuction(address auctionAddress, address winner, uint256 amount) public {
        // 更新拍卖统计
        auctionStatistics[auctionAddress].successfulAuctions++;
        totalSuccessfulAuctions++;
        
        // 更新用户统计
        userStatistics[winner].tradingCount++;
        userStatistics[winner].tradingVolume += amount;
        
        // 更新用户等级
        updateUserLevel(winner);
        
        // 触发成功拍卖事件
        emit AuctionSuccessful(auctionAddress, winner, amount);
    }

    /**
     * @dev 获取用户完整信息（包括等级）
     * @param user 用户地址
     * @return stats 用户统计信息
     * @return levelInfo 用户等级信息
     */
    function getUserFullInfo(address user) public view returns (
        UserStats memory stats,
        UserLevelInfo memory levelInfo
    ) {
        return (
            userStatistics[user],
            userLevels[user]
        );
    }

    /**
     * @dev 获取平台完整统计信息
     * @return config 工厂配置
     * @return totalSuccessful 总成功拍卖数
     * @return successRate 成功率（百分比）
     */
    function getPlatformStats() public view returns (
        FactoryConfig memory config,
        uint256 totalSuccessful,
        uint256 successRate
    ) {
        uint256 rate = 0;
        if (factoryConfig.totalAuctionsCreated > 0) {
            rate = (totalSuccessfulAuctions * 100) / factoryConfig.totalAuctionsCreated;
        }
        
        return (
            factoryConfig,
            totalSuccessfulAuctions,
            rate
        );
    }

    /**
     * @dev 重写创建拍卖函数，增加统计功能
     * @param _nftAddress NFT合约地址
     * @param _tokenId 被拍卖的NFT tokenId
     * @param _duration 拍卖持续时间
     * @param _quoteToken 报价代币地址
     * @return 新创建的拍卖合约地址
     */
    function createAuction(
        address _nftAddress,
        uint256 _tokenId,
        uint256 _duration,
        address _quoteToken
    ) public override returns (address) {
        // 调用父合约的创建拍卖函数
        address auctionAddress = super.createAuction(_nftAddress, _tokenId, _duration, _quoteToken);
        
        // V2新增：初始化拍卖统计
        auctionStatistics[auctionAddress] = AuctionStats({
            successfulAuctions: 0,
            totalBidsPlaced: 0,
            averageBidAmount: 0
        });
        
        return auctionAddress;
    }

    /**
     * @dev 内部函数：计算用户等级
     * @param volume 用户交易量
     * @param createdAuctions 用户创建的拍卖数量
     * @return 用户等级（1-5级）
     */
    function _calculateUserLevel(uint256 volume, uint256 createdAuctions) internal pure returns (uint256) {
        // 根据交易量和创建拍卖数量计算等级
        if (volume >= 1000 ether && createdAuctions >= 10) return 5;
        if (volume >= 500 ether && createdAuctions >= 5) return 4;
        if (volume >= 100 ether && createdAuctions >= 3) return 3;
        if (volume >= 10 ether && createdAuctions >= 1) return 2;
        return 1; // 默认等级
    }

    /**
     * @dev 内部函数：根据等级计算折扣率
     * @param level 用户等级
     * @return 折扣率（百分比，例如10表示10%折扣）
     */
    function _calculateDiscountRate(uint256 level) internal pure returns (uint256) {
        // 等级越高，手续费折扣越大
        if (level == 5) return 20; // 20% discount
        if (level == 4) return 15; // 15% discount
        if (level == 3) return 10; // 10% discount
        if (level == 2) return 5;  // 5% discount
        return 0;                  // 0% discount for level 1
    }

    /**
     * @dev 获取用户等级和折扣信息
     * @param user 用户地址
     * @return level 用户等级
     * @return discountRate 折扣率
     */
    function getUserLevelAndDiscount(address user) public view returns (uint256 level, uint256 discountRate) {
        UserLevelInfo memory info = userLevels[user];
        return (info.level, info.discountRate);
    }

    /**
     * @dev 获取合约版本信息（重写）
     * @return 版本字符串
     */
    function version() public pure override returns (string memory) {
        return "v2.0.0";
    }
}
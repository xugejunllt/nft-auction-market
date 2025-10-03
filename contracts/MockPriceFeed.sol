// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title MockPriceFeed
 * @dev 模拟Chainlink价格预言机合约
 * @notice 用于本地测试，返回固定的价格数据
 */
contract MockPriceFeed {
    // 价格数据结构体
    struct RoundData {
        uint80 roundId;
        int256 answer;
        uint256 startedAt;
        uint256 timeStamp;
        uint80 answeredInRound;
    }

    // 固定价格
    int256 public immutable price;
    uint8 public immutable decimals;

    constructor(int256 _price, uint8 _decimals) {
        price = _price;
        decimals = _decimals;
    }

    // 获取最新价格
    function latestRoundData() external view returns (
        uint80 roundId,
        int256 answer,
        uint256 startedAt,
        uint256 timeStamp,
        uint80 answeredInRound
    ) {
        return (
            1,
            price,
            block.timestamp - 100,
            block.timestamp,
            1
        );
    }

    // 获取小数位数
    function getDecimals() external view returns (uint8) {
        return decimals;
    }
}
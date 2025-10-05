// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@chainlink/contracts-ccip/contracts/interfaces/IRouterClient.sol";
import "@chainlink/contracts-ccip/contracts/libraries/Client.sol";
import "./Auction.sol";

/**
 * @title CrossChainAuction
 * @dev 支持跨链拍卖的合约
 * @notice 使用Chainlink CCIP实现跨链出价功能
 */
contract CrossChainAuction {
    using Client for Client.EVM2AnyMessage;
    
    // CCIP Router地址
    IRouterClient public immutable router;
    
    // 链选择器映射
    mapping(uint64 => bool) public supportedChains;
    
    // 跨链出价记录
    mapping(bytes32 => CrossChainBid) public crossChainBids;
    
    /**
     * @dev 跨链出价事件, 当出价被提交时触发
     * @param messageId 跨链消息ID
     * @param sourceChainSelector 源链选择器
     * @param bidder 出价者地址
     * @param amount 出价金额
     * @param quoteToken 报价代币地址
     */
    event CrossChainBidPlaced(
        bytes32 indexed messageId,
        uint64 indexed sourceChainSelector,
        address indexed bidder,
        uint256 amount,
        address quoteToken
    );
    
    /**
     * @dev 跨链出价处理事件, 当跨链出价被处理时触发
     * @param messageId 跨链消息ID
     * @param destinationChainSelector 目标链选择器
     * @param bidder 出价者地址
     * @param success 是否处理成功
     */
    event CrossChainBidProcessed(
        bytes32 indexed messageId,
        uint64 indexed destinationChainSelector,
        address indexed bidder,
        bool success
    );

    /**
     * @dev 跨链出价结构体
     * @param sourceChainSelector 源链选择器
     * @param bidder 出价者地址
     * @param amount 出价金额
     * @param quoteToken 报价代币地址
     * @param processed 是否处理成功
     */
    struct CrossChainBid {
        uint64 sourceChainSelector;
        address bidder;
        uint256 amount;
        address quoteToken;
        bool processed;
    }

    /**
     * @dev 仅支持的链修饰符
     * @param chainSelector 链选择器
     */
    modifier onlySupportedChain(uint64 chainSelector) {
        require(supportedChains[chainSelector], "Chain not supported");
        _;
    }

    // @dev 构造函数, 初始化CCIP Router地址
    // @param _router CCIP Router合约地址
    constructor(address _router) {
        require(_router != address(0), "Invalid router address");
        router = IRouterClient(_router);
    }

    /**
     * @dev 添加支持的链
     */
    function addSupportedChain(uint64 chainSelector) public {
        supportedChains[chainSelector] = true;
    }

    /**
     * @dev 跨链出价函数
     */
    function crossChainBid(
        uint64 _destinationChainSelector,
        address _targetAuction,
        uint256 _amount,
        address _quoteToken
    ) public payable onlySupportedChain(_destinationChainSelector) returns (bytes32 messageId) {
        // 构建CCIP消息
        Client.EVM2AnyMessage memory message = Client.EVM2AnyMessage({
            receiver: abi.encode(_targetAuction),
            data: abi.encodeWithSignature(
                "processCrossChainBid(uint64,address,uint256,address)",
                _destinationChainSelector,
                msg.sender,
                _amount,
                _quoteToken
            ),
            tokenAmounts: new Client.EVMTokenAmount[](0),
            extraArgs: Client._argsToBytes(Client.EVMExtraArgsV1({gasLimit: 200_000})),
            feeToken: address(0) // 使用原生代币支付费用
        });

        // 计算费用
        uint256 fees = router.getFee(_destinationChainSelector, message);
        require(msg.value >= fees, "Insufficient fee");

        // 发送CCIP消息
        messageId = router.ccipSend{value: fees}(
            _destinationChainSelector,
            message
        );

        // 记录跨链出价
        crossChainBids[messageId] = CrossChainBid({
            sourceChainSelector: _destinationChainSelector,
            bidder: msg.sender,
            amount: _amount,
            quoteToken: _quoteToken,
            processed: false
        });

        emit CrossChainBidPlaced(
            messageId,
            _destinationChainSelector,
            msg.sender,
            _amount,
            _quoteToken
        );
    }

    /**
     * @dev 处理跨链出价（在目标链上执行）
     */
    function processCrossChainBid(
        uint64 _sourceChainSelector,
        address _bidder,
        uint256 _amount,
        address _quoteToken
    ) public returns (bool) {
        // 验证调用者（应该只有CCIP Router可以调用）
        // 在实际应用中需要添加更严格的身份验证
        
        // 这里调用原始拍卖合约的出价逻辑
        // 需要根据你的实际拍卖合约进行调整
        try IAuction(msg.sender).bid(_amount, _quoteToken) {
            emit CrossChainBidProcessed(
                bytes32(0), // 需要从CCIP获取实际的messageId
                _sourceChainSelector,
                _bidder,
                true
            );
            return true;
        } catch {
            emit CrossChainBidProcessed(
                bytes32(0),
                _sourceChainSelector,
                _bidder,
                false
            );
            return false;
        }
    }
}
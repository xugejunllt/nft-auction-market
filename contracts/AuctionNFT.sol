// SPDX-License-Identifier: MIT 
pragma solidity ^0.8.20;
import "@openzeppelin/contracts/access/Ownable.sol"; 
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "../contracts/Counters.sol";

contract MyNFT is ERC721URIStorage, Ownable {
    using Counters for Counters.Counter;  // 使用计数器来管理tokenId
    Counters.Counter private _tokenIdCounter;

    /**
     * @dev 构造函数，初始化NFT名称和符号
     */
    constructor() ERC721("MyNFT", "MNFT") Ownable(msg.sender){
        // 合约部署时自动执行，设置NFT名称为"MyNFT"，符号为"MNFT"
        // 并设置部署者为初始所有者
    }

     /**
     * @dev 铸造新的NFT
     * @param to NFT接收者的地址
     * @notice 只有合约所有者可以调用此函数
     */
    function mint(address to) public onlyOwner {
        // 获取当前tokenId并递增计数器
        uint256 tokenId = _tokenIdCounter.current();
        _tokenIdCounter.increment();
        
        // 铸造NFT给指定地址
        _mint(to, tokenId);
    }

    /**
     * @dev 获取当前已铸造的NFT数量
     * @return 当前tokenId计数器的值
     */
    function currentTokenId() public view returns (uint256) {
        return _tokenIdCounter.current();
    }

    /**
     * @dev 批量铸造NFT
     * @param to NFT接收者的地址
     * @param amount 要铸造的NFT数量
     * @notice 只有合约所有者可以调用此函数
     */
    function mintBatch(address to, uint256 amount) public onlyOwner {
        // 循环铸造指定数量的NFT
        for (uint256 i = 0; i < amount; i++) {
            mint(to);
        }
    }
}
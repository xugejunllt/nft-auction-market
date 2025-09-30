// SPDX-License-Identifier: MIT 
pragma solidity ^0.8.20;
import "@openzeppelin/contracts/access/Ownable.sol"; 
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "../contracts/Counters.sol";

contract MyNFT is ERC721URIStorage, Ownable {
    using Counters for Counters.Counter;
    Counters.Counter private _tokenIds;

    constructor(string memory name, string memory symbol, address initialOwner) 
        ERC721(name, symbol) 
        Ownable(initialOwner) 
    {
        _tokenIds.reset(); // 初始化计数器
    }

    function mintNFT(address to, string memory tokenURI) public onlyOwner {
        _tokenIds.increment(); // 增加计数器

        uint tokenId = _tokenIds._value;
        _safeMint(to, tokenId); // 铸造NFT并分配给地址to
        _setTokenURI(tokenId, tokenURI); // 设置NFT的元数据URI
    }

    function currentTokenId() public view returns (uint256) {
        return _tokenIds.current();
    }
}
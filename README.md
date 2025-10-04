# 1. 安装依赖
npm install

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env 文件，填入你的私钥和API密钥

# 3. 编译合约
npx hardhat compile

# 4. 运行测试
npx hardhat test

# 41. 部署到本地
npx hardhat run scripts/deploy-mock-erc20.js --network localhost
npx hardhat run scripts/deploy-mock-price-feed.js --network localhost


# 5. 部署到测试网
npx hardhat run scripts/deploy.js --network sepolia

# 6. 验证合约
npx hardhat run scripts/verify.js --network sepolia

# 7. 升级合约（可选）
npx hardhat run scripts/upgrade.js --network sepolia
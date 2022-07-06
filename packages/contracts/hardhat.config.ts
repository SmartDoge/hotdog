import "@nomiclabs/hardhat-ethers";
import "@nomiclabs/hardhat-waffle";
import "@typechain/hardhat";
import dotenv from "dotenv";
import "hardhat-gas-reporter";
import { HardhatUserConfig, task } from "hardhat/config";
import "solidity-coverage";

dotenv.config();

// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task("accounts", "Prints the list of accounts", async (_, hre) => {
    const accounts = await hre.ethers.getSigners();
    for (const account of accounts) {
        console.log(account.address);
    }
});

const config: HardhatUserConfig = {
    solidity: "0.8.4",
    gasReporter: {
        enabled: true
    },
    networks: {
        hardhat: {},
        testnet: {
            url: "https://testnet-1.smartdoge.com",
            chainId: 42069,
            accounts: [process.env.TESTNET_PRIVATE_KEY as string]
        }
    },
    paths: {
        sources: "./src"
    }
};

export default config;

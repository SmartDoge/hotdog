import { ethers } from "hardhat";

async function main() {
    const TestERC20 = await ethers.getContractFactory("TestERC20");
    const testERC20 = await TestERC20.deploy("0x9Fbed5Ec4DcD2bFa1Dd5f1bFa37B2ACFEC3FA650", 1_000_000);
    console.log(`TestERC20 deployed to ${testERC20.address}`);

    const SmartDogeBurnPile = await ethers.getContractFactory("SmartDogeBurnPile");
    const smartDogeBurnPile = await SmartDogeBurnPile.deploy(
        100, // ~5 minute rounds
        8640, // ~30 days
        10,
        testERC20.address,
        50,
        "0x9Fbed5Ec4DcD2bFa1Dd5f1bFa37B2ACFEC3FA650",
    );
    console.log(`SmartDogeBurnPile deployed to ${smartDogeBurnPile.address}`);
}

main();
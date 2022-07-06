import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai, { expect } from "chai";
import { solidity } from "ethereum-waffle";
import { ContractTransaction } from "ethers";
import hre, { ethers } from "hardhat";
import { SmartDogeBurnPile, TestERC20 } from "../typechain";

chai.use(solidity);

const mineBlocks = async (count: number) => {
    await hre.network.provider.send("hardhat_mine", [`0x${count.toString(16)}`]);
}

const getLatestBlock = async () => {
    return await hre.ethers.provider.getBlock("latest");
}

describe("SmartDogeBurnPile", () => {
    const erc20Amount = 1000;
    const roundCount = 10;
    const roundLengthBlocks = 100;
    const roundRefundCap = 10;
    const fundPercent = 50;

    let owner: SignerWithAddress;
    let fund: SignerWithAddress;
    let users: SignerWithAddress[];
    let testERC20: TestERC20;
    let smartDogeBurnPile: SmartDogeBurnPile;

    const deployContracts = async () => {
        const SmartDogeBurnPile = await ethers.getContractFactory("SmartDogeBurnPile", owner);
        const TestERC20 = await ethers.getContractFactory("TestERC20", owner);

        testERC20 = await TestERC20.deploy(owner.address, erc20Amount);
        await testERC20.deployed();

        smartDogeBurnPile = await SmartDogeBurnPile.deploy(
            roundLengthBlocks,
            roundCount,
            roundRefundCap,
            testERC20.address,
            fundPercent,
            fund.address
        );
        await smartDogeBurnPile.deployed();
    }

    async function burn(...userAmounts: number[]) {
        const transactions: ContractTransaction[] = [];
        for (let i = 0; i < userAmounts.length; i++) {
            const user = users[i];
            const amount = userAmounts[i];
            await testERC20.connect(owner).transfer(user.address, amount);
            await testERC20.connect(user).approve(smartDogeBurnPile.address, amount);
            const transaction = await smartDogeBurnPile.connect(user).burn(amount);
            transactions.push(transaction);
        }

        return transactions;
    }

    async function refund(userIndex = 0) {
        return await smartDogeBurnPile.connect(users[userIndex]).refund();
    }

    async function getUserBalance(userIndex = 0) {
        return getAccountBalance(users[userIndex]);
    }

    async function getAccountBalance(account: SignerWithAddress) {
        return await testERC20.connect(account).balanceOf(account.address);
    }

    beforeEach(async () => {
        const addresses = await ethers.getSigners();
        owner = addresses[0];
        fund = addresses[1];
        users = addresses.slice(2);
        await deployContracts();
    });

    describe("burn", () => {
        it("accepts funds below the refund cap", async () => {
            const amount = roundRefundCap / 2;
            await burn(amount);
        });

        it("accepts funds beyond the refund cap", async () => {
            const amount = roundRefundCap * 2;
            await burn(amount);
        });

        it("accepts funds from multiple users beyond the refund cap", async () => {
            const amount = roundRefundCap / 2;
            await burn(amount, amount, amount);
        });

        it("does not accept funds after the burn", async () => {
            const amount = roundRefundCap;
            await burn(amount);
            mineBlocks(roundLengthBlocks * roundCount);
            await expect(burn(amount)).to.be.revertedWith("The Great Doge Burn has ended.");
        })
    });

    describe("refund", () => {
        it("doesn't issue a refund for a round in progress", async () => {
            await burn(roundRefundCap * 2);
            const preRefundBalance = await getUserBalance();
            await refund();
            const postRefundBalance = await getUserBalance();
            expect(postRefundBalance).to.equal(preRefundBalance);
        });

        it("issues the corect refund for a completed round when eligible", async () => {
            await burn(roundRefundCap * 2);
            const preRefundBalance = await getUserBalance();

            await mineBlocks(roundLengthBlocks);

            await refund();
            const postRefundBalance = await getUserBalance();
            expect(postRefundBalance).to.equal(preRefundBalance.add(roundRefundCap));
        });

        it("issues the correct refund for a completed round after several empty rounds when eligible", async () => {
            await burn(roundRefundCap * 2);
            const preRefundBalance = await getUserBalance();

            await mineBlocks(roundLengthBlocks * 4);

            await refund();
            const postRefundBalance = await getUserBalance();
            expect(postRefundBalance).to.equal(preRefundBalance.add(roundRefundCap));
        });

        it("issues full refunds to multiple participants when the amount is below the refund threshold", async () => {
            const amounts = [roundRefundCap / 10, roundRefundCap / 2, roundRefundCap / 10, roundRefundCap / 5];
            await burn(...amounts);
            await mineBlocks(roundLengthBlocks * 5);

            for (let i = 0; i < 4; i++) {
                const preRefundBalance = await getUserBalance(i);
                expect(preRefundBalance).to.equal(0);

                await refund(i);
                const postRefundBalance = await getUserBalance(i);
                expect(postRefundBalance).to.equal(amounts[i]);
            }
        });

        it("issues proportional refunds to multiple participants when the amount is above the refund threshold", async () => {
            const amounts = [roundRefundCap * 4, roundRefundCap / 2, roundRefundCap / 10, roundRefundCap * 2, roundRefundCap];
            const totalAmount = amounts.reduce((r, x) => x + r);
            const expectedRefunds = amounts.map(x => Math.floor((x / totalAmount) * roundRefundCap));

            await burn(...amounts);
            await mineBlocks(roundLengthBlocks);

            for (let i = 0; i < 4; i++) {
                const preRefundBalance = await getUserBalance(i);
                expect(preRefundBalance).to.equal(0);

                await refund(i);
                const postRefundBalance = await getUserBalance(i);
                expect(postRefundBalance).to.equal(expectedRefunds[i]);
            }
        });

        it("issues refunds after the end of the burn", async () => {
            const amount = roundRefundCap * 10;

            await burn(amount);
            let balance = await getUserBalance();
            expect(balance).to.equal(0);

            await mineBlocks(roundCount * roundLengthBlocks);
            await refund();
            balance = await getUserBalance();
            expect(balance).to.equal(roundRefundCap);
        });

        it("issues refunds for previous unrefunded rounds", async () => {
            const amount = roundRefundCap * 10;
            const burnCount = 3;
            for (let i = 0; i < burnCount; i++) {
                await burn(amount);
                await mineBlocks(roundLengthBlocks * 2)
            }

            let balance = await getUserBalance();
            expect(balance).to.equal(0);
            await refund();
            balance = await getUserBalance();
            expect(balance).to.equal(roundRefundCap * burnCount);
        });

        it("doesn't issue a refund when multiple requests are made without burning additional funds", async () => {
            await burn(roundRefundCap);
            expect(await getUserBalance()).to.equal(0);

            await mineBlocks(roundLengthBlocks);
            await refund();
            expect(await getUserBalance()).to.equal(roundRefundCap);

            await refund();
            expect(await getUserBalance()).to.equal(roundRefundCap);

            mineBlocks(roundLengthBlocks);
            await refund();
            expect(await getUserBalance()).to.equal(roundRefundCap);

            mineBlocks(roundLengthBlocks * 3);
            await refund();
            expect(await getUserBalance()).to.equal(roundRefundCap);
        });
    });

    describe("fund", () => {
        it("sends half of nonrefundable tokens to the fund address when the amount exceeds the cap", async () => {
            const amount = roundRefundCap * 3;
            const nonrefundableAmount = amount - roundRefundCap;
            const fundAmount = Math.floor(nonrefundableAmount / 2);

            await burn(amount);
            expect(await getAccountBalance(fund)).to.equal(fundAmount);
        });

        it("sends half of nonrefundable tokens to the fund address when the amount exceeds the cap and is burned by multiple users", async () => {
            const amounts = [roundRefundCap, roundRefundCap * 2, roundRefundCap / 2, roundRefundCap];
            const nonrefundableAmount = amounts.reduce((p, x) => x + p) - roundRefundCap;
            const fundAmount = Math.floor(nonrefundableAmount / 2);

            await burn(roundRefundCap, roundRefundCap * 2, roundRefundCap / 2, roundRefundCap);
            expect(await getAccountBalance(fund)).to.equal(fundAmount);
        });

        it("sends no tokens to the fund address when the amount is less than or equal to the cap", async () => {
            await burn(roundRefundCap);
            expect(await getAccountBalance(fund)).to.equal(0);

            await mineBlocks(roundLengthBlocks);
            await burn(roundRefundCap / 2);
            expect(await getAccountBalance(fund)).to.equal(0);

            await mineBlocks(roundLengthBlocks * 2);
            await refund();
            expect(await getAccountBalance(fund)).to.equal(0);
        });
    });

    describe("events", () => {
        it("emits a burn event when a burn occurs", async () => {
            const amount = roundRefundCap * 2;
            let burnTx = await burn(amount);
            expect(burnTx[0]).to.emit(smartDogeBurnPile, "Burn").withArgs(users[0].address, amount, roundRefundCap, 0);

            await mineBlocks(roundLengthBlocks)
            burnTx = await burn(amount);
            expect(burnTx[0]).to.emit(smartDogeBurnPile, "Burn").withArgs(users[0].address, amount, roundRefundCap, 1);
        });

        it("emits a refund event when a single-round refund occurs", async () => {
            const amount = roundRefundCap * 2;
            await burn(amount);
            await mineBlocks(roundLengthBlocks);
            expect(await refund()).to.emit(smartDogeBurnPile, "Refund").withArgs(users[0].address, roundRefundCap);
        });

        it("emits a refund event when a multi-round refund occurs", async () => {
            const amount = roundRefundCap * 2;
            const burnCount = 3;
            for (let i = 0; i < burnCount; i++) {
                await burn(amount);
                await mineBlocks(roundLengthBlocks * (i + 1));
            }

            expect(await refund()).to.emit(smartDogeBurnPile, "Refund").withArgs(users[0].address, roundRefundCap * burnCount);
        });

        it("does not emit a refund event when a refund is requested but no funds are refunded", async () => {
            const amount = roundRefundCap;
            await burn(amount);
            await mineBlocks(roundLengthBlocks);
            await refund();
            expect(await refund()).not.to.emit(smartDogeBurnPile, "Refund");
            await mineBlocks(roundLengthBlocks);
            expect(await refund()).not.to.emit(smartDogeBurnPile, "Refund");
        });
    });

    describe("update refund cap", () => {
        it("succeeds when called from the owner account", async () => {
            await smartDogeBurnPile.connect(owner).updateRefundCap(1000000);
        });

        it("fails when called from a non-owner account", async () => {
            await expect(smartDogeBurnPile.connect(users[0]).updateRefundCap(1000000)).to.be.revertedWith("Ownable: caller is not the owner");
        });

        it("updates the refund cap for future rounds only", async () => {
            const updatedRefundCap = 1;
            const amount = roundRefundCap;

            // Standard cap
            await burn(amount);
            await mineBlocks(roundLengthBlocks);

            // Standard cap
            await burn(amount * 2);
            await mineBlocks(roundLengthBlocks);

            // Standard cap - updated goes into effect next round
            await smartDogeBurnPile.connect(owner).updateRefundCap(updatedRefundCap);
            await burn(amount * 2);
            await burn(amount * 2);
            await mineBlocks(roundLengthBlocks);

            // Updated cap
            await burn(amount);
            await mineBlocks(roundLengthBlocks);

            await refund();
            const balance = await getUserBalance();
            expect(balance).to.equal((3 * roundRefundCap) + updatedRefundCap);
        });
    })
})
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "hardhat/console.sol";

contract SmartDogeBurnPile is Ownable {
    struct Round {
        uint refundCap;
        uint total;
        mapping(address => uint) amounts;
    }

    event Burn(address indexed from, uint amount, uint refundableAmount, uint round);
    event Refund(address indexed from, uint amount);

    address private constant burnAddress = address(0x0);
    uint private roundLengthBlocks;
    ERC20 private token;
    uint private fundPercent;
    address private fundAddress;
    uint private genesisBlockNumber;
    Round[] private rounds;
    mapping(address => uint) userRefunds;

    constructor(
        uint _roundLengthBlocks,
        uint roundCount,
        uint roundRefundCap,
        address _token,
        uint _fundPercent,
        address _fundAddress
    ) {
        require(_fundPercent <= 100, "_fundPercent must be between 0 and 100 inclusive");

        roundLengthBlocks = _roundLengthBlocks;
        token = ERC20(_token);
        fundPercent = _fundPercent;
        fundAddress = _fundAddress;
        genesisBlockNumber = block.number;

        for (uint i = 0; i < roundCount; i++) {
            Round storage round = rounds.push();
            round.refundCap = roundRefundCap;
        }
    }

    function updateRefundCap(uint refundCap) external onlyOwner {
        uint roundIndex = getCurrentRoundIndex();
        require(roundIndex < rounds.length, "The Great Doge Burn has ended.");

        for (uint i = roundIndex + 1; i < rounds.length; i++) {
            Round storage round = rounds[i];
            round.refundCap = refundCap;
        }
    }

    function burn(uint amount) external {
        require(amount > 0, "amount must be positive");

        uint roundIndex = getCurrentRoundIndex();
        require(roundIndex < rounds.length, "The Great Doge Burn has ended.");
        Round storage round = rounds[roundIndex];

        uint remainingRefundableCapacity = 0;
        if (round.total < round.refundCap) {
            remainingRefundableCapacity = round.refundCap - round.total;
        }

        uint refundableAmount = remainingRefundableCapacity < amount ? remainingRefundableCapacity : amount;
        uint refundableSurplus = amount - refundableAmount;
        uint fundAmount = 0;
        uint burnAmount = 0;
        if (refundableSurplus > 0) {
            fundAmount = (refundableSurplus * fundPercent) / 100;
            burnAmount = refundableSurplus - fundAmount;
        }

        transferToSelf(refundableAmount + burnAmount);
        transferToFund(fundAmount);

        round.total += amount;
        round.amounts[msg.sender] += amount;

        emit Burn(msg.sender, amount, refundableAmount, roundIndex);
    }

    function refund() external {
        uint latestRoundIndex = getCurrentRoundIndex();
        latestRoundIndex = latestRoundIndex < rounds.length ? latestRoundIndex : rounds.length - 1;

        uint totalRefundAmount = 0;
        for (uint i = 0; i < latestRoundIndex; i++) {
            Round storage round = rounds[i];
            uint senderAmount = round.amounts[msg.sender];
            if (senderAmount != 0) {
                uint roundRefundPool = round.total < round.refundCap ? round.total : round.refundCap;
                uint roundRefundAmount = (roundRefundPool * senderAmount) / round.total;
                totalRefundAmount += roundRefundAmount;
            }
        }

        uint refundAmount = totalRefundAmount - userRefunds[msg.sender];
        if (refundAmount > 0) {
            userRefunds[msg.sender] = totalRefundAmount;
            token.transfer(msg.sender, refundAmount);
            emit Refund(msg.sender, refundAmount);
        }
    }

    function getCurrentRoundIndex() private view returns (uint) {
        return (block.number - genesisBlockNumber) / roundLengthBlocks;
    }

    function transferToSelf(uint amount) private {
        transferToken(msg.sender, address(this), amount);
    }

    function transferToFund(uint amount) private {
        transferToken(msg.sender, fundAddress, amount);
    }

    function transferToken(
        address from,
        address to,
        uint amount
    ) private {
        if (amount != 0) {
            token.transferFrom(from, to, amount);
        }
    }
}

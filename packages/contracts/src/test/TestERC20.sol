// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract TestERC20 is ERC20 {
    constructor(address holder, uint amount) ERC20("Test ERC20", "TEST") {
        _mint(holder, amount);
    }
}

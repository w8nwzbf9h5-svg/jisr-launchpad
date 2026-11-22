// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// Test-only token with a chosen name, symbol and number of decimals. Anyone can mint.
/// Stands in for a stablecoin (mUSD) or for a tokenized stock (mTSLA) in tests and on testnets.
contract MockStable is ERC20 {
    uint8 private immutable _dec;

    constructor(string memory name_, string memory symbol_, uint8 dec) ERC20(name_, symbol_) {
        _dec = dec;
    }

    function decimals() public view override returns (uint8) {
        return _dec;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

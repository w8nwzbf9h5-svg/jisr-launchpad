// SPDX-License-Identifier: UNLICENSED
// Copyright (c) 2026 Jisr Launchpad. All rights reserved. See the LICENSE file.
pragma solidity 0.8.26;

import {ERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";

/// @title Coin
/// @notice Fixed-supply launchpad coin. The whole supply is minted once to its market.
///         There is no owner, no further minting, no pause, no blacklist and no fee switch.
///         One wallet can hold at most 2.5% of supply; the market is the only exception.
/// @dev Deployed as an EIP-1167 minimal proxy of one template. A minimal proxy cannot be upgraded.
contract Coin is ERC20Upgradeable {
    uint256 public constant TOTAL_SUPPLY = 1_000_000_000e18;
    uint256 public constant MAX_WALLET = 25_000_000e18; // 2.5% of supply

    address public market;
    string public metadataURI;

    error WalletLimit();

    constructor() {
        _disableInitializers();
    }

    function initialize(
        string calldata name_,
        string calldata symbol_,
        string calldata metadataURI_,
        address market_
    ) external initializer {
        __ERC20_init(name_, symbol_);
        market = market_;
        metadataURI = metadataURI_;
        _mint(market_, TOTAL_SUPPLY);
    }

    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);
        if (to != market && to != address(0) && balanceOf(to) > MAX_WALLET) revert WalletLimit();
    }
}

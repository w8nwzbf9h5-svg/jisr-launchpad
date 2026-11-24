// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {MockStable} from "./MockStable.sol";

/// Test-only stablecoin that can misbehave towards chosen receivers, to check that a fee payout
/// which cannot be made never stops a trade.
///   quirk 1: a transfer to the receiver reverts (what an issuer's block list does)
///   quirk 2: `transfer` to the receiver moves nothing and returns false
///   quirk 3: a transfer to the receiver burns all the gas it is given
/// With `silent` on, `transfer` succeeds but returns no data at all, as USDT does on Ethereum.
contract MockOddStable is MockStable {
    mapping(address => uint8) public quirk;
    bool public silent;

    error ReceiverBlocked();

    constructor(string memory name_, string memory symbol_, uint8 dec) MockStable(name_, symbol_, dec) {}

    function setQuirk(address who, uint8 kind) external {
        quirk[who] = kind;
    }

    function setSilent(bool on) external {
        silent = on;
    }

    function transfer(address to, uint256 amount) public override returns (bool) {
        uint8 kind = quirk[to];
        if (kind == 2) return false;
        if (kind == 3) {
            while (true) {}
        }
        bool ok = super.transfer(to, amount);
        if (silent) {
            assembly {
                return(0, 0)
            }
        }
        return ok;
    }

    function _update(address from, address to, uint256 amount) internal override {
        if (quirk[to] == 1) revert ReceiverBlocked();
        super._update(from, to, amount);
    }
}

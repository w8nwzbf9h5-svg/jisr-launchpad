// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// Test stand-in for Circle's TokenMessengerV2: takes the tokens and records what it was asked to do.
contract MockMessenger {
    struct Burn {
        address from;
        uint256 amount;
        uint32 destinationDomain;
        bytes32 mintRecipient;
        address burnToken;
        bytes32 destinationCaller;
        uint256 maxFee;
        uint32 minFinalityThreshold;
        bytes hookData;
        bool withHook;
    }

    Burn[] public burns;

    function count() external view returns (uint256) {
        return burns.length;
    }

    function depositForBurn(uint256 amount, uint32 domain, bytes32 recipient, address token, bytes32 caller, uint256 maxFee, uint32 threshold) external {
        _burn(amount, domain, recipient, token, caller, maxFee, threshold, "", false);
    }

    function depositForBurnWithHook(uint256 amount, uint32 domain, bytes32 recipient, address token, bytes32 caller, uint256 maxFee, uint32 threshold, bytes calldata hookData) external {
        _burn(amount, domain, recipient, token, caller, maxFee, threshold, hookData, true);
    }

    function _burn(uint256 amount, uint32 domain, bytes32 recipient, address token, bytes32 caller, uint256 maxFee, uint32 threshold, bytes memory hookData, bool withHook) private {
        require(amount > 0 && maxFee < amount, "bad amount");
        require(IERC20(token).transferFrom(msg.sender, address(this), amount), "pull failed");
        burns.push(Burn(msg.sender, amount, domain, recipient, token, caller, maxFee, threshold, hookData, withHook));
    }
}

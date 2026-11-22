// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IMintable {
    function mint(address to, uint256 amount) external;
}

/// Test-only stand-in for a Uniswap V2 style router. Swaps at one fixed rate.
contract MockRouter {
    address public immutable WETH;
    address public immutable stable;
    uint256 public immutable stablePerNative; // stable base units per 1e18 native

    constructor(address weth_, address stable_, uint256 stablePerNative_) {
        WETH = weth_;
        stable = stable_;
        stablePerNative = stablePerNative_;
    }

    receive() external payable {}

    function getAmountsIn(uint256 amountOut, address[] calldata path) external view returns (uint256[] memory amounts) {
        amounts = new uint256[](2);
        if (path[0] == WETH) {
            amounts[0] = (amountOut * 1e18 + stablePerNative - 1) / stablePerNative;
        } else {
            amounts[0] = (amountOut * stablePerNative + 1e18 - 1) / 1e18;
        }
        amounts[1] = amountOut;
    }

    function getAmountsOut(uint256 amountIn, address[] calldata path) external view returns (uint256[] memory amounts) {
        amounts = new uint256[](2);
        amounts[0] = amountIn;
        amounts[1] = path[0] == WETH ? (amountIn * stablePerNative) / 1e18 : (amountIn * 1e18) / stablePerNative;
    }

    function swapETHForExactTokens(uint256 amountOut, address[] calldata path, address to, uint256 deadline)
        external
        payable
        returns (uint256[] memory amounts)
    {
        require(block.timestamp <= deadline, "EXPIRED");
        require(path.length == 2 && path[0] == WETH && path[1] == stable, "PATH");
        uint256 need = (amountOut * 1e18 + stablePerNative - 1) / stablePerNative;
        require(msg.value >= need, "EXCESSIVE_INPUT_AMOUNT");
        IMintable(stable).mint(to, amountOut);
        if (msg.value > need) {
            (bool ok,) = msg.sender.call{value: msg.value - need}("");
            require(ok, "REFUND");
        }
        amounts = new uint256[](2);
        amounts[0] = need;
        amounts[1] = amountOut;
    }

    function swapExactTokensForETH(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts) {
        require(block.timestamp <= deadline, "EXPIRED");
        require(path.length == 2 && path[0] == stable && path[1] == WETH, "PATH");
        IERC20(stable).transferFrom(msg.sender, address(this), amountIn);
        uint256 out = (amountIn * 1e18) / stablePerNative;
        require(out >= amountOutMin, "INSUFFICIENT_OUTPUT_AMOUNT");
        (bool ok,) = to.call{value: out}("");
        require(ok, "PAY");
        amounts = new uint256[](2);
        amounts[0] = amountIn;
        amounts[1] = out;
    }
}

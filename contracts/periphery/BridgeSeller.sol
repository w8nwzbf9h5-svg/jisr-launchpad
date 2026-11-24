// SPDX-License-Identifier: UNLICENSED
// Copyright (c) 2026 Jisr Launchpad. All rights reserved. See the LICENSE file.
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// Circle's CCTP V2 entry point on the source network. It burns USDC here; Circle mints the same
/// amount, less its fees, to the recipient on the destination network.
interface ITokenMessengerV2 {
    function depositForBurn(
        uint256 amount,
        uint32 destinationDomain,
        bytes32 mintRecipient,
        address burnToken,
        bytes32 destinationCaller,
        uint256 maxFee,
        uint32 minFinalityThreshold
    ) external;

    function depositForBurnWithHook(
        uint256 amount,
        uint32 destinationDomain,
        bytes32 mintRecipient,
        address burnToken,
        bytes32 destinationCaller,
        uint256 maxFee,
        uint32 minFinalityThreshold,
        bytes calldata hookData
    ) external;
}

interface ILaunchpadFactoryView {
    function stable() external view returns (address);
    function marketOf(address coin) external view returns (address);
}

interface ICoinMarketSell {
    function sell(uint256 coinsIn, uint256 minStableOut, address to, uint256 deadline) external returns (uint256 net);
    function reinforce() external returns (uint256 amount);
}

/// @title BridgeSeller
/// @notice Sell a coin on this network and receive the dollars on another network, in one transaction.
///         The coin is sold to its market exactly as in a normal sale, then the USDC received is sent
///         across with Circle's CCTP. This contract is a thin helper beside the markets:
///         - it has no owner, no settings and no way to withdraw anything;
///         - it never keeps coins or USDC between transactions;
///         - the markets do not know it exists and do not depend on it.
///         It works only for a launchpad whose reserve token is the network's native USDC.
contract BridgeSeller is ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// Circle's Forwarding Service request: the bytes "cctp-forward", version 0, no extra data.
    /// With it Circle delivers the USDC on the destination network itself, for a small fee taken from the amount.
    bytes32 public constant FORWARD_HOOK = 0x636374702d666f72776172640000000000000000000000000000000000000000;

    ILaunchpadFactoryView public immutable factory;
    IERC20 public immutable stable;
    ITokenMessengerV2 public immutable messenger;

    event SoldAndBridged(
        address indexed coin,
        address indexed seller,
        uint256 coinsIn,
        uint256 stableSent,
        uint32 destinationDomain,
        bytes32 mintRecipient,
        uint256 maxFee,
        bool forwarded
    );
    event Flushed(address indexed coin, uint256 coins, uint256 addedToFloor);

    error ZeroAddress();
    error ZeroAmount();
    error UnknownCoin();
    error NoRecipient();
    error FeeTooHigh();

    constructor(address factory_, address messenger_) {
        if (factory_ == address(0) || messenger_ == address(0)) revert ZeroAddress();
        factory = ILaunchpadFactoryView(factory_);
        stable = IERC20(ILaunchpadFactoryView(factory_).stable());
        messenger = ITokenMessengerV2(messenger_);
    }

    /// @notice Sell `coinsIn` of `coin` and send the proceeds to `mintRecipient` on another network.
    /// @param minStableOut  the least USDC the sale must return, before bridge fees (slippage protection)
    /// @param destinationDomain  Circle's number for the destination network
    /// @param mintRecipient  the receiving address there, left-padded to 32 bytes
    /// @param maxFee  the most USDC Circle may take from the amount for its fees
    /// @param minFinalityThreshold  1000 for a fast transfer, 2000 for a standard one
    /// @param forward  true to have Circle deliver on the destination network; false if the receiver will claim there
    /// @return sent  the USDC handed to the bridge
    function sellAndBridge(
        address coin,
        uint256 coinsIn,
        uint256 minStableOut,
        uint32 destinationDomain,
        bytes32 mintRecipient,
        uint256 maxFee,
        uint32 minFinalityThreshold,
        bool forward,
        uint256 deadline
    ) external nonReentrant returns (uint256 sent) {
        if (coinsIn == 0) revert ZeroAmount();
        if (mintRecipient == bytes32(0)) revert NoRecipient();
        address market = factory.marketOf(coin);
        if (market == address(0)) revert UnknownCoin();

        // Coins somebody sent here directly would count against this contract's wallet limit and could
        // block real sellers. They are sold first and the money goes to that coin's floor reserve.
        _flush(coin, market, deadline);

        IERC20(coin).safeTransferFrom(msg.sender, address(this), coinsIn);
        IERC20(coin).forceApprove(market, coinsIn);
        sent = ICoinMarketSell(market).sell(coinsIn, minStableOut, address(this), deadline);
        if (maxFee >= sent) revert FeeTooHigh();

        stable.forceApprove(address(messenger), sent);
        if (forward) {
            messenger.depositForBurnWithHook(
                sent, destinationDomain, mintRecipient, address(stable), bytes32(0), maxFee, minFinalityThreshold,
                abi.encodePacked(FORWARD_HOOK)
            );
        } else {
            messenger.depositForBurn(
                sent, destinationDomain, mintRecipient, address(stable), bytes32(0), maxFee, minFinalityThreshold
            );
        }
        emit SoldAndBridged(coin, msg.sender, coinsIn, sent, destinationDomain, mintRecipient, maxFee, forward);
    }

    /// @notice Sell any coins of `coin` left in this contract and give the money to that coin's floor reserve.
    ///         Anyone may call it. Nobody can receive the money.
    function flush(address coin) external nonReentrant returns (uint256 added) {
        address market = factory.marketOf(coin);
        if (market == address(0)) revert UnknownCoin();
        added = _flush(coin, market, block.timestamp);
    }

    function _flush(address coin, address market, uint256 deadline) private returns (uint256 added) {
        uint256 stray = IERC20(coin).balanceOf(address(this));
        if (stray == 0) return 0;
        IERC20(coin).forceApprove(market, stray);
        // paid to the market itself, then counted into its floor reserve
        ICoinMarketSell(market).sell(stray, 0, market, deadline);
        added = ICoinMarketSell(market).reinforce();
        emit Flushed(coin, stray, added);
    }
}

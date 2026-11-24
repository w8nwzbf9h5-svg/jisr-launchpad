// SPDX-License-Identifier: UNLICENSED
// Copyright (c) 2026 Jisr Launchpad. All rights reserved. See the LICENSE file.
pragma solidity 0.8.26;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {Coin} from "./Coin.sol";
import {CoinMarket} from "./CoinMarket.sol";

interface IWrappedNativeSource {
    function WETH() external view returns (address);
}

/// @title LaunchpadFactory
/// @notice Launches coins. Every coin gets the same two contracts, a Coin and a CoinMarket, from fixed
///         templates. The reserve token, the swap router and the sale price are set once at deployment.
///
///         The reserve token (`stable`) is what coins are priced, bought and bought back in. It is normally
///         a dollar stablecoin. It can be any plain ERC-20, for example a tokenized stock; the floor is then
///         a number of those tokens, so its dollar value moves with them. Tokens that charge a fee on
///         transfer, rebase, or restrict who may hold them are not supported.
///
///         The swap router is optional. Without one, coins trade in the reserve token only and the
///         native-currency functions are switched off.
///
///         The owner of this factory can do exactly one thing: choose the platform wallet that receives
///         the launchpad's 2% fee. The owner cannot touch any coin, any market or any reserve.
contract LaunchpadFactory is Ownable2Step {
    address public immutable coinTemplate;
    address public immutable marketTemplate;
    address public immutable stable;
    address public immutable router;
    address public immutable wrappedNative;
    /// What the whole 1,000,000,000 supply is worth at the sale price, in reserve-token base units.
    /// For a dollar stablecoin with 6 decimals and a $100,000 market cap this is 100_000e6.
    uint256 public immutable saleMarketCap;
    /// Sale price of every coin, in the market's price format: saleMarketCap / 1e9 coins, scaled by 1e18.
    uint256 public immutable salePrice;

    address public platformWallet;

    address[] public coins;
    mapping(address coin => address market) public marketOf;

    event CoinCreated(address indexed creator, address indexed coin, address indexed market, string name, string symbol, string metadataURI);
    event PlatformWalletChanged(address indexed previousWallet, address indexed newWallet);

    error ZeroAddress();
    error BadName();
    error BadMarketCap();

    /// @param stable_ the reserve token
    /// @param router_ a Uniswap V2 style router with native/reserve-token liquidity, or address(0) for none
    /// @param platformWallet_ receives the launchpad's 2% fee
    /// @param owner_ may change the platform wallet and nothing else
    /// @param saleMarketCap_ value of the whole supply at the sale price, in reserve-token base units
    constructor(address stable_, address router_, address platformWallet_, address owner_, uint256 saleMarketCap_)
        Ownable(owner_)
    {
        if (stable_ == address(0) || platformWallet_ == address(0)) revert ZeroAddress();
        if (saleMarketCap_ < 1e6 || saleMarketCap_ > 1e40) revert BadMarketCap();
        IERC20Metadata(stable_).decimals(); // reverts if this is not a token
        stable = stable_;
        router = router_;
        wrappedNative = router_ == address(0) ? address(0) : IWrappedNativeSource(router_).WETH();
        saleMarketCap = saleMarketCap_;
        salePrice = saleMarketCap_ * 1e9;
        platformWallet = platformWallet_;
        coinTemplate = address(new Coin());
        marketTemplate = address(new CoinMarket());
    }

    /// @notice Launch a coin. The caller becomes its creator and receives the 1% creator fee.
    ///         The creator gets no coins and no special rights.
    function createCoin(string calldata name, string calldata symbol, string calldata metadataURI)
        external
        returns (address coin, address market)
    {
        uint256 n = bytes(name).length;
        uint256 s = bytes(symbol).length;
        if (n < 2 || n > 32 || s < 2 || s > 10 || bytes(metadataURI).length > 16_384) revert BadName();

        coin = Clones.clone(coinTemplate);
        market = Clones.clone(marketTemplate);
        CoinMarket(payable(market)).initialize(coin, stable, router, wrappedNative, msg.sender, salePrice);
        Coin(coin).initialize(name, symbol, metadataURI, market);

        coins.push(coin);
        marketOf[coin] = market;
        emit CoinCreated(msg.sender, coin, market, name, symbol, metadataURI);
    }

    /// @notice Change the wallet that receives the launchpad's 2% fee.
    function setPlatformWallet(address newWallet) external onlyOwner {
        if (newWallet == address(0)) revert ZeroAddress();
        emit PlatformWalletChanged(platformWallet, newWallet);
        platformWallet = newWallet;
    }

    function coinCount() external view returns (uint256) {
        return coins.length;
    }
}

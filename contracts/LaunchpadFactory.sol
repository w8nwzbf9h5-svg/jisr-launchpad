// SPDX-License-Identifier: MIT
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
///         templates. The stablecoin, the swap router and the sale price are set once at deployment.
///
///         The owner of this factory can do exactly one thing: choose the platform wallet that receives
///         the launchpad's 2% fee. The owner cannot touch any coin, any market or any reserve.
contract LaunchpadFactory is Ownable2Step {
    address public immutable coinTemplate;
    address public immutable marketTemplate;
    address public immutable stable;
    address public immutable router;
    address public immutable wrappedNative;
    /// Sale price of every coin: 0.0001 stablecoin per coin, in the market's price format.
    uint256 public immutable salePrice;

    address public platformWallet;

    address[] public coins;
    mapping(address coin => address market) public marketOf;

    event CoinCreated(address indexed creator, address indexed coin, address indexed market, string name, string symbol, string metadataURI);
    event PlatformWalletChanged(address indexed previousWallet, address indexed newWallet);

    error ZeroAddress();
    error BadName();

    constructor(address stable_, address router_, address platformWallet_, address owner_) Ownable(owner_) {
        if (stable_ == address(0) || router_ == address(0) || platformWallet_ == address(0)) revert ZeroAddress();
        stable = stable_;
        router = router_;
        wrappedNative = IWrappedNativeSource(router_).WETH();
        salePrice = (10 ** IERC20Metadata(stable_).decimals() * 1e18) / 10_000;
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
        if (n < 2 || n > 32 || s < 2 || s > 10) revert BadName();

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

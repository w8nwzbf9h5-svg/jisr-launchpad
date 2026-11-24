// SPDX-License-Identifier: UNLICENSED
// Copyright (c) 2026 Jisr Launchpad. All rights reserved. See the LICENSE file.
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";

interface ISwapRouter {
    function swapETHForExactTokens(uint256 amountOut, address[] calldata path, address to, uint256 deadline)
        external
        payable
        returns (uint256[] memory amounts);

    function swapExactTokensForETH(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);
}

interface IPlatformWallet {
    function platformWallet() external view returns (address);
}

/// @title CoinMarket
/// @notice The only place a launchpad coin is sold and bought back. It holds the coin's reserve.
///         "Stablecoin" below means the factory's reserve token: normally a dollar stablecoin, possibly
///         another plain ERC-20 such as a tokenized stock.
///
///         Pricing is one line over "coins outstanding":
///           - the first 800M coins cost the floor price each (this is the fixed-price sale);
///           - the last 200M cost the floor price plus a premium that grows as they sell out.
///         Every coin that leaves the market puts one floor price into the floor reserve, so the reserve
///         can always buy back every outstanding coin at the floor price. Once the sale has sold out
///         ("graduated") the community fee makes the reserve larger than it needs to be, and the floor
///         price is raised to match. It is never lowered.
///
///         Nobody controls this contract. There is no owner, no upgrade, no pause and no withdrawal.
///         Stablecoins leave only (a) to a seller, by the formula, (b) to the coin's creator, as the
///         1% fee, (c) to the launchpad's platform wallet, as the 2% fee. The two fees are paid out
///         by every trade, as its last step.
/// @dev Deployed as an EIP-1167 minimal proxy of one template. A minimal proxy cannot be upgraded.
contract CoinMarket is Initializable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant SALE_SUPPLY = 800_000_000e18; // sold at the floor price
    uint256 public constant CURVE_SUPPLY = 200_000_000e18; // sold above the floor price
    uint256 public constant CURVE_MAX = 190_000_000e18; // the curve stops here; the premium has no upper bound beyond it

    uint256 public constant BPS = 10_000;
    uint256 public constant FEE_BPS = 500; // 5% of every trade
    uint256 public constant CREATOR_BPS = 100; // 1% to the creator
    uint256 public constant PLATFORM_BPS = 200; // 2% to the launchpad; the remaining 2% stays in the floor reserve

    /// Prices are stablecoin base units per whole coin (1e18 coin units), scaled by 1e18.
    uint256 private constant PRICE_SCALE = 1e36;

    IERC20 public stable;
    IERC20 public coin;
    ISwapRouter public router;
    address public wrappedNative;
    address public factory;
    address public creator;

    uint256 public salePrice; // the floor price at launch; fixed for the whole sale
    uint256 public floorPrice; // current floor price; never decreases
    uint256 public floorOut; // coins outstanding from the floor zone, 0..SALE_SUPPLY
    uint256 public curveOut; // coins outstanding from the curve, 0..CURVE_MAX
    uint256 public floorReserve; // backs every outstanding coin at the floor price
    uint256 public premiumReserve; // backs the premium paid on curve coins
    uint256 public creatorFees; // owed to the creator
    uint256 public platformFees; // owed to the platform wallet
    bool public graduated; // the sale has sold out at least once

    struct BuyQuote {
        uint256 fromFloor;
        uint256 fromCurve;
        uint256 floorPart;
        uint256 premiumPart;
        uint256 total;
        uint256 creatorFee;
        uint256 platformFee;
        uint256 communityFee;
    }

    struct SellQuote {
        uint256 fromCurve;
        uint256 fromFloor;
        uint256 floorPart;
        uint256 premiumPart;
        uint256 gross;
        uint256 creatorFee;
        uint256 platformFee;
        uint256 communityFee;
        uint256 net;
    }

    event Bought(address indexed buyer, uint256 coins, uint256 stablePaid, bool paidInNative);
    event Sold(address indexed seller, address indexed to, uint256 coins, uint256 stableOut, bool paidInNative);
    event Graduated(uint256 floorReserve);
    event FloorRaised(uint256 floorPrice);
    event CreatorFeesClaimed(address indexed creator, uint256 amount);
    event PlatformFeesSwept(address indexed platformWallet, uint256 amount);
    event Reinforced(uint256 amount);

    error ZeroAmount();
    error Expired();
    error Slippage();
    error SoldOut();
    error NotOutstanding();
    error ShortPayment();
    error RefundFailed();
    error OnlyRouter();
    error NativeNotSupported();

    constructor() {
        _disableInitializers();
    }

    function initialize(
        address coin_,
        address stable_,
        address router_,
        address wrappedNative_,
        address creator_,
        uint256 salePrice_
    ) external initializer {
        coin = IERC20(coin_);
        stable = IERC20(stable_);
        router = ISwapRouter(router_);
        wrappedNative = wrappedNative_;
        creator = creator_;
        factory = msg.sender;
        salePrice = salePrice_;
        floorPrice = salePrice_;
    }

    // ------------------------------------------------------------------ buying

    /// @notice Buy exactly `coinsOut` coins with the stablecoin.
    /// @param maxStableIn the most the buyer agrees to pay, fees included
    function buy(uint256 coinsOut, uint256 maxStableIn, uint256 deadline)
        external
        nonReentrant
        returns (uint256 total)
    {
        if (block.timestamp > deadline) revert Expired();
        BuyQuote memory q = _quoteBuy(coinsOut);
        total = q.total;
        if (total > maxStableIn) revert Slippage();

        uint256 before = stable.balanceOf(address(this));
        stable.safeTransferFrom(msg.sender, address(this), total);
        uint256 received = stable.balanceOf(address(this)) - before;
        if (received < total) revert ShortPayment();

        _applyBuy(q, received - total);
        coin.safeTransfer(msg.sender, coinsOut);
        emit Bought(msg.sender, coinsOut, total, false);
        _payFees();
    }

    /// @notice Buy exactly `coinsOut` coins with the chain's native currency (ETH or BNB).
    ///         The native currency is swapped to the stablecoin on the way in; `msg.value` is the most
    ///         the buyer agrees to pay and whatever is not needed is sent straight back.
    function buyWithNative(uint256 coinsOut, uint256 deadline)
        external
        payable
        nonReentrant
        returns (uint256 total, uint256 nativeSpent)
    {
        if (address(router) == address(0)) revert NativeNotSupported();
        BuyQuote memory q = _quoteBuy(coinsOut);
        total = q.total;

        address[] memory path = new address[](2);
        path[0] = wrappedNative;
        path[1] = address(stable);

        uint256 nativeBefore = address(this).balance - msg.value;
        uint256 before = stable.balanceOf(address(this));
        router.swapETHForExactTokens{value: msg.value}(total, path, address(this), deadline);
        uint256 received = stable.balanceOf(address(this)) - before;
        if (received < total) revert ShortPayment();

        _applyBuy(q, received - total);
        coin.safeTransfer(msg.sender, coinsOut);

        uint256 refund = address(this).balance - nativeBefore;
        nativeSpent = msg.value - refund;
        if (refund > 0) {
            (bool ok,) = msg.sender.call{value: refund}("");
            if (!ok) revert RefundFailed();
        }
        emit Bought(msg.sender, coinsOut, total, true);
        _payFees();
    }

    // ------------------------------------------------------------------ selling

    /// @notice Sell `coinsIn` coins for the stablecoin, paid to `to`.
    function sell(uint256 coinsIn, uint256 minStableOut, address to, uint256 deadline)
        external
        nonReentrant
        returns (uint256 net)
    {
        if (block.timestamp > deadline) revert Expired();
        SellQuote memory q = _quoteSell(coinsIn);
        net = q.net;
        if (net < minStableOut) revert Slippage();

        coin.safeTransferFrom(msg.sender, address(this), coinsIn);
        _applySell(q);
        stable.safeTransfer(to, net);
        emit Sold(msg.sender, to, coinsIn, net, false);
        _payFees();
    }

    /// @notice Sell `coinsIn` coins and receive the chain's native currency (ETH or BNB), paid to `to`.
    function sellForNative(uint256 coinsIn, uint256 minNativeOut, address to, uint256 deadline)
        external
        nonReentrant
        returns (uint256 nativeOut)
    {
        if (address(router) == address(0)) revert NativeNotSupported();
        SellQuote memory q = _quoteSell(coinsIn);

        coin.safeTransferFrom(msg.sender, address(this), coinsIn);
        _applySell(q);

        address[] memory path = new address[](2);
        path[0] = address(stable);
        path[1] = wrappedNative;
        stable.forceApprove(address(router), q.net);
        uint256[] memory amounts = router.swapExactTokensForETH(q.net, minNativeOut, path, to, deadline);
        stable.forceApprove(address(router), 0);
        nativeOut = amounts[amounts.length - 1];
        emit Sold(msg.sender, to, coinsIn, q.net, true);
        _payFees();
    }

    // ------------------------------------------------------------------ fees

    // Every trade pays the fees out as its last step (see _payFees). The two functions below are for a
    // payout that could not be made at that moment: once the cause is gone, anyone may send it.

    /// @notice Pay the creator the 1% fees still held here. Anyone may call; the money goes to the creator.
    function claimCreatorFees() external nonReentrant returns (uint256 amount) {
        amount = creatorFees;
        creatorFees = 0;
        stable.safeTransfer(creator, amount);
        emit CreatorFeesClaimed(creator, amount);
    }

    /// @notice Pay the launchpad the 2% fees still held here. Anyone may call; the money goes to the
    ///         platform wallet set on the factory. This is the only wallet the launchpad team controls.
    function sweepPlatformFees() external nonReentrant returns (uint256 amount) {
        address wallet = IPlatformWallet(factory).platformWallet();
        amount = platformFees;
        platformFees = 0;
        stable.safeTransfer(wallet, amount);
        emit PlatformFeesSwept(wallet, amount);
    }

    /// @notice Add any stablecoin sent to this contract by mistake, or as a gift, to the floor reserve.
    ///         It can only make the reserve larger.
    function reinforce() external nonReentrant returns (uint256 amount) {
        uint256 accounted = floorReserve + premiumReserve + creatorFees + platformFees;
        uint256 balance = stable.balanceOf(address(this));
        if (balance > accounted) {
            amount = balance - accounted;
            floorReserve += amount;
            _raiseFloor();
            emit Reinforced(amount);
        }
    }

    // ------------------------------------------------------------------ views

    function quoteBuy(uint256 coinsOut) external view returns (BuyQuote memory) {
        return _quoteBuy(coinsOut);
    }

    function quoteSell(uint256 coinsIn) external view returns (SellQuote memory) {
        return _quoteSell(coinsIn);
    }

    /// @notice Coins held outside the market.
    function outstanding() public view returns (uint256) {
        return floorOut + curveOut;
    }

    /// @notice Price of the next coin, before fees.
    function currentPrice() external view returns (uint256) {
        if (curveOut == 0) return floorPrice;
        uint256 left = CURVE_SUPPLY - curveOut;
        uint256 scaled = Math.mulDiv(Math.mulDiv(salePrice, CURVE_SUPPLY, left), CURVE_SUPPLY, left);
        return floorPrice + scaled - salePrice;
    }

    /// @notice Stablecoin needed to buy back every outstanding coin at the floor price.
    function floorLiability() public view returns (uint256) {
        return Math.mulDiv(outstanding(), floorPrice, PRICE_SCALE, Math.Rounding.Ceil);
    }

    // ------------------------------------------------------------------ internals

    function _floorValue(uint256 coins, Math.Rounding rounding) private view returns (uint256) {
        return Math.mulDiv(coins, floorPrice, PRICE_SCALE, rounding);
    }

    /// Total premium held when `s` curve coins are outstanding: salePrice * s^2 / (CURVE_SUPPLY - s).
    function _premium(uint256 s, Math.Rounding rounding) private view returns (uint256) {
        if (s == 0) return 0;
        return Math.mulDiv(Math.mulDiv(s, s, CURVE_SUPPLY - s, rounding), salePrice, PRICE_SCALE, rounding);
    }

    function _quoteBuy(uint256 coinsOut) private view returns (BuyQuote memory q) {
        if (coinsOut == 0) revert ZeroAmount();
        q.fromFloor = Math.min(coinsOut, SALE_SUPPLY - floorOut);
        q.fromCurve = coinsOut - q.fromFloor;
        if (curveOut + q.fromCurve > CURVE_MAX) revert SoldOut();

        // Every coin, sale or curve, pays one floor price into the floor reserve. Rounded up.
        q.floorPart = _floorValue(coinsOut, Math.Rounding.Ceil);
        if (q.fromCurve > 0) {
            q.premiumPart =
                _premium(curveOut + q.fromCurve, Math.Rounding.Ceil) - _premium(curveOut, Math.Rounding.Floor);
        }
        uint256 base = q.floorPart + q.premiumPart;
        q.total = Math.mulDiv(base, BPS, BPS - FEE_BPS, Math.Rounding.Ceil);
        q.creatorFee = (q.total * CREATOR_BPS) / BPS;
        q.platformFee = (q.total * PLATFORM_BPS) / BPS;
        q.communityFee = q.total - base - q.creatorFee - q.platformFee;
    }

    function _quoteSell(uint256 coinsIn) private view returns (SellQuote memory q) {
        if (coinsIn == 0) revert ZeroAmount();
        q.fromCurve = Math.min(coinsIn, curveOut);
        q.fromFloor = coinsIn - q.fromCurve;
        if (q.fromFloor > floorOut) revert NotOutstanding();

        // Rounded down, so rounding always favours the reserve.
        q.floorPart = _floorValue(coinsIn, Math.Rounding.Floor);
        if (q.fromCurve > 0) {
            uint256 high = _premium(curveOut, Math.Rounding.Floor);
            uint256 low = _premium(curveOut - q.fromCurve, Math.Rounding.Ceil);
            q.premiumPart = high > low ? high - low : 0;
            if (q.premiumPart > premiumReserve) q.premiumPart = premiumReserve;
        }
        q.gross = q.floorPart + q.premiumPart;
        q.creatorFee = (q.gross * CREATOR_BPS) / BPS;
        q.platformFee = (q.gross * PLATFORM_BPS) / BPS;
        q.communityFee = (q.gross * (FEE_BPS - CREATOR_BPS - PLATFORM_BPS)) / BPS;
        q.net = q.gross - q.creatorFee - q.platformFee - q.communityFee;
    }

    function _applyBuy(BuyQuote memory q, uint256 surplus) private {
        floorOut += q.fromFloor;
        curveOut += q.fromCurve;
        floorReserve += q.floorPart + q.communityFee + surplus;
        premiumReserve += q.premiumPart;
        creatorFees += q.creatorFee;
        platformFees += q.platformFee;
        if (!graduated && floorOut == SALE_SUPPLY) {
            graduated = true;
            emit Graduated(floorReserve);
        }
        _raiseFloor();
    }

    function _applySell(SellQuote memory q) private {
        curveOut -= q.fromCurve;
        floorOut -= q.fromFloor;
        floorReserve = floorReserve - q.floorPart + q.communityFee;
        premiumReserve -= q.premiumPart;
        creatorFees += q.creatorFee;
        platformFees += q.platformFee;
        _raiseFloor();
    }

    /// Gas given to each fee payout made as part of a trade. A plain token transfer needs far less.
    uint256 private constant PAYOUT_GAS = 200_000;

    /// Pay out the fees collected so far, as the last step of every trade: the creator's 1% to the
    /// creator, the launchpad's 2% to the platform wallet. Nobody has to call anything.
    ///
    /// A payout that cannot be made never stops the trade. If the stablecoin refuses the transfer
    /// (for example because its issuer has blocked the receiving wallet) or uses more gas than
    /// PAYOUT_GAS, the amount stays recorded in this contract and is paid by the next trade, or by
    /// claimCreatorFees / sweepPlatformFees, which anyone may call.
    function _payFees() private {
        uint256 amount = creatorFees;
        if (amount != 0) {
            creatorFees = 0;
            if (_trySend(creator, amount)) emit CreatorFeesClaimed(creator, amount);
            else creatorFees = amount;
        }
        amount = platformFees;
        if (amount != 0) {
            address wallet = IPlatformWallet(factory).platformWallet();
            platformFees = 0;
            if (_trySend(wallet, amount)) emit PlatformFeesSwept(wallet, amount);
            else platformFees = amount;
        }
    }

    /// Transfer stablecoins without ever reverting. True only if the token reported success: it did
    /// not revert, and it returned either nothing (as USDT does) or `true`.
    function _trySend(address to, uint256 amount) private returns (bool) {
        (bool ok, bytes memory ret) = address(stable).call{gas: PAYOUT_GAS}(abi.encodeCall(IERC20.transfer, (to, amount)));
        if (!ok) return false;
        if (ret.length == 0) return true;
        return ret.length >= 32 && abi.decode(ret, (uint256)) == 1;
    }

    /// Raise the floor price to what the floor reserve can pay for every outstanding coin.
    /// While coins have been sold back (fewer than SALE_SUPPLY outstanding) the reserve is spread
    /// over the full SALE_SUPPLY, so a nearly empty market cannot produce a runaway floor.
    function _raiseFloor() private {
        if (!graduated) return;
        uint256 coins = floorOut + curveOut;
        if (coins < SALE_SUPPLY) coins = SALE_SUPPLY;
        uint256 price = Math.mulDiv(floorReserve, PRICE_SCALE, coins);
        if (price > floorPrice) {
            floorPrice = price;
            emit FloorRaised(price);
        }
    }

    /// Native currency is accepted only as a refund from the swap router.
    receive() external payable {
        if (msg.sender != address(router)) revert OnlyRouter();
    }
}

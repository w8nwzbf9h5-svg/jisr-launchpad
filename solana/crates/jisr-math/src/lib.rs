//! Pricing, fees and reserve accounting for one launchpad coin.
//!
//! This is the same model as `CoinMarket.sol`, in integer math with no dependencies, so it can be
//! tested exhaustively off-chain and used unchanged inside the Solana program.
//!
//! Price is one line over "coins outstanding" (coins held outside the market):
//!   * the first 800M coins cost the floor price each (the fixed-price sale);
//!   * the last 200M cost the floor price plus a premium that grows as they sell out.
//! Every coin that leaves the market puts one floor price into the floor reserve, so the reserve can
//! always buy back every outstanding coin at the floor price. After the sale has sold out, the fee that
//! stays in the reserve lifts the floor price. The floor price never goes down.
//!
//! All rounding favours the reserve.
#![cfg_attr(not(test), no_std)]

/// Base units in one coin (6 decimals).
pub const COIN: u64 = 1_000_000;
pub const COIN_DECIMALS: u8 = 6;
pub const TOTAL_SUPPLY: u64 = 1_000_000_000 * COIN;
/// Sold at the floor price.
pub const SALE_SUPPLY: u64 = 800_000_000 * COIN;
/// Sold above the floor price.
pub const CURVE_SUPPLY: u64 = 200_000_000 * COIN;
/// The curve stops here; beyond it the premium has no upper bound.
pub const CURVE_MAX: u64 = 190_000_000 * COIN;
/// One wallet may hold 2.5% of supply.
pub const MAX_WALLET: u64 = 25_000_000 * COIN;

pub const BPS: u64 = 10_000;
/// 5% of every trade.
pub const FEE_BPS: u64 = 500;
/// 1% to the creator.
pub const CREATOR_BPS: u64 = 100;
/// 2% to the launchpad. The remaining 2% stays in the floor reserve.
pub const PLATFORM_BPS: u64 = 200;

/// Prices are stablecoin base units per coin base unit, scaled by 1e18.
pub const PRICE_SCALE: u128 = 1_000_000_000_000_000_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MathError {
    ZeroAmount,
    /// The curve above the floor has no coins left.
    SoldOut,
    /// More coins offered for sale than are outstanding.
    NotOutstanding,
    Overflow,
}

/// The sale price, $0.0001 a coin, for a stablecoin with `stable_decimals` decimals.
pub fn sale_price(stable_decimals: u8) -> Option<u128> {
    let unit = 10u128.checked_pow(stable_decimals as u32)?;
    Some(unit.checked_mul(PRICE_SCALE)? / (10_000 * COIN as u128))
}

fn mul_div(a: u128, b: u128, d: u128, round_up: bool) -> Result<u128, MathError> {
    if d == 0 {
        return Err(MathError::Overflow);
    }
    let p = a.checked_mul(b).ok_or(MathError::Overflow)?;
    let q = p / d;
    if round_up && p % d != 0 {
        q.checked_add(1).ok_or(MathError::Overflow)
    } else {
        Ok(q)
    }
}

fn to_u64(v: u128) -> Result<u64, MathError> {
    u64::try_from(v).map_err(|_| MathError::Overflow)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct Market {
    /// Floor price at launch; fixed for the whole sale.
    pub sale_price: u128,
    /// Current floor price; never decreases.
    pub floor_price: u128,
    /// Coins outstanding from the floor zone, 0..=SALE_SUPPLY.
    pub floor_out: u64,
    /// Coins outstanding from the curve, 0..=CURVE_MAX.
    pub curve_out: u64,
    /// Backs every outstanding coin at the floor price.
    pub floor_reserve: u64,
    /// Backs the premium paid on curve coins.
    pub premium_reserve: u64,
    /// Owed to the creator.
    pub creator_fees: u64,
    /// Owed to the platform wallet.
    pub platform_fees: u64,
    /// The sale has sold out at least once.
    pub graduated: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct BuyQuote {
    pub from_floor: u64,
    pub from_curve: u64,
    pub floor_part: u64,
    pub premium_part: u64,
    /// What the buyer pays, fees included.
    pub total: u64,
    pub creator_fee: u64,
    pub platform_fee: u64,
    pub community_fee: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct SellQuote {
    pub from_curve: u64,
    pub from_floor: u64,
    pub floor_part: u64,
    pub premium_part: u64,
    pub gross: u64,
    pub creator_fee: u64,
    pub platform_fee: u64,
    pub community_fee: u64,
    /// What the seller receives.
    pub net: u64,
}

impl Market {
    pub fn new(sale_price: u128) -> Self {
        Market { sale_price, floor_price: sale_price, ..Default::default() }
    }

    /// Coins held outside the market.
    pub fn outstanding(&self) -> u64 {
        self.floor_out + self.curve_out
    }

    /// Everything the market's stablecoin account must hold.
    pub fn accounted(&self) -> Result<u64, MathError> {
        let sum = self.floor_reserve as u128 + self.premium_reserve as u128 + self.creator_fees as u128 + self.platform_fees as u128;
        to_u64(sum)
    }

    /// Stablecoin needed to buy back every outstanding coin at the floor price.
    pub fn floor_liability(&self) -> Result<u64, MathError> {
        self.floor_value(self.outstanding(), true)
    }

    /// Price of the next coin, before fees.
    pub fn current_price(&self) -> Result<u128, MathError> {
        if self.curve_out == 0 {
            return Ok(self.floor_price);
        }
        let left = (CURVE_SUPPLY - self.curve_out) as u128;
        let scaled = mul_div(mul_div(self.sale_price, CURVE_SUPPLY as u128, left, false)?, CURVE_SUPPLY as u128, left, false)?;
        self.floor_price.checked_add(scaled - self.sale_price).ok_or(MathError::Overflow)
    }

    fn floor_value(&self, coins: u64, round_up: bool) -> Result<u64, MathError> {
        to_u64(mul_div(coins as u128, self.floor_price, PRICE_SCALE, round_up)?)
    }

    /// Total premium held when `s` curve coins are outstanding: sale_price * s^2 / (CURVE_SUPPLY - s).
    fn premium(&self, s: u64, round_up: bool) -> Result<u64, MathError> {
        if s == 0 {
            return Ok(0);
        }
        let inner = mul_div(s as u128, s as u128, (CURVE_SUPPLY - s) as u128, round_up)?;
        to_u64(mul_div(inner, self.sale_price, PRICE_SCALE, round_up)?)
    }

    pub fn quote_buy(&self, coins_out: u64) -> Result<BuyQuote, MathError> {
        if coins_out == 0 {
            return Err(MathError::ZeroAmount);
        }
        let from_floor = coins_out.min(SALE_SUPPLY - self.floor_out);
        let from_curve = coins_out - from_floor;
        let new_curve = self.curve_out.checked_add(from_curve).ok_or(MathError::Overflow)?;
        if new_curve > CURVE_MAX {
            return Err(MathError::SoldOut);
        }
        // Every coin, sale or curve, pays one floor price into the floor reserve. Rounded up.
        let floor_part = self.floor_value(coins_out, true)?;
        let premium_part = if from_curve > 0 { self.premium(new_curve, true)? - self.premium(self.curve_out, false)? } else { 0 };
        let base = floor_part as u128 + premium_part as u128;
        let total = to_u64(mul_div(base, BPS as u128, (BPS - FEE_BPS) as u128, true)?)?;
        let creator_fee = to_u64(total as u128 * CREATOR_BPS as u128 / BPS as u128)?;
        let platform_fee = to_u64(total as u128 * PLATFORM_BPS as u128 / BPS as u128)?;
        let community_fee = total - to_u64(base)? - creator_fee - platform_fee;
        Ok(BuyQuote { from_floor, from_curve, floor_part, premium_part, total, creator_fee, platform_fee, community_fee })
    }

    pub fn quote_sell(&self, coins_in: u64) -> Result<SellQuote, MathError> {
        if coins_in == 0 {
            return Err(MathError::ZeroAmount);
        }
        let from_curve = coins_in.min(self.curve_out);
        let from_floor = coins_in - from_curve;
        if from_floor > self.floor_out {
            return Err(MathError::NotOutstanding);
        }
        // Rounded down, so rounding always favours the reserve.
        let floor_part = self.floor_value(coins_in, false)?;
        let mut premium_part = 0;
        if from_curve > 0 {
            let high = self.premium(self.curve_out, false)?;
            let low = self.premium(self.curve_out - from_curve, true)?;
            premium_part = high.saturating_sub(low).min(self.premium_reserve);
        }
        let gross = floor_part.checked_add(premium_part).ok_or(MathError::Overflow)?;
        let creator_fee = to_u64(gross as u128 * CREATOR_BPS as u128 / BPS as u128)?;
        let platform_fee = to_u64(gross as u128 * PLATFORM_BPS as u128 / BPS as u128)?;
        let community_fee = to_u64(gross as u128 * (FEE_BPS - CREATOR_BPS - PLATFORM_BPS) as u128 / BPS as u128)?;
        let net = gross - creator_fee - platform_fee - community_fee;
        Ok(SellQuote { from_curve, from_floor, floor_part, premium_part, gross, creator_fee, platform_fee, community_fee, net })
    }

    /// Record a buy. Returns true if this buy sold out the sale (graduation).
    pub fn apply_buy(&mut self, q: &BuyQuote) -> Result<bool, MathError> {
        let add = |a: u64, b: u64| a.checked_add(b).ok_or(MathError::Overflow);
        self.floor_out = add(self.floor_out, q.from_floor)?;
        self.curve_out = add(self.curve_out, q.from_curve)?;
        self.floor_reserve = add(add(self.floor_reserve, q.floor_part)?, q.community_fee)?;
        self.premium_reserve = add(self.premium_reserve, q.premium_part)?;
        self.creator_fees = add(self.creator_fees, q.creator_fee)?;
        self.platform_fees = add(self.platform_fees, q.platform_fee)?;
        let mut graduated_now = false;
        if !self.graduated && self.floor_out == SALE_SUPPLY {
            self.graduated = true;
            graduated_now = true;
        }
        self.raise_floor()?;
        Ok(graduated_now)
    }

    /// Record a sell.
    pub fn apply_sell(&mut self, q: &SellQuote) -> Result<(), MathError> {
        let sub = |a: u64, b: u64| a.checked_sub(b).ok_or(MathError::Overflow);
        let add = |a: u64, b: u64| a.checked_add(b).ok_or(MathError::Overflow);
        self.curve_out = sub(self.curve_out, q.from_curve)?;
        self.floor_out = sub(self.floor_out, q.from_floor)?;
        self.floor_reserve = add(sub(self.floor_reserve, q.floor_part)?, q.community_fee)?;
        self.premium_reserve = sub(self.premium_reserve, q.premium_part)?;
        self.creator_fees = add(self.creator_fees, q.creator_fee)?;
        self.platform_fees = add(self.platform_fees, q.platform_fee)?;
        self.raise_floor()
    }

    /// Add stablecoins that reached the market outside a trade to the floor reserve.
    pub fn reinforce(&mut self, amount: u64) -> Result<(), MathError> {
        self.floor_reserve = self.floor_reserve.checked_add(amount).ok_or(MathError::Overflow)?;
        self.raise_floor()
    }

    /// Raise the floor price to what the floor reserve can pay for every outstanding coin.
    /// While coins have been sold back (fewer than SALE_SUPPLY outstanding) the reserve is spread over
    /// the full SALE_SUPPLY, so a nearly empty market cannot produce a runaway floor.
    fn raise_floor(&mut self) -> Result<(), MathError> {
        if !self.graduated {
            return Ok(());
        }
        let coins = self.outstanding().max(SALE_SUPPLY);
        let price = mul_div(self.floor_reserve as u128, PRICE_SCALE, coins as u128, false)?;
        if price > self.floor_price {
            self.floor_price = price;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const USD: u64 = 1_000_000; // 6-decimal stablecoin
    const M: u64 = 1_000_000 * COIN;

    struct Rng(u64);
    impl Rng {
        fn next(&mut self) -> u64 {
            self.0 ^= self.0 << 13;
            self.0 ^= self.0 >> 7;
            self.0 ^= self.0 << 17;
            self.0
        }
        fn below(&mut self, n: u64) -> u64 {
            self.next() % n
        }
    }

    /// A market plus the wallets and the stablecoin vault around it, the way the chain would hold them.
    struct World {
        m: Market,
        vault: u64,
        coins: Vec<u64>,
        cash: Vec<i128>,
        creator_paid: u64,
        platform_paid: u64,
        last_floor: u128,
    }
    impl World {
        fn new(wallets: usize) -> Self {
            let m = Market::new(sale_price(6).unwrap());
            World { last_floor: m.floor_price, m, vault: 0, coins: vec![0; wallets], cash: vec![0; wallets], creator_paid: 0, platform_paid: 0 }
        }
        fn buy(&mut self, w: usize, coins: u64) -> BuyQuote {
            assert!(self.coins[w] + coins <= MAX_WALLET, "test must respect the wallet limit");
            let q = self.m.quote_buy(coins).unwrap();
            self.m.apply_buy(&q).unwrap();
            self.vault += q.total;
            self.cash[w] -= q.total as i128;
            self.coins[w] += coins;
            self.check();
            q
        }
        fn sell(&mut self, w: usize, coins: u64) -> SellQuote {
            let q = self.m.quote_sell(coins).unwrap();
            self.m.apply_sell(&q).unwrap();
            assert!(self.vault >= q.net, "vault cannot pay the seller");
            self.vault -= q.net;
            self.cash[w] += q.net as i128;
            self.coins[w] -= coins;
            self.check();
            q
        }
        fn pay_fees(&mut self) {
            self.vault -= self.m.creator_fees + self.m.platform_fees;
            self.creator_paid += self.m.creator_fees;
            self.platform_paid += self.m.platform_fees;
            self.m.creator_fees = 0;
            self.m.platform_fees = 0;
            self.check();
        }
        fn check(&mut self) {
            assert!(self.vault >= self.m.accounted().unwrap(), "the vault holds less than the market owes");
            assert!(self.m.floor_reserve >= self.m.floor_liability().unwrap(), "the floor reserve cannot buy back every coin");
            assert!(self.m.floor_price >= self.last_floor, "the floor fell");
            assert!(self.m.current_price().unwrap() >= self.m.floor_price, "price under the floor");
            assert_eq!(self.m.outstanding(), self.coins.iter().sum::<u64>());
            self.last_floor = self.m.floor_price;
        }
        fn sell_out(&mut self) {
            for w in 0..40 {
                self.buy(w, 20 * M);
            }
        }
    }

    #[test]
    fn sale_price_is_one_hundredth_of_a_cent() {
        let m = Market::new(sale_price(6).unwrap());
        assert_eq!(m.floor_value(M, false).unwrap(), 100 * USD); // one million coins cost $100
        assert_eq!(sale_price(6).unwrap(), 100_000_000_000_000);
    }

    #[test]
    fn one_thousand_dollars_in_nine_hundred_two_fifty_out() {
        let mut w = World::new(2);
        let coins = 9_500_000 * COIN;
        let q = w.buy(0, coins);
        assert_eq!(q.total, 1000 * USD);
        assert_eq!((q.creator_fee, q.platform_fee, q.community_fee), (10 * USD, 20 * USD, 20 * USD));
        assert_eq!(w.m.floor_reserve, 970 * USD);
        // a later buyer pays exactly the same
        assert_eq!(w.buy(1, coins).total, 1000 * USD);
        assert_eq!(w.m.floor_price, w.m.sale_price);
        assert_eq!(w.sell(0, coins).net, 902_500_000);
    }

    #[test]
    fn graduation_lifts_the_floor_and_the_curve_prices_above_it() {
        let mut w = World::new(45);
        w.sell_out();
        assert!(w.m.graduated);
        assert_eq!(w.m.floor_out, SALE_SUPPLY);
        assert_eq!(w.m.floor_price * 10_000 / w.m.sale_price, 10_210); // +2.1% from the fees kept during the sale
        let q = w.m.quote_buy(20 * M).unwrap();
        assert_eq!(q.from_curve, 20 * M);
        assert!(q.premium_part / (USD / 100) == 22_222 || q.premium_part / (USD / 100) == 22_223); // $222.22
        let floor = w.m.floor_price;
        w.buy(40, 20 * M);
        assert!(w.m.current_price().unwrap() > w.m.floor_price);
        w.sell(40, 20 * M);
        assert_eq!(w.m.curve_out, 0);
        assert_eq!(w.m.current_price().unwrap(), w.m.floor_price);
        assert!(w.m.floor_price >= floor);
    }

    #[test]
    fn rejects_bad_amounts() {
        let mut w = World::new(60);
        assert_eq!(w.m.quote_buy(0), Err(MathError::ZeroAmount));
        assert_eq!(w.m.quote_sell(0), Err(MathError::ZeroAmount));
        assert_eq!(w.m.quote_sell(1), Err(MathError::NotOutstanding));
        w.sell_out();
        for i in 40..49 {
            w.buy(i, 20 * M);
        }
        w.buy(49, 10 * M); // the curve is now at its 190M limit
        assert_eq!(w.m.curve_out, CURVE_MAX);
        assert_eq!(w.m.quote_buy(1), Err(MathError::SoldOut));
    }

    #[test]
    fn stays_covered_through_random_trading_and_everyone_can_exit() {
        for seed in 1..=20u64 {
            let mut rng = Rng(seed.wrapping_mul(0x9E37_79B9_7F4A_7C15) | 1);
            let n = 57;
            let mut w = World::new(n);
            for i in 0..3000 {
                let who = rng.below(n as u64) as usize;
                let roll = rng.below(100);
                let want_buy = if i < 500 { roll < 92 } else { roll < 50 };
                if want_buy {
                    let room = MAX_WALLET - w.coins[who];
                    let left = (SALE_SUPPLY - w.m.floor_out) + (CURVE_MAX - w.m.curve_out);
                    let dust = rng.below(10) == 0;
                    let amt = (if dust { 1 + rng.below(1000) } else { (1 + rng.below(20_000_000)) * COIN }).min(room).min(left);
                    if amt > 0 {
                        w.buy(who, amt);
                    }
                } else if roll < 92 {
                    let held = w.coins[who];
                    if held > 0 {
                        let amt = if rng.below(10) < 4 { held } else { 1 + rng.below(held) };
                        w.sell(who, amt);
                    }
                } else if roll < 96 {
                    let gift = rng.below(500) * USD; // stablecoins sent straight to the market
                    w.vault += gift;
                    w.m.reinforce(gift).unwrap();
                    w.check();
                } else {
                    w.pay_fees();
                }
            }
            assert!(w.m.graduated, "seed {seed} never graduated");
            assert!(w.m.floor_price > w.m.sale_price);
            for who in 0..n {
                let held = w.coins[who];
                if held > 0 {
                    w.sell(who, held);
                }
            }
            assert_eq!(w.m.outstanding(), 0);
            w.pay_fees();
            assert!(w.vault >= w.m.floor_reserve + w.m.premium_reserve);
        }
    }

    #[test]
    fn an_attacker_with_many_wallets_cannot_extract_value() {
        for (seed, graduated) in [(11u64, false), (12, true), (13, false), (14, true), (15, true)] {
            let mut rng = Rng(seed.wrapping_mul(0x2545_F491_4F6C_DD1D) | 1);
            let mut w = World::new(52);
            if graduated {
                w.sell_out();
                w.sell(0, 20 * M); // leave room in the floor zone
            } else {
                for v in 0..15 {
                    w.buy(v, 20 * M);
                }
            }
            let reserve_before = w.m.floor_reserve + w.m.premium_reserve;
            let cash_before: i128 = (40..52).map(|g| w.cash[g]).sum();
            let mut donated: i128 = 0;
            for _ in 0..4000 {
                let g = 40 + rng.below(12) as usize;
                let roll = rng.below(100);
                if roll < 45 {
                    let room = MAX_WALLET - w.coins[g];
                    let left = (SALE_SUPPLY - w.m.floor_out) + (CURVE_MAX - w.m.curve_out);
                    let amt = (if rng.below(5) == 0 { 1 + rng.below(1000) } else { (1 + rng.below(25_000_000)) * COIN }).min(room).min(left);
                    if amt > 0 {
                        w.buy(g, amt);
                    }
                } else if roll < 88 {
                    let held = w.coins[g];
                    if held > 0 {
                        let amt = if rng.below(2) == 0 { held } else { 1 + rng.below(held) };
                        w.sell(g, amt);
                    }
                } else if roll < 94 {
                    let gift = rng.below(300) * USD;
                    w.vault += gift;
                    donated += gift as i128;
                    w.m.reinforce(gift).unwrap();
                    w.check();
                } else {
                    // shuffle coins between the attacker's own wallets
                    let h = 40 + rng.below(12) as usize;
                    let amt = w.coins[g].min(MAX_WALLET - w.coins[h]);
                    if h != g && amt > 0 {
                        w.coins[g] -= amt;
                        w.coins[h] += amt;
                    }
                }
            }
            for g in 40..52 {
                let held = w.coins[g];
                if held > 0 {
                    w.sell(g, held);
                }
            }
            let cash_after: i128 = (40..52).map(|g| w.cash[g]).sum::<i128>() - donated;
            assert!(cash_after <= cash_before, "attacker profit with seed {seed}: {}", cash_after - cash_before);
            assert!(w.m.floor_reserve + w.m.premium_reserve >= reserve_before, "the victims' reserve shrank");
            for v in 0..40 {
                let held = w.coins[v];
                if held > 0 {
                    w.sell(v, held);
                }
            }
        }
    }

    #[test]
    fn extreme_sizes_do_not_overflow() {
        // A floor reserve near the top of u64 and a full curve still compute without overflow.
        let mut m = Market::new(sale_price(6).unwrap());
        m.floor_out = SALE_SUPPLY;
        m.curve_out = CURVE_MAX;
        m.graduated = true;
        m.floor_reserve = u64::MAX / 4;
        m.premium_reserve = m.premium(CURVE_MAX, true).unwrap();
        m.raise_floor().unwrap();
        assert!(m.floor_reserve >= m.floor_liability().unwrap());
        let q = m.quote_sell(MAX_WALLET).unwrap();
        assert!(q.net > 0);
        // 9-decimal and 18-decimal stablecoins get a usable sale price too
        assert!(sale_price(9).is_some());
        assert_eq!(sale_price(18).unwrap(), 100_000_000_000_000_000_000_000_000);
    }
}

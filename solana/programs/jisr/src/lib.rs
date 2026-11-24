//! Jisr launchpad for Solana.
//!
//! Same rules as the EVM contracts (`CoinMarket.sol`), with the pricing done by the `jisr-math` crate:
//!   * every coin is sold at one fixed price, and the money stays in the coin's own stablecoin vault;
//!   * the vault can always buy back every outstanding coin at the floor price;
//!   * after the sale sells out, the fee that stays in the vault lifts the floor, which never falls;
//!   * 5% fee on every trade: 1% creator, 2% launchpad, 2% stays in the vault.
//!
//! Who controls what:
//!   * A coin's vaults are owned by its `Market` account, a program-derived address with no private key.
//!     Stablecoins leave only to a seller (by formula), to the creator (the 1%) and to the platform
//!     wallet (the 2%). There is no instruction that withdraws anything else.
//!   * The coin's mint authority is removed in the same instruction that creates it, and it never has a
//!     freeze authority.
//!   * The admin recorded in `Config` can change the platform wallet and hand the admin role on. Nothing else.
//!   * For "nobody can change the rules" to hold, the program's upgrade authority must be removed after
//!     deployment. Until then, whoever holds it can replace this code.
//!
//! Wallets and explorers learn a coin's name and ticker from a Metaplex metadata account. `create_coin`
//! writes it once, marked unchangeable, with the market's address as its authority: an address with no
//! private key. Nobody can edit it afterwards.
//!
//! Paying with SOL is done by the app, not here: it puts a swap (SOL to the stablecoin) and `buy` in one
//! transaction, so both succeed or neither does. This program only ever touches the stablecoin.

use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::{AccountMeta, Instruction};
use anchor_lang::solana_program::program::invoke_signed;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::spl_token::instruction::AuthorityType;
use anchor_spl::token::{self, Mint, MintTo, SetAuthority, Token, TokenAccount, Transfer};
use jisr_math::{MathError, COIN_DECIMALS, MAX_WALLET, TOTAL_SUPPLY};

declare_id!("5cbX2QdxMq948ySWxF6yHruKFtpp5Kf8WGA1wb3BaKC8");

pub const CONFIG_SEED: &[u8] = b"config";
pub const COIN_SEED: &[u8] = b"coin";
pub const MARKET_SEED: &[u8] = b"market";

/// The Metaplex Token Metadata program, which wallets and explorers read a token's name from.
pub mod metaplex {
    use anchor_lang::prelude::Pubkey;
    pub const ID: Pubkey = anchor_lang::solana_program::pubkey!("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
}
pub const METADATA_SEED: &[u8] = b"metadata";
/// Metaplex accepts a link of at most 200 bytes.
pub const MAX_METADATA_URI: usize = 200;

#[program]
pub mod jisr {
    use super::*;

    /// One-time setup. Records the stablecoin, the platform wallet and the admin.
    /// Send this in the same transaction that deploys the program, so nobody else can call it first.
    pub fn initialize(ctx: Context<Initialize>, platform_wallet: Pubkey) -> Result<()> {
        let sale_price = jisr_math::sale_price(ctx.accounts.stable_mint.decimals).ok_or(JisrError::Overflow)?;
        require!(sale_price > 0, JisrError::UnsupportedStablecoin);
        let config = &mut ctx.accounts.config;
        config.admin = ctx.accounts.admin.key();
        config.pending_admin = Pubkey::default();
        config.platform_wallet = platform_wallet;
        config.stable_mint = ctx.accounts.stable_mint.key();
        config.sale_price = sale_price;
        config.coin_count = 0;
        config.bump = ctx.bumps.config;
        Ok(())
    }

    /// Change the wallet that receives the launchpad's 2% fee. Admin only.
    pub fn set_platform_wallet(ctx: Context<AdminOnly>, new_wallet: Pubkey) -> Result<()> {
        ctx.accounts.config.platform_wallet = new_wallet;
        emit!(PlatformWalletChanged { new_wallet });
        Ok(())
    }

    /// Name the next admin. They take over only when they call `accept_admin`.
    pub fn propose_admin(ctx: Context<AdminOnly>, new_admin: Pubkey) -> Result<()> {
        ctx.accounts.config.pending_admin = new_admin;
        Ok(())
    }

    pub fn accept_admin(ctx: Context<AcceptAdmin>) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.admin = ctx.accounts.new_admin.key();
        config.pending_admin = Pubkey::default();
        Ok(())
    }

    /// Launch a coin. The caller becomes its creator and earns the 1% creator fee.
    /// The creator receives no coins. The whole supply is minted to the market's vault and the
    /// mint authority is removed before this instruction ends.
    ///
    /// `uri` is the coin's details as the Jisr page stores them. `metadata_uri` is the link written into the
    /// coin's Metaplex metadata, where wallets look for its picture; it may be empty.
    ///
    /// With `metadata_uri` absent, no Metaplex metadata is written at all. The Metaplex program belongs to
    /// someone else and can be changed by them; this program cannot be changed. If that program ever stops
    /// accepting this call, coins can still be launched without it, and trading never depends on it.
    pub fn create_coin(ctx: Context<CreateCoin>, name: String, symbol: String, uri: String, metadata_uri: Option<String>) -> Result<()> {
        require!(
            (2..=32).contains(&name.len())
                && (2..=10).contains(&symbol.len())
                && uri.len() <= 400
                && metadata_uri.as_ref().map_or(true, |link| link.len() <= MAX_METADATA_URI),
            JisrError::BadName
        );

        let coin_mint = ctx.accounts.coin_mint.key();
        let index = ctx.accounts.config.coin_count;
        let market = &mut ctx.accounts.market;
        market.creator = ctx.accounts.creator.key();
        market.coin_mint = coin_mint;
        market.index = index;
        market.sale_price = ctx.accounts.config.sale_price;
        market.floor_price = ctx.accounts.config.sale_price;
        market.floor_out = 0;
        market.curve_out = 0;
        market.floor_reserve = 0;
        market.premium_reserve = 0;
        market.creator_fees = 0;
        market.platform_fees = 0;
        market.graduated = false;
        market.bump = ctx.bumps.market;
        market.name = name.clone();
        market.symbol = symbol.clone();
        market.uri = uri;

        let bump = [market.bump];
        let seeds: &[&[u8]] = &[MARKET_SEED, coin_mint.as_ref(), &bump];
        token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                MintTo { mint: ctx.accounts.coin_mint.to_account_info(), to: ctx.accounts.coin_vault.to_account_info(), authority: ctx.accounts.market.to_account_info() },
                &[seeds],
            ),
            TOTAL_SUPPLY,
        )?;

        // The coin's name and ticker for wallets and explorers. Metaplex requires the mint authority to sign,
        // so this happens before that authority is removed. Marked unchangeable; no royalty, no creators.
        if let Some(metadata_uri) = metadata_uri.as_deref() {
            let mut data = Vec::with_capacity(32 + name.len() + symbol.len() + metadata_uri.len());
            data.push(33u8); // Metaplex instruction: CreateMetadataAccountV3
            for text in [name.as_str(), symbol.as_str(), metadata_uri] {
                data.extend_from_slice(&(text.len() as u32).to_le_bytes());
                data.extend_from_slice(text.as_bytes());
            }
            data.extend_from_slice(&0u16.to_le_bytes()); // seller fee: none
            data.push(0); // creators: none
            data.push(0); // collection: none
            data.push(0); // uses: none
            data.push(0); // is_mutable: false
            data.push(0); // collection details: none
            let market_key = ctx.accounts.market.key();
            let create_metadata = Instruction {
                program_id: metaplex::ID,
                accounts: vec![
                    AccountMeta::new(ctx.accounts.metadata.key(), false),
                    AccountMeta::new_readonly(coin_mint, false),
                    AccountMeta::new_readonly(market_key, true), // mint authority
                    AccountMeta::new(ctx.accounts.creator.key(), true), // pays the account's rent and Metaplex's fee
                    AccountMeta::new_readonly(market_key, false), // update authority: the market, which has no key
                    AccountMeta::new_readonly(ctx.accounts.system_program.key(), false),
                ],
                data,
            };
            invoke_signed(
                &create_metadata,
                &[
                    ctx.accounts.metadata.to_account_info(),
                    ctx.accounts.coin_mint.to_account_info(),
                    ctx.accounts.market.to_account_info(),
                    ctx.accounts.creator.to_account_info(),
                    ctx.accounts.system_program.to_account_info(),
                ],
                &[seeds],
            )?;
        }

        token::set_authority(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                SetAuthority { current_authority: ctx.accounts.market.to_account_info(), account_or_mint: ctx.accounts.coin_mint.to_account_info() },
                &[seeds],
            ),
            AuthorityType::MintTokens,
            None,
        )?;

        ctx.accounts.config.coin_count = index.checked_add(1).ok_or(JisrError::Overflow)?;
        emit!(CoinCreated { creator: ctx.accounts.creator.key(), coin_mint, market: ctx.accounts.market.key(), index, name, symbol });
        Ok(())
    }

    /// Buy exactly `coins_out` coins. `max_stable_in` is the most the buyer agrees to pay, fees included.
    pub fn buy(ctx: Context<Buy>, coins_out: u64, max_stable_in: u64) -> Result<()> {
        let mut m = ctx.accounts.market.math();
        let q = m.quote_buy(coins_out).map_err(JisrError::from)?;
        require!(q.total <= max_stable_in, JisrError::Slippage);
        let held_after = ctx.accounts.buyer_coin.amount.checked_add(coins_out).ok_or(JisrError::Overflow)?;
        require!(held_after <= MAX_WALLET, JisrError::WalletLimit);

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer { from: ctx.accounts.buyer_stable.to_account_info(), to: ctx.accounts.stable_vault.to_account_info(), authority: ctx.accounts.buyer.to_account_info() },
            ),
            q.total,
        )?;

        let floor_before = m.floor_price;
        let graduated_now = m.apply_buy(&q).map_err(JisrError::from)?;
        ctx.accounts.market.store(&m);

        let coin_mint = ctx.accounts.market.coin_mint;
        let bump = [ctx.accounts.market.bump];
        let seeds: &[&[u8]] = &[MARKET_SEED, coin_mint.as_ref(), &bump];
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer { from: ctx.accounts.coin_vault.to_account_info(), to: ctx.accounts.buyer_coin.to_account_info(), authority: ctx.accounts.market.to_account_info() },
                &[seeds],
            ),
            coins_out,
        )?;

        emit!(Bought { market: ctx.accounts.market.key(), buyer: ctx.accounts.buyer.key(), coins: coins_out, stable_paid: q.total });
        if graduated_now {
            emit!(Graduated { market: ctx.accounts.market.key(), floor_reserve: m.floor_reserve });
        }
        if m.floor_price > floor_before {
            emit!(FloorRaised { market: ctx.accounts.market.key(), floor_price: m.floor_price });
        }
        Ok(())
    }

    /// Sell `coins_in` coins. The stablecoin is paid to `recipient_stable`, which may belong to anyone.
    pub fn sell(ctx: Context<Sell>, coins_in: u64, min_stable_out: u64) -> Result<()> {
        let mut m = ctx.accounts.market.math();
        let q = m.quote_sell(coins_in).map_err(JisrError::from)?;
        require!(q.net >= min_stable_out, JisrError::Slippage);

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer { from: ctx.accounts.seller_coin.to_account_info(), to: ctx.accounts.coin_vault.to_account_info(), authority: ctx.accounts.seller.to_account_info() },
            ),
            coins_in,
        )?;

        let floor_before = m.floor_price;
        m.apply_sell(&q).map_err(JisrError::from)?;
        ctx.accounts.market.store(&m);

        let coin_mint = ctx.accounts.market.coin_mint;
        let bump = [ctx.accounts.market.bump];
        let seeds: &[&[u8]] = &[MARKET_SEED, coin_mint.as_ref(), &bump];
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer { from: ctx.accounts.stable_vault.to_account_info(), to: ctx.accounts.recipient_stable.to_account_info(), authority: ctx.accounts.market.to_account_info() },
                &[seeds],
            ),
            q.net,
        )?;

        emit!(Sold { market: ctx.accounts.market.key(), seller: ctx.accounts.seller.key(), coins: coins_in, stable_out: q.net });
        if m.floor_price > floor_before {
            emit!(FloorRaised { market: ctx.accounts.market.key(), floor_price: m.floor_price });
        }
        Ok(())
    }

    /// Pay the creator the 1% fees collected so far. Anyone may call; the money goes to the creator.
    pub fn claim_creator_fees(ctx: Context<ClaimCreatorFees>) -> Result<()> {
        let amount = ctx.accounts.market.creator_fees;
        ctx.accounts.market.creator_fees = 0;
        pay_from_vault(&ctx.accounts.market, &ctx.accounts.stable_vault, &ctx.accounts.creator_stable, &ctx.accounts.token_program, amount)
    }

    /// Pay the launchpad the 2% fees collected so far. Anyone may call; the money goes to the platform wallet.
    pub fn sweep_platform_fees(ctx: Context<SweepPlatformFees>) -> Result<()> {
        let amount = ctx.accounts.market.platform_fees;
        ctx.accounts.market.platform_fees = 0;
        pay_from_vault(&ctx.accounts.market, &ctx.accounts.stable_vault, &ctx.accounts.platform_stable, &ctx.accounts.token_program, amount)
    }

    /// Add any stablecoin sent to the vault outside a trade to the floor reserve. It can only grow the reserve.
    pub fn reinforce(ctx: Context<Reinforce>) -> Result<()> {
        let mut m = ctx.accounts.market.math();
        let accounted = m.accounted().map_err(JisrError::from)?;
        let surplus = ctx.accounts.stable_vault.amount.saturating_sub(accounted);
        if surplus > 0 {
            let floor_before = m.floor_price;
            m.reinforce(surplus).map_err(JisrError::from)?;
            ctx.accounts.market.store(&m);
            if m.floor_price > floor_before {
                emit!(FloorRaised { market: ctx.accounts.market.key(), floor_price: m.floor_price });
            }
        }
        Ok(())
    }
}

fn pay_from_vault<'info>(
    market: &Account<'info, Market>,
    vault: &Account<'info, TokenAccount>,
    to: &Account<'info, TokenAccount>,
    token_program: &Program<'info, Token>,
    amount: u64,
) -> Result<()> {
    if amount == 0 {
        return Ok(());
    }
    let bump = [market.bump];
    let seeds: &[&[u8]] = &[MARKET_SEED, market.coin_mint.as_ref(), &bump];
    token::transfer(
        CpiContext::new_with_signer(
            token_program.to_account_info(),
            Transfer { from: vault.to_account_info(), to: to.to_account_info(), authority: market.to_account_info() },
            &[seeds],
        ),
        amount,
    )
}

// ------------------------------------------------------------------ state

#[account]
#[derive(InitSpace)]
pub struct Config {
    /// May change `platform_wallet` and hand the admin role on. Nothing else.
    pub admin: Pubkey,
    pub pending_admin: Pubkey,
    /// Owner of the token account that receives the launchpad's 2% fee.
    pub platform_wallet: Pubkey,
    /// The stablecoin every coin is priced and reserved in. Fixed forever.
    pub stable_mint: Pubkey,
    /// $0.0001 a coin, in `jisr-math` price format. Fixed forever.
    pub sale_price: u128,
    pub coin_count: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Market {
    pub creator: Pubkey,
    pub coin_mint: Pubkey,
    pub index: u64,
    pub sale_price: u128,
    pub floor_price: u128,
    pub floor_out: u64,
    pub curve_out: u64,
    pub floor_reserve: u64,
    pub premium_reserve: u64,
    pub creator_fees: u64,
    pub platform_fees: u64,
    pub graduated: bool,
    pub bump: u8,
    #[max_len(32)]
    pub name: String,
    #[max_len(10)]
    pub symbol: String,
    #[max_len(400)]
    pub uri: String,
}

impl Market {
    pub fn math(&self) -> jisr_math::Market {
        jisr_math::Market {
            sale_price: self.sale_price,
            floor_price: self.floor_price,
            floor_out: self.floor_out,
            curve_out: self.curve_out,
            floor_reserve: self.floor_reserve,
            premium_reserve: self.premium_reserve,
            creator_fees: self.creator_fees,
            platform_fees: self.platform_fees,
            graduated: self.graduated,
        }
    }

    pub fn store(&mut self, m: &jisr_math::Market) {
        self.floor_price = m.floor_price;
        self.floor_out = m.floor_out;
        self.curve_out = m.curve_out;
        self.floor_reserve = m.floor_reserve;
        self.premium_reserve = m.premium_reserve;
        self.creator_fees = m.creator_fees;
        self.platform_fees = m.platform_fees;
        self.graduated = m.graduated;
    }
}

// ------------------------------------------------------------------ accounts

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(init, payer = admin, space = 8 + Config::INIT_SPACE, seeds = [CONFIG_SEED], bump)]
    pub config: Account<'info, Config>,
    pub stable_mint: Account<'info, Mint>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AdminOnly<'info> {
    pub admin: Signer<'info>,
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump, has_one = admin @ JisrError::NotAdmin)]
    pub config: Account<'info, Config>,
}

#[derive(Accounts)]
pub struct AcceptAdmin<'info> {
    pub new_admin: Signer<'info>,
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump, constraint = config.pending_admin == new_admin.key() @ JisrError::NotAdmin)]
    pub config: Account<'info, Config>,
}

#[derive(Accounts)]
pub struct CreateCoin<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(address = config.stable_mint)]
    pub stable_mint: Box<Account<'info, Mint>>,
    /// The new coin. Its address is derived from the coin's number, so coins can be listed by counting.
    #[account(init, payer = creator, seeds = [COIN_SEED, &config.coin_count.to_le_bytes()], bump, mint::decimals = COIN_DECIMALS, mint::authority = market)]
    pub coin_mint: Box<Account<'info, Mint>>,
    #[account(init, payer = creator, space = 8 + Market::INIT_SPACE, seeds = [MARKET_SEED, coin_mint.key().as_ref()], bump)]
    pub market: Box<Account<'info, Market>>,
    #[account(init, payer = creator, associated_token::mint = coin_mint, associated_token::authority = market)]
    pub coin_vault: Box<Account<'info, TokenAccount>>,
    /// The market's stablecoin account. Its address is known before the coin exists, and anyone may create
    /// a token account for any owner, so it is accepted if it is already there. With plain `init`, a
    /// stranger who created it first would block this coin number, and with it every later launch.
    /// It can only be the market's own standard account: the mint, the owner and the address are checked.
    /// Whatever it already holds is a gift that `reinforce` adds to the floor reserve.
    #[account(init_if_needed, payer = creator, associated_token::mint = stable_mint, associated_token::authority = market)]
    pub stable_vault: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    /// CHECK: The coin's Metaplex metadata account. It does not exist yet; the Metaplex program creates it
    /// and refuses any address but the one derived from the mint. The address is also checked here.
    /// Left untouched when the launch asks for no wallet metadata.
    #[account(mut, seeds = [METADATA_SEED, metaplex::ID.as_ref(), coin_mint.key().as_ref()], bump, seeds::program = metaplex::ID)]
    pub metadata: UncheckedAccount<'info>,
    /// CHECK: The Metaplex Token Metadata program. Only this one address is accepted. It is called only when
    /// the launch asks for wallet metadata.
    #[account(address = metaplex::ID)]
    pub metadata_program: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct Buy<'info> {
    pub buyer: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(mut, seeds = [MARKET_SEED, market.coin_mint.as_ref()], bump = market.bump)]
    pub market: Box<Account<'info, Market>>,
    #[account(mut, associated_token::mint = market.coin_mint, associated_token::authority = market)]
    pub coin_vault: Box<Account<'info, TokenAccount>>,
    #[account(mut, associated_token::mint = config.stable_mint, associated_token::authority = market)]
    pub stable_vault: Box<Account<'info, TokenAccount>>,
    #[account(mut, token::mint = config.stable_mint, token::authority = buyer)]
    pub buyer_stable: Box<Account<'info, TokenAccount>>,
    /// The buyer's one canonical account for this coin, so the 2.5% limit is counted per wallet.
    #[account(mut, associated_token::mint = market.coin_mint, associated_token::authority = buyer)]
    pub buyer_coin: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Sell<'info> {
    pub seller: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(mut, seeds = [MARKET_SEED, market.coin_mint.as_ref()], bump = market.bump)]
    pub market: Box<Account<'info, Market>>,
    #[account(mut, associated_token::mint = market.coin_mint, associated_token::authority = market)]
    pub coin_vault: Box<Account<'info, TokenAccount>>,
    #[account(mut, associated_token::mint = config.stable_mint, associated_token::authority = market)]
    pub stable_vault: Box<Account<'info, TokenAccount>>,
    #[account(mut, token::mint = market.coin_mint, token::authority = seller)]
    pub seller_coin: Box<Account<'info, TokenAccount>>,
    #[account(mut, token::mint = config.stable_mint)]
    pub recipient_stable: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct ClaimCreatorFees<'info> {
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(mut, seeds = [MARKET_SEED, market.coin_mint.as_ref()], bump = market.bump)]
    pub market: Box<Account<'info, Market>>,
    #[account(mut, associated_token::mint = config.stable_mint, associated_token::authority = market)]
    pub stable_vault: Box<Account<'info, TokenAccount>>,
    #[account(mut, token::mint = config.stable_mint, token::authority = market.creator)]
    pub creator_stable: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct SweepPlatformFees<'info> {
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(mut, seeds = [MARKET_SEED, market.coin_mint.as_ref()], bump = market.bump)]
    pub market: Box<Account<'info, Market>>,
    #[account(mut, associated_token::mint = config.stable_mint, associated_token::authority = market)]
    pub stable_vault: Box<Account<'info, TokenAccount>>,
    #[account(mut, token::mint = config.stable_mint, token::authority = config.platform_wallet)]
    pub platform_stable: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Reinforce<'info> {
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(mut, seeds = [MARKET_SEED, market.coin_mint.as_ref()], bump = market.bump)]
    pub market: Box<Account<'info, Market>>,
    #[account(associated_token::mint = config.stable_mint, associated_token::authority = market)]
    pub stable_vault: Box<Account<'info, TokenAccount>>,
}

// ------------------------------------------------------------------ events and errors

#[event]
pub struct CoinCreated {
    pub creator: Pubkey,
    pub coin_mint: Pubkey,
    pub market: Pubkey,
    pub index: u64,
    pub name: String,
    pub symbol: String,
}

#[event]
pub struct Bought {
    pub market: Pubkey,
    pub buyer: Pubkey,
    pub coins: u64,
    pub stable_paid: u64,
}

#[event]
pub struct Sold {
    pub market: Pubkey,
    pub seller: Pubkey,
    pub coins: u64,
    pub stable_out: u64,
}

#[event]
pub struct Graduated {
    pub market: Pubkey,
    pub floor_reserve: u64,
}

#[event]
pub struct FloorRaised {
    pub market: Pubkey,
    pub floor_price: u128,
}

#[event]
pub struct PlatformWalletChanged {
    pub new_wallet: Pubkey,
}

#[error_code]
pub enum JisrError {
    #[msg("Enter an amount greater than zero")]
    ZeroAmount,
    #[msg("The price moved past the limit you set")]
    Slippage,
    #[msg("The coins above the floor are sold out")]
    SoldOut,
    #[msg("More coins offered than are outstanding")]
    NotOutstanding,
    #[msg("One wallet can hold 2.5% of supply at most")]
    WalletLimit,
    #[msg("Name must be 2 to 32 bytes, symbol 2 to 10, details up to 400, metadata link up to 200")]
    BadName,
    #[msg("Only the admin can do this")]
    NotAdmin,
    #[msg("This stablecoin's decimals are not supported")]
    UnsupportedStablecoin,
    #[msg("Arithmetic overflow")]
    Overflow,
}

impl From<MathError> for JisrError {
    fn from(e: MathError) -> Self {
        match e {
            MathError::ZeroAmount => JisrError::ZeroAmount,
            MathError::SoldOut => JisrError::SoldOut,
            MathError::NotOutstanding => JisrError::NotOutstanding,
            MathError::Overflow => JisrError::Overflow,
        }
    }
}

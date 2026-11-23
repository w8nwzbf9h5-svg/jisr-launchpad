//! Runs the program's real instructions against the SPL Token program in an in-process bank.
use anchor_lang::prelude::*;
use anchor_lang::{AccountDeserialize, InstructionData, ToAccountMetas};
use anchor_spl::associated_token::{get_associated_token_address, spl_associated_token_account};
use anchor_spl::token::spl_token;
use jisr_math::{COIN, MAX_WALLET, TOTAL_SUPPLY};
use solana_program_test::*;
use solana_sdk::instruction::Instruction;
use solana_sdk::program_pack::Pack;
use solana_sdk::signature::{Keypair, Signer};
use solana_sdk::transaction::Transaction;

const USD: u64 = 1_000_000;
const M: u64 = 1_000_000 * COIN;

/// Anchor wants one lifetime for the account slice and its contents; the test bank passes two.
fn entry<'a, 'b, 'c, 'd>(program_id: &'a Pubkey, accounts: &'b [AccountInfo<'c>], data: &'d [u8]) -> anchor_lang::solana_program::entrypoint::ProgramResult {
    let accounts: &'c [AccountInfo<'c>] = Box::leak(Box::new(accounts.to_vec()));
    jisr::entry(program_id, accounts, data)
}

struct Env {
    banks: BanksClient,
    payer: Keypair,
    stable_mint: Pubkey,
    config: Pubkey,
    /// Counts transactions, so that two with the same instructions are still different transactions.
    nonce: u64,
}

struct Coin {
    mint: Pubkey,
    market: Pubkey,
    coin_vault: Pubkey,
    stable_vault: Pubkey,
}

impl Env {
    async fn new() -> Env {
        let mut pt = ProgramTest::new("jisr", jisr::ID, processor!(entry));
        pt.prefer_bpf(false);
        let (banks, payer, _) = pt.start().await;
        let stable = Keypair::new();
        let config = Pubkey::find_program_address(&[jisr::CONFIG_SEED], &jisr::ID).0;
        let mut env = Env { banks, payer, stable_mint: stable.pubkey(), config, nonce: 0 };
        let rent = env.banks.get_rent().await.unwrap().minimum_balance(spl_token::state::Mint::LEN);
        let payer_pk = env.payer.pubkey();
        let ixs = vec![
            solana_sdk::system_instruction::create_account(&payer_pk, &stable.pubkey(), rent, spl_token::state::Mint::LEN as u64, &spl_token::id()),
            spl_token::instruction::initialize_mint2(&spl_token::id(), &stable.pubkey(), &payer_pk, None, 6).unwrap(),
        ];
        env.send(ixs, &[&stable]).await.unwrap();
        env
    }

    async fn send(&mut self, ixs: Vec<Instruction>, signers: &[&Keypair]) -> std::result::Result<(), BanksClientError> {
        let hash = self.banks.get_latest_blockhash().await.unwrap();
        // The test bank answers a repeated transaction with the result of the first one. This test sends the
        // same instruction before and after a change and expects different results, so every transaction
        // carries a tiny self-transfer of a different amount to make it unique.
        self.nonce += 1;
        let mut ixs = ixs;
        ixs.push(solana_sdk::system_instruction::transfer(&self.payer.pubkey(), &self.payer.pubkey(), self.nonce));
        let mut all: Vec<&Keypair> = vec![&self.payer];
        all.extend_from_slice(signers);
        let tx = Transaction::new_signed_with_payer(&ixs, Some(&self.payer.pubkey()), &all, hash);
        self.banks.process_transaction(tx).await
    }

    /// A wallet with SOL for fees and `dollars` of the stablecoin.
    async fn user(&mut self, dollars: u64) -> Keypair {
        let kp = Keypair::new();
        let payer = self.payer.pubkey();
        let ata = get_associated_token_address(&kp.pubkey(), &self.stable_mint);
        let ixs = vec![
            solana_sdk::system_instruction::transfer(&payer, &kp.pubkey(), 1_000_000_000),
            spl_associated_token_account::instruction::create_associated_token_account(&payer, &kp.pubkey(), &self.stable_mint, &spl_token::id()),
            spl_token::instruction::mint_to(&spl_token::id(), &self.stable_mint, &ata, &payer, &[], dollars * USD).unwrap(),
        ];
        self.send(ixs, &[]).await.unwrap();
        kp
    }

    async fn initialize(&mut self, admin: &Keypair, platform_wallet: Pubkey) {
        let ix = Instruction {
            program_id: jisr::ID,
            accounts: jisr::accounts::Initialize { admin: admin.pubkey(), config: self.config, stable_mint: self.stable_mint, system_program: solana_sdk::system_program::id() }.to_account_metas(None),
            data: jisr::instruction::Initialize { platform_wallet }.data(),
        };
        self.send(vec![ix], &[admin]).await.unwrap();
    }

    async fn create_coin(&mut self, creator: &Keypair, name: &str, symbol: &str) -> std::result::Result<Coin, BanksClientError> {
        let cfg: jisr::Config = self.load(self.config).await;
        let mint = Pubkey::find_program_address(&[jisr::COIN_SEED, &cfg.coin_count.to_le_bytes()], &jisr::ID).0;
        let market = Pubkey::find_program_address(&[jisr::MARKET_SEED, mint.as_ref()], &jisr::ID).0;
        let coin = Coin { mint, market, coin_vault: get_associated_token_address(&market, &mint), stable_vault: get_associated_token_address(&market, &self.stable_mint) };
        let ix = Instruction {
            program_id: jisr::ID,
            accounts: jisr::accounts::CreateCoin {
                creator: creator.pubkey(), config: self.config, stable_mint: self.stable_mint, coin_mint: mint, market,
                coin_vault: coin.coin_vault, stable_vault: coin.stable_vault,
                token_program: spl_token::id(), associated_token_program: spl_associated_token_account::id(), system_program: solana_sdk::system_program::id(),
            }.to_account_metas(None),
            data: jisr::instruction::CreateCoin { name: name.into(), symbol: symbol.into(), uri: "".into() }.data(),
        };
        self.send(vec![ix], &[creator]).await.map(|_| coin)
    }

    async fn buy(&mut self, coin: &Coin, buyer: &Keypair, coins_out: u64, max_in: u64) -> std::result::Result<(), BanksClientError> {
        let buyer_coin = get_associated_token_address(&buyer.pubkey(), &coin.mint);
        let mut ixs = vec![];
        if self.banks.get_account(buyer_coin).await.unwrap().is_none() {
            ixs.push(spl_associated_token_account::instruction::create_associated_token_account(&self.payer.pubkey(), &buyer.pubkey(), &coin.mint, &spl_token::id()));
        }
        ixs.push(Instruction {
            program_id: jisr::ID,
            accounts: jisr::accounts::Buy {
                buyer: buyer.pubkey(), config: self.config, market: coin.market, coin_vault: coin.coin_vault, stable_vault: coin.stable_vault,
                buyer_stable: get_associated_token_address(&buyer.pubkey(), &self.stable_mint), buyer_coin, token_program: spl_token::id(),
            }.to_account_metas(None),
            data: jisr::instruction::Buy { coins_out, max_stable_in: max_in }.data(),
        });
        self.send(ixs, &[buyer]).await
    }

    async fn sell_to(&mut self, coin: &Coin, seller: &Keypair, coins_in: u64, min_out: u64, recipient_stable: Pubkey) -> std::result::Result<(), BanksClientError> {
        let ix = Instruction {
            program_id: jisr::ID,
            accounts: jisr::accounts::Sell {
                seller: seller.pubkey(), config: self.config, market: coin.market, coin_vault: coin.coin_vault, stable_vault: coin.stable_vault,
                seller_coin: get_associated_token_address(&seller.pubkey(), &coin.mint), recipient_stable, token_program: spl_token::id(),
            }.to_account_metas(None),
            data: jisr::instruction::Sell { coins_in, min_stable_out: min_out }.data(),
        };
        self.send(vec![ix], &[seller]).await
    }

    async fn sell(&mut self, coin: &Coin, seller: &Keypair, coins_in: u64) -> std::result::Result<(), BanksClientError> {
        let to = get_associated_token_address(&seller.pubkey(), &self.stable_mint);
        self.sell_to(coin, seller, coins_in, 0, to).await
    }

    async fn load<T: AccountDeserialize>(&mut self, key: Pubkey) -> T {
        let acc = self.banks.get_account(key).await.unwrap().expect("account exists");
        T::try_deserialize(&mut acc.data.as_slice()).unwrap()
    }

    async fn tokens(&mut self, account: Pubkey) -> u64 {
        match self.banks.get_account(account).await.unwrap() {
            Some(a) => spl_token::state::Account::unpack(&a.data).unwrap().amount,
            None => 0,
        }
    }

    async fn stable_of(&mut self, wallet: &Pubkey) -> u64 {
        let mint = self.stable_mint;
        self.tokens(get_associated_token_address(wallet, &mint)).await
    }

    /// The vault must hold everything the market owes, and the floor reserve must cover every coin.
    async fn check(&mut self, coin: &Coin) -> jisr::Market {
        let m: jisr::Market = self.load(coin.market).await;
        let math = m.math();
        assert!(self.tokens(coin.stable_vault).await >= math.accounted().unwrap(), "vault holds less than the market owes");
        assert!(math.floor_reserve >= math.floor_liability().unwrap(), "floor reserve cannot buy back every coin");
        assert_eq!(TOTAL_SUPPLY - self.tokens(coin.coin_vault).await, math.outstanding());
        m
    }
}

#[tokio::test]
async fn full_lifecycle_of_a_coin() {
    let mut env = Env::new().await;
    let admin = env.user(0).await;
    let platform = env.user(0).await;
    let creator = env.user(0).await;
    let alice = env.user(10_000).await;
    let bob = env.user(10_000).await;
    env.initialize(&admin, platform.pubkey()).await;

    // Launch: whole supply in the vault, nobody can mint more, nobody can freeze, creator holds nothing.
    let coin = env.create_coin(&creator, "Camel Cash", "HUMP").await.unwrap();
    assert_eq!(env.tokens(coin.coin_vault).await, TOTAL_SUPPLY);
    let mint_acc = env.banks.get_account(coin.mint).await.unwrap().unwrap();
    let mint = spl_token::state::Mint::unpack(&mint_acc.data).unwrap();
    assert!(mint.mint_authority.is_none(), "mint authority must be removed");
    assert!(mint.freeze_authority.is_none(), "there must be no freeze authority");
    assert_eq!(mint.supply, TOTAL_SUPPLY);
    assert_eq!(env.tokens(get_associated_token_address(&creator.pubkey(), &coin.mint)).await, 0);
    let vault_acc = env.banks.get_account(coin.stable_vault).await.unwrap().unwrap();
    assert_eq!(spl_token::state::Account::unpack(&vault_acc.data).unwrap().owner, coin.market, "the vault belongs to the market PDA");
    assert!(env.create_coin(&creator, "x", "HUMP").await.is_err(), "a one-letter name is refused");

    // $1,000 buys 9.5M coins; a later buyer pays the same; selling back returns $902.50.
    let coins = 9_500_000 * COIN;
    assert!(env.buy(&coin, &alice, coins, 999 * USD).await.is_err(), "price limit is enforced");
    env.buy(&coin, &alice, coins, 1000 * USD).await.unwrap();
    assert_eq!(env.stable_of(&alice.pubkey()).await, 9_000 * USD);
    assert_eq!(env.tokens(get_associated_token_address(&alice.pubkey(), &coin.mint)).await, coins);
    let m = env.check(&coin).await;
    assert_eq!((m.floor_reserve, m.creator_fees, m.platform_fees), (970 * USD, 10 * USD, 20 * USD));
    env.buy(&coin, &bob, coins, 1000 * USD).await.unwrap();
    assert_eq!(env.stable_of(&bob.pubkey()).await, 9_000 * USD);
    let alice_stable = get_associated_token_address(&alice.pubkey(), &env.stable_mint);
    assert!(env.sell_to(&coin, &alice, coins, 903 * USD, alice_stable).await.is_err(), "minimum payout is enforced");
    env.sell(&coin, &alice, coins).await.unwrap();
    assert_eq!(env.stable_of(&alice.pubkey()).await, 9_000 * USD + 902_500_000);
    env.check(&coin).await;

    // The 2.5% wallet limit.
    assert!(env.buy(&coin, &alice, MAX_WALLET + 1, u64::MAX).await.is_err(), "more than 2.5% is refused");
    env.buy(&coin, &alice, MAX_WALLET, u64::MAX).await.unwrap();
    assert!(env.buy(&coin, &alice, 1, u64::MAX).await.is_err(), "a full wallet cannot buy more");
    env.check(&coin).await;

    // Fees: anyone can trigger, only the creator and the platform wallet can be paid.
    let m = env.check(&coin).await;
    let (creator_owed, platform_owed) = (m.creator_fees, m.platform_fees);
    assert!(creator_owed > 0 && platform_owed > 0);
    let claim = |to: Pubkey, env: &Env| Instruction {
        program_id: jisr::ID,
        accounts: jisr::accounts::ClaimCreatorFees { config: env.config, market: coin.market, stable_vault: coin.stable_vault, creator_stable: to, token_program: spl_token::id() }.to_account_metas(None),
        data: jisr::instruction::ClaimCreatorFees {}.data(),
    };
    let sweep = |to: Pubkey, env: &Env| Instruction {
        program_id: jisr::ID,
        accounts: jisr::accounts::SweepPlatformFees { config: env.config, market: coin.market, stable_vault: coin.stable_vault, platform_stable: to, token_program: spl_token::id() }.to_account_metas(None),
        data: jisr::instruction::SweepPlatformFees {}.data(),
    };
    let bob_stable = get_associated_token_address(&bob.pubkey(), &env.stable_mint);
    let creator_stable = get_associated_token_address(&creator.pubkey(), &env.stable_mint);
    let platform_stable = get_associated_token_address(&platform.pubkey(), &env.stable_mint);
    let ix = claim(bob_stable, &env);
    assert!(env.send(vec![ix], &[]).await.is_err(), "creator fees cannot be sent to someone else");
    let ix = sweep(bob_stable, &env);
    assert!(env.send(vec![ix], &[]).await.is_err(), "platform fees cannot be sent to someone else");
    let ix = claim(creator_stable, &env);
    env.send(vec![ix], &[]).await.unwrap();
    let ix = sweep(platform_stable, &env);
    env.send(vec![ix], &[]).await.unwrap();
    assert_eq!(env.stable_of(&creator.pubkey()).await, creator_owed);
    assert_eq!(env.stable_of(&platform.pubkey()).await, platform_owed);
    let m = env.check(&coin).await;
    assert_eq!((m.creator_fees, m.platform_fees), (0, 0));

    // The admin can change the platform wallet; nobody else can.
    let set = |signer: Pubkey, new_wallet: Pubkey, env: &Env| Instruction {
        program_id: jisr::ID,
        accounts: jisr::accounts::AdminOnly { admin: signer, config: env.config }.to_account_metas(None),
        data: jisr::instruction::SetPlatformWallet { new_wallet }.data(),
    };
    let ix = set(bob.pubkey(), bob.pubkey(), &env);
    assert!(env.send(vec![ix], &[&bob]).await.is_err(), "a stranger cannot change the platform wallet");
    let ix = set(admin.pubkey(), bob.pubkey(), &env);
    env.send(vec![ix], &[&admin]).await.unwrap();
    let cfg: jisr::Config = env.load(env.config).await;
    assert_eq!(cfg.platform_wallet, bob.pubkey());
    env.buy(&coin, &bob, M, u64::MAX).await.unwrap();
    let ix = sweep(platform_stable, &env);
    assert!(env.send(vec![ix], &[]).await.is_err(), "the old platform wallet is no longer paid");
    let before = env.stable_of(&bob.pubkey()).await;
    let ix = sweep(bob_stable, &env);
    env.send(vec![ix], &[]).await.unwrap();
    assert!(env.stable_of(&bob.pubkey()).await > before);

    // Handing the admin role on takes two steps.
    let ix = Instruction {
        program_id: jisr::ID,
        accounts: jisr::accounts::AdminOnly { admin: admin.pubkey(), config: env.config }.to_account_metas(None),
        data: jisr::instruction::ProposeAdmin { new_admin: alice.pubkey() }.data(),
    };
    env.send(vec![ix], &[&admin]).await.unwrap();
    let accept = |who: Pubkey, env: &Env| Instruction {
        program_id: jisr::ID,
        accounts: jisr::accounts::AcceptAdmin { new_admin: who, config: env.config }.to_account_metas(None),
        data: jisr::instruction::AcceptAdmin {}.data(),
    };
    let ix = accept(bob.pubkey(), &env);
    assert!(env.send(vec![ix], &[&bob]).await.is_err(), "only the named admin can accept");
    let ix = accept(alice.pubkey(), &env);
    env.send(vec![ix], &[&alice]).await.unwrap();
    let cfg: jisr::Config = env.load(env.config).await;
    assert_eq!(cfg.admin, alice.pubkey());

    // Setup cannot be run twice.
    let ix = Instruction {
        program_id: jisr::ID,
        accounts: jisr::accounts::Initialize { admin: bob.pubkey(), config: env.config, stable_mint: env.stable_mint, system_program: solana_sdk::system_program::id() }.to_account_metas(None),
        data: jisr::instruction::Initialize { platform_wallet: bob.pubkey() }.data(),
    };
    assert!(env.send(vec![ix], &[&bob]).await.is_err(), "initialize runs once");
}

#[tokio::test]
async fn graduation_rising_floor_and_everyone_exits() {
    let mut env = Env::new().await;
    let admin = env.user(0).await;
    let platform = env.user(0).await;
    let creator = env.user(0).await;
    env.initialize(&admin, platform.pubkey()).await;
    let coin = env.create_coin(&creator, "Karak Chai", "KARAK").await.unwrap();
    // a second coin gets its own mint, market and vaults
    let other = env.create_coin(&creator, "Moon Falcon", "FALCN").await.unwrap();
    assert_ne!(coin.mint, other.mint);
    assert_ne!(coin.stable_vault, other.stable_vault);

    // 32 wallets buy 25M each: the sale sells out.
    let mut users = vec![];
    for _ in 0..36 {
        users.push(env.user(100_000).await);
    }
    for u in users.iter().take(32) {
        env.buy(&coin, u, MAX_WALLET, u64::MAX).await.unwrap();
    }
    let m = env.check(&coin).await;
    assert!(m.graduated);
    assert_eq!(m.floor_price * 10_000 / m.sale_price, 10_210, "the fees kept during the sale lift the floor about 2.1%");
    let other_m: jisr::Market = env.load(other.market).await;
    assert_eq!(other_m.floor_out, 0, "the other coin is untouched");

    // Coins above the floor: the price rises, then falls back to the floor and stops there.
    let floor = m.floor_price;
    for u in users.iter().skip(32).take(3) {
        env.buy(&coin, u, 20 * M, u64::MAX).await.unwrap();
    }
    let m = env.check(&coin).await;
    assert_eq!(m.curve_out, 60 * M);
    assert!(m.math().current_price().unwrap() > m.floor_price);
    for u in users.iter().skip(32).take(3) {
        env.sell(&coin, u, 20 * M).await.unwrap();
    }
    let m = env.check(&coin).await;
    assert_eq!(m.curve_out, 0);
    assert_eq!(m.math().current_price().unwrap(), m.floor_price);
    assert!(m.floor_price > floor, "trading lifted the floor");

    // A gift sent straight to the vault becomes floor reserve.
    let floor = m.floor_price;
    let gift = spl_token::instruction::transfer(&spl_token::id(), &get_associated_token_address(&users[35].pubkey(), &env.stable_mint), &coin.stable_vault, &users[35].pubkey(), &[], 8_000 * USD).unwrap();
    env.send(vec![gift], &[&users[35]]).await.unwrap();
    let ix = Instruction {
        program_id: jisr::ID,
        accounts: jisr::accounts::Reinforce { config: env.config, market: coin.market, stable_vault: coin.stable_vault }.to_account_metas(None),
        data: jisr::instruction::Reinforce {}.data(),
    };
    env.send(vec![ix], &[]).await.unwrap();
    let m = env.check(&coin).await;
    assert!(m.floor_price > floor);

    // Everyone leaves at the raised floor; every sale succeeds and pays more than the sale price did.
    let payout_at_sale_price = 2_500 * USD * 95 / 100;
    for u in users.iter().take(32) {
        let before = env.stable_of(&u.pubkey()).await;
        env.sell(&coin, u, MAX_WALLET).await.unwrap();
        assert!(env.stable_of(&u.pubkey()).await - before > payout_at_sale_price);
        env.check(&coin).await;
    }
    let m = env.check(&coin).await;
    assert_eq!(m.math().outstanding(), 0);
    assert_eq!(env.tokens(coin.coin_vault).await, TOTAL_SUPPLY);
}

/// Anyone can create a token account for any owner. A stranger who creates the next market's stablecoin
/// account before the coin is launched must not be able to block the launch.
#[tokio::test]
async fn a_vault_made_in_advance_cannot_block_a_launch() {
    let mut env = Env::new().await;
    let admin = env.user(0).await;
    let platform = env.user(0).await;
    let creator = env.user(0).await;
    let stranger = env.user(100).await;
    env.initialize(&admin, platform.pubkey()).await;

    // the stranger creates the vault of coin number 0 before that coin exists, and puts $5 in it
    let mint = Pubkey::find_program_address(&[jisr::COIN_SEED, &0u64.to_le_bytes()], &jisr::ID).0;
    let market = Pubkey::find_program_address(&[jisr::MARKET_SEED, mint.as_ref()], &jisr::ID).0;
    let vault = get_associated_token_address(&market, &env.stable_mint);
    let stranger_stable = get_associated_token_address(&stranger.pubkey(), &env.stable_mint);
    let ixs = vec![
        spl_associated_token_account::instruction::create_associated_token_account(&stranger.pubkey(), &market, &env.stable_mint, &spl_token::id()),
        spl_token::instruction::transfer(&spl_token::id(), &stranger_stable, &vault, &stranger.pubkey(), &[], 5 * USD).unwrap(),
    ];
    env.send(ixs, &[&stranger]).await.unwrap();
    assert_eq!(env.tokens(vault).await, 5 * USD);

    // the launch still works, and the account is the market's and nobody else's
    let coin = env.create_coin(&creator, "Camel Cash", "HUMP").await.unwrap();
    assert_eq!(coin.stable_vault, vault);
    let acc = env.banks.get_account(vault).await.unwrap().unwrap();
    let state = spl_token::state::Account::unpack(&acc.data).unwrap();
    assert_eq!(state.owner, coin.market, "the vault belongs to the market PDA");
    assert!(state.delegate.is_none() && state.close_authority.is_none(), "nobody else has any right over the vault");
    let m = env.check(&coin).await;
    assert_eq!(m.floor_reserve, 0, "money that was there before the launch is not counted until reinforce");

    // the $5 can only become floor reserve
    let ix = Instruction {
        program_id: jisr::ID,
        accounts: jisr::accounts::Reinforce { config: env.config, market: coin.market, stable_vault: coin.stable_vault }.to_account_metas(None),
        data: jisr::instruction::Reinforce {}.data(),
    };
    env.send(vec![ix], &[]).await.unwrap();
    let m = env.check(&coin).await;
    assert_eq!(m.floor_reserve, 5 * USD);

    // and the coin trades as usual: $1,000 buys 9.5M coins and they sell back for $902.50
    let alice = env.user(10_000).await;
    env.buy(&coin, &alice, 9_500_000 * COIN, 1000 * USD).await.unwrap();
    env.sell(&coin, &alice, 9_500_000 * COIN).await.unwrap();
    assert_eq!(env.stable_of(&alice.pubkey()).await, 9_000 * USD + 902_500_000);
    let m = env.check(&coin).await;
    assert_eq!(m.floor_reserve, 5 * USD + 39 * USD, "the gift plus the 2% of both trades");

    // the next coin, with no account made in advance, launches too
    let next = env.create_coin(&creator, "Second Coin", "TWO").await.unwrap();
    assert_ne!(next.stable_vault, vault);
}

/* Shared wallet plumbing for the app and the deploy page.
   Mobile wallets differ: some cannot estimate gas on every network, some answer errors in their own
   format, and some refuse a transaction that has no recipient. This file keeps those differences
   away from the rest of the code. Nothing here ever sees a private key: the wallet signs. */
window.JISR_WALLET = (function () {
  "use strict";
  const { ethers } = window;
  const CFG = window.JISR_CONFIG;
  /* The standard CREATE2 deployer, present at this address on most EVM networks. Sending contract
     code to it deploys the contract, so a deployment becomes an ordinary transaction with a recipient. */
  const PROXY = "0x4e59b44847b379578588920cA78FbF26c0B4956C";

  /* The most specific message inside an error from a wallet or from ethers. */
  function detail(e) {
    if (!e) return "";
    const inner = (e.error && e.error.message) || (e.info && e.info.error && e.info.error.message) || (e.data && e.data.message) || "";
    const outer = String(e.shortMessage || e.reason || e.message || e);
    let t = /could not coalesce error|unknown error/i.test(outer) && inner ? String(inner) : outer;
    t = t.replace(/^ethers-user-denied:\s*/, "");
    const method = e.payload && e.payload.method;
    if (method && /could not coalesce error/i.test(outer)) t += " [" + method + "]";
    return t;
  }
  function rejected(e) {
    if (!e) return false;
    const code = e.code, c2 = e.error && e.error.code, c3 = e.info && e.info.error && e.info.error.code;
    return code === 4001 || code === "ACTION_REJECTED" || c2 === 4001 || c3 === 4001 || /user (rejected|denied|cancell?ed)|rejected by (the )?user/i.test(detail(e));
  }

  /* MetaMask mobile answers this when the site is connected but the account is not allowed for this
     site on the current network. Only the wallet's own permission screen, or a fresh connection, fixes it. */
  const notPermitted = (e) => /must provide an Ethereum address/i.test(detail(e)) || (e && (e.code === 4100 || (e.error && e.error.code === 4100)));
  /* Drop the site's connection and ask for a new one, so the wallet shows its permission screen again. */
  async function reconnect() {
    try { await window.ethereum.request({ method: "wallet_revokePermissions", params: [{ eth_accounts: {} }] }); } catch (_) {}
    return await window.ethereum.request({ method: "eth_requestAccounts", params: [] });
  }

  /* On a phone, an ordinary browser has no wallet. This address opens the same page inside the
     MetaMask app's own browser (or the app's download page if it is not installed). */
  const onPhone = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "");
  const openInWalletUrl = () => "https://link.metamask.io/dapp/" + location.host + location.pathname + location.search + location.hash;

  const readers = {};
  /* A public read-only endpoint for the network, used when the wallet's own endpoint cannot answer. */
  function reader(chainId) {
    const c = CFG.chains[chainId], url = c && c.rpcUrl;
    if (!url) return null;
    if (!readers[chainId]) readers[chainId] = new ethers.JsonRpcProvider(url, Number(chainId), { staticNetwork: true });
    return readers[chainId];
  }
  const withTimeout = (p, ms) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error("The wallet did not answer in time.")), ms))]);
  const ask = (method, params) => window.ethereum.request({ method, params: params || [] });
  /* Read from the chain: the wallet first, then the public endpoint. */
  async function read(chainId, method, params) {
    try { return await withTimeout(ask(method, params), 20000); }
    catch (e) { const r = reader(chainId); if (!r) throw e; return await r.send(method, params || []); }
  }

  /* Ask the wallet to sign and send one transaction. Returns the transaction hash. */
  /* marginPct is the headroom added to the gas estimate. A deployment always uses the same gas, so it
     needs very little; wallets require the balance to cover the whole limit, so a large margin can block a tight balance. */
  async function rawSend(chainId, from, tx, gasFallback, marginPct) {
    const req = Object.assign({ from }, tx);
    let gas = null;
    try { gas = BigInt(await read(chainId, "eth_estimateGas", [req])) * BigInt(100 + (marginPct == null ? 20 : marginPct)) / 100n; } catch (_) { gas = gasFallback || null; }
    if (gas) req.gas = ethers.toQuantity(gas);
    return await ask("eth_sendTransaction", [req]);
  }
  /* Wait until the network includes the transaction. Returns the receipt, or null after the time limit. */
  async function waitReceipt(chainId, hash, ms) {
    if (typeof hash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new Error("The wallet did not return a transaction id.");
    const until = Date.now() + (ms || 600000);
    for (;;) {
      try { const rc = await read(chainId, "eth_getTransactionReceipt", [hash]); if (rc && rc.blockNumber) return rc; } catch (_) {}
      if (Date.now() > until) return null;
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  async function hasCode(chainId, addr) {
    try { const c = await read(chainId, "eth_getCode", [addr, "latest"]); return typeof c === "string" && c.length > 2; } catch (_) { return false; }
  }

  /* A signer that still works when the wallet cannot estimate gas itself: it asks the public endpoint. */
  class Signer extends ethers.JsonRpcSigner {
    async sendUncheckedTransaction(_tx) {
      const tx = Object.assign({}, _tx);
      if (tx.gasLimit == null) {
        const call = Object.assign({}, tx, { from: this.address });
        try { tx.gasLimit = await this.provider.estimateGas(call); }
        catch (e) {
          if (e && (e.code === "CALL_EXCEPTION" || e.code === "INSUFFICIENT_FUNDS")) throw e;
          const r = reader(String((await this.provider.getNetwork()).chainId));
          if (!r) throw e;
          tx.gasLimit = (await r.estimateGas(call)) * 12n / 10n;
        }
      }
      return super.sendUncheckedTransaction(tx);
    }
  }
  const signer = (provider, account) => new Signer(provider, account);

  return { PROXY, detail, rejected, notPermitted, reconnect, onPhone, openInWalletUrl, reader, read, rawSend, waitReceipt, hasCode, signer };
})();

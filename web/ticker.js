/* Markets bar (TradingView ticker tape) and the economic calendar page (TradingView events widget).
   Both are TradingView's own embeddable widgets; Landing Pad shows them as they are. */
(function () {
  const LOCALES = { ar: "ar_AE", zh: "zh_CN", es: "es", fr: "fr", ru: "ru", pt: "br", id: "id", tr: "tr", hi: "en" };
  function locale() {
    let l = "en"; try { l = localStorage.getItem("jisr.lang") || "en"; } catch (e) {}
    return LOCALES[l] || "en";
  }
  function embed(host, name, config) {
    host.textContent = "";
    const box = document.createElement("div"); box.className = "tradingview-widget-container";
    const inner = document.createElement("div"); inner.className = "tradingview-widget-container__widget";
    const s = document.createElement("script");
    s.src = "https://s3.tradingview.com/external-embedding/embed-widget-" + name + ".js";
    s.async = true; s.type = "text/javascript"; s.textContent = JSON.stringify(config);
    box.append(inner, s); host.appendChild(box);
    // Keep the widget invisible until it has drawn, so its grey loading frame never shows.
    new MutationObserver((_, mo) => { const f = box.querySelector("iframe"); if (!f) return; mo.disconnect();
      f.style.opacity = "0"; f.style.transition = "opacity .3s";
      f.addEventListener("load", () => setTimeout(() => { f.style.opacity = "1"; }, 700)); }).observe(box, { childList: true, subtree: true });
  }

  const tape = document.getElementById("mTape");
  if (tape) {
    const start = () => embed(tape, "ticker-tape", {
      symbols: [
        { proName: "FOREXCOM:SPXUSD", title: "S&P 500" },
        { proName: "FOREXCOM:NSXUSD", title: "Nasdaq 100" },
        { proName: "CAPITALCOM:DXY", title: "US dollar index" },
        { proName: "OANDA:XAUUSD", title: "Gold" },
        { proName: "TVC:USOIL", title: "WTI oil" },
        { proName: "FX:EURUSD", title: "EUR/USD" },
        { proName: "BITSTAMP:BTCUSD", title: "Bitcoin" },
        { proName: "BITSTAMP:ETHUSD", title: "Ether" },
        { proName: "COINBASE:SOLUSD", title: "Solana" }
      ],
      showSymbolLogo: true, isTransparent: true, displayMode: "regular", colorTheme: "dark", locale: locale()
    });
    // Load after the page itself is up, so the bar never slows the first paint.
    const go = start;
    if (document.readyState === "complete") setTimeout(go, 300);
    else window.addEventListener("load", () => setTimeout(go, 300));
  }

  const cal = document.getElementById("econBox");
  let calDone = false;
  function maybeCalendar() {
    if (calDone || !cal || cal.closest("section").hidden) return;
    calDone = true;
    embed(cal, "events", {
      colorTheme: "dark", isTransparent: true, width: "100%", height: 620, locale: locale(),
      importanceFilter: "0,1", countryFilter: "us,eu,gb,jp,cn,ca,au,ch,de,ae,sa"
    });
  }
  window.addEventListener("hashchange", () => setTimeout(maybeCalendar, 0));
  window.addEventListener("load", maybeCalendar);
})();

/* The site in ten languages.
   English is written in the pages and the scripts themselves. Every other language is one file under lang/
   that maps a short code for each English text to its translation. This script picks the language, loads
   that one file, and replaces the text in the page before the page's own scripts run. A text with no
   translation stays in English, so a missing line never breaks a page.

   A page uses it in three ways:
     - text written in the HTML is found and translated by this script;
     - a script asks for a sentence with JISR_I18N.t("Sent. Thank you, we will reply to {to}.", { to: address });
     - an element with data-lang-pick gets the language menu.
   Mark anything that must stay as written (a name, an address) with translate="no".

   Inside a text, <1>…</1> stands for the first element inside it (a link, a bold word), <2>…</2> for the
   second, and <3/> for one with nothing in it. A translation moves these marks to where its own words need them. */
(function () {
  "use strict";
  var LANGS = [["en", "English"], ["ar", "العربية"], ["zh", "中文"], ["es", "Español"], ["hi", "हिन्दी"], ["fr", "Français"],
    ["ru", "Русский"], ["pt", "Português"], ["id", "Bahasa Indonesia"], ["tr", "Türkçe"]];
  var KEY = "jisr.lang", RTL = { ar: true };
  var known = function (c) { return LANGS.some(function (l) { return l[0] === c; }); };
  function choose() {
    var q = /[?&]lang=([a-z]{2})\b/.exec(location.search), saved = null;
    try { saved = localStorage.getItem(KEY); } catch (_) {}
    if (q && known(q[1])) return q[1];
    if (known(saved)) return saved;
    var list = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || "en"];
    for (var i = 0; i < list.length; i++) { var c = String(list[i]).slice(0, 2).toLowerCase(); if (known(c)) return c; }
    return "en";
  }
  var lang = choose(), dict = null, missing = [], units = [];
  var me = document.currentScript, ver = me ? (/[?&]v=([0-9a-f]+)/.exec(me.src) || [])[1] : "";
  var here = me ? me.src.replace(/[^\/]*$/, "") : "";
  document.documentElement.lang = lang;
  if (RTL[lang]) document.documentElement.dir = "rtl";
  if (lang === "ar") {
    var font = document.createElement("link");
    font.rel = "stylesheet"; font.href = "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap";
    document.head.appendChild(font);
  }

  var norm = function (s) { return String(s).replace(/\s+/g, " ").trim(); };
  /* The short code of a text: a 32-bit FNV-1a hash of it, in base 36. */
  function code(s) {
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(36);
  }
  /* In a right-to-left sentence a dollar amount or a Latin name would be reordered ("1M$"). Each one is
     wrapped in invisible Unicode isolate marks so it keeps its own direction. */
  var rtl = !!RTL[lang], LRI = "\u2066", FSI = "\u2068", PDI = "\u2069";
  function lookup(src) {
    if (!dict) return null;
    var to = dict[code(src)];
    if (to == null && missing.indexOf(src) < 0) missing.push(src);
    if (to == null) return null;
    return rtl ? to.replace(/\$[0-9][0-9,.]*[KMB]?/g, LRI + "$&" + PDI) : to;
  }
  function fillIn(s, vars) {
    if (!vars) return s;
    return s.replace(/(\$?)\{(\w+)\}/g, function (m, dollar, k) {
      if (!(k in vars)) return m;
      return rtl ? FSI + dollar + vars[k] + PDI : dollar + vars[k];
    });
  }
  /* A sentence for a script: the translation of `src`, with {names} replaced from `vars`. */
  function t(src, vars) { var to = lookup(norm(src)); return fillIn(to == null ? src : to, vars); }

  /* ----- the text written in the page ----- */
  var SKIP = { SCRIPT: 1, STYLE: 1, SVG: 1, svg: 1, CODE: 1, NOSCRIPT: 1, TEMPLATE: 1 };
  var letters = /[A-Za-z]{2,}/;
  var ownText = function (el) {
    for (var c = el.firstChild; c; c = c.nextSibling) if (c.nodeType === 3 && letters.test(c.nodeValue)) return true;
    return false;
  };
  /* Write an element's content as one text, with a numbered mark for each element inside it. */
  function encode(el, kids) {
    var out = "";
    for (var c = el.firstChild; c; c = c.nextSibling) {
      if (c.nodeType === 3) out += c.nodeValue;
      else if (c.nodeType === 1) {
        kids.push(c);
        var n = kids.length, inner = c.getAttribute("translate") === "no" || SKIP[c.tagName] ? "" : encode(c, kids);
        out += norm(inner) ? "<" + n + ">" + inner + "</" + n + ">" : "<" + n + "/>";
      }
    }
    return out;
  }
  /* Put a translated text back into an element, moving the original inner elements to their marks. */
  function decode(text, kids, into) {
    while (into.firstChild) into.removeChild(into.firstChild);
    var re = /<(\d+)\/>|<(\d+)>([\s\S]*?)<\/\2>/g, last = 0, m;
    while ((m = re.exec(text))) {
      if (m.index > last) into.appendChild(document.createTextNode(text.slice(last, m.index)));
      var kid = kids[Number(m[1] || m[2]) - 1];
      if (kid) { if (m[2]) decode(m[3], kids, kid); into.appendChild(kid); }
      last = re.lastIndex;
    }
    if (last < text.length) into.appendChild(document.createTextNode(text.slice(last)));
  }
  var ATTRS = ["aria-label", "placeholder", "title", "alt"];
  function walk(el) {
    if (el.getAttribute("translate") === "no") return;
    for (var a = 0; a < ATTRS.length; a++) {
      var v = el.getAttribute(ATTRS[a]);
      if (v && letters.test(v)) { units.push(norm(v)); var av = lookup(norm(v)); if (av != null) el.setAttribute(ATTRS[a], av); }
    }
    if (SKIP[el.tagName]) return;
    if (ownText(el)) {
      var kids = [], src = norm(encode(el, kids));
      units.push(src);
      var to = lookup(src);
      if (to != null) decode(to, kids, el);
      // attributes of the elements inside a translated text
      for (var k = 0; k < kids.length; k++) for (var b = 0; b < ATTRS.length; b++) {
        var kv = kids[k].getAttribute(ATTRS[b]);
        if (kv && letters.test(kv)) { units.push(norm(kv)); var kt = lookup(norm(kv)); if (kt != null) kids[k].setAttribute(ATTRS[b], kt); }
      }
      return;
    }
    for (var c = el.firstElementChild; c; c = c.nextElementSibling) walk(c);
  }
  function page() {
    units.push(norm(document.title));
    var title = lookup(norm(document.title));
    if (title != null) document.title = title;
    walk(document.body);
    menus();
  }
  /* The language menu, put into every element marked data-lang-pick. Choosing a language reloads the page in it. */
  function menus() {
    var spots = document.querySelectorAll("[data-lang-pick]");
    for (var i = 0; i < spots.length; i++) {
      var sel = document.createElement("select");
      sel.className = "lang-pick"; sel.setAttribute("aria-label", "Language"); sel.setAttribute("translate", "no");
      LANGS.forEach(function (l) { var o = document.createElement("option"); o.value = l[0]; o.textContent = l[1]; o.lang = l[0]; sel.appendChild(o); });
      sel.value = lang;
      sel.addEventListener("change", function (e) { set(e.target.value); });
      spots[i].textContent = ""; spots[i].appendChild(sel);
    }
  }
  function set(to) {
    if (!known(to)) return;
    try { localStorage.setItem(KEY, to); localStorage.setItem("jisr.paperLang", to); } catch (_) {}
    var url = location.href.replace(/([?&])lang=[a-z]{2}&?/, "$1").replace(/[?&]$/, "").replace(/[?&]#/, "#");
    if (url === location.href) location.reload(); else location.replace(url);
  }

  /* While another language loads, the English page is kept out of sight, for two seconds at most. */
  var hide = null;
  if (lang !== "en") {
    hide = document.createElement("style");
    hide.textContent = "body{visibility:hidden}";
    document.head.appendChild(hide);
    setTimeout(show, 2000);
  }
  function show() { if (hide && hide.parentNode) hide.parentNode.removeChild(hide); hide = null; }
  var dom = new Promise(function (ok) { if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ok); else ok(); });
  var words = lang === "en" ? Promise.resolve() : new Promise(function (ok) {
    var s = document.createElement("script");
    s.src = here + "lang/" + lang + ".js" + (ver ? "?v=" + ver : "");
    s.onload = function () { dict = window.JISR_DICT || null; ok(); };
    s.onerror = function () { ok(); };
    document.head.appendChild(s);
  });
  var ready = Promise.all([dom, words]).then(function () {
    try { page(); } catch (_) { /* the page stays in English */ }
    show();
  });
  window.JISR_I18N = { lang: lang, langs: LANGS, rtl: !!RTL[lang], t: t, set: set, ready: ready, code: code, norm: norm, units: units, missing: missing };
})();

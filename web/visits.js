/* Counts a visit to the site, once per browser per day, and offers the running total to the page that
   wants to show it (window.JISR_VISITS, a promise of a number, or of null when it is not known).
   The count is kept by a free public counter service, abacus.jasoncameron.dev. Nothing about the visitor
   is sent to it beyond the request itself, and the site works the same when it does not answer.
   A page opened on this computer (localhost), as the tests do, is not counted. */
(function () {
  var local = /^(localhost|127\.|\[::1\]|0\.0\.0\.0)/.test(location.hostname) || location.protocol === "file:";
  if (local || typeof fetch !== "function") { window.JISR_VISITS = Promise.resolve(null); return; }
  var base = "https://abacus.jasoncameron.dev/", name = "landingpad-fun/visits";
  var day = new Date().toISOString().slice(0, 10), seen = false;
  try { seen = localStorage.getItem("jisr.visit") === day; } catch (_) {}
  window.JISR_VISITS = fetch(base + (seen ? "get/" : "hit/") + name)
    .then(function (r) { if (r.status === 404) return { value: 0 }; if (!r.ok) throw new Error("no answer"); return r.json(); })
    .then(function (j) { if (!seen) { try { localStorage.setItem("jisr.visit", day); } catch (_) {} } return typeof j.value === "number" ? j.value : null; })
    .catch(function () { return null; });
})();

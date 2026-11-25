/* Counts a visit to the site, once per browser per day, and offers the running total to the page that
   wants to show it: window.JISR_VISITS is a promise of a number, or of null when it is not known, and
   window.JISR_VISITS_LAST is the number this browser saw last time (or null).
   The count is kept by a free public counter service, abacus.jasoncameron.dev. Nothing about the visitor
   is sent to it beyond the request itself. The service is sometimes slow, so it is given eight seconds;
   after that the last known number is used, and the site works the same either way.
   A page opened on this computer (localhost), as the tests do, is not counted. */
(function () {
  var local = /^(localhost|127\.|\[::1\]|0\.0\.0\.0)/.test(location.hostname) || location.protocol === "file:";
  var last = null;
  try { var kept = Number(localStorage.getItem("jisr.visits.last")); if (kept > 0) last = kept; } catch (_) {}
  window.JISR_VISITS_LAST = last;
  if (local || typeof fetch !== "function") { window.JISR_VISITS = Promise.resolve(null); return; }
  var base = "https://abacus.jasoncameron.dev/", name = "landingpad-fun/visits";
  var day = new Date().toISOString().slice(0, 10), seen = false;
  try { seen = localStorage.getItem("jisr.visit") === day; } catch (_) {}
  var stop = typeof AbortController === "function" ? new AbortController() : null;
  var timer = setTimeout(function () { if (stop) stop.abort(); }, 8000);
  window.JISR_VISITS = fetch(base + (seen ? "get/" : "hit/") + name, stop ? { signal: stop.signal } : undefined)
    .then(function (r) { if (r.status === 404) return { value: 0 }; if (!r.ok) throw new Error("no answer"); return r.json(); })
    .then(function (j) {
      clearTimeout(timer);
      if (typeof j.value !== "number") return last;
      try { if (!seen) localStorage.setItem("jisr.visit", day); localStorage.setItem("jisr.visits.last", String(j.value)); } catch (_) {}
      return j.value;
    })
    .catch(function () { clearTimeout(timer); return last; });
})();

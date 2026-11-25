/* Counts a visit to the site, once per browser per day, and offers the figures to the page that wants
   to show them:
     window.JISR_VISITS        a promise of the running total, or of null when it is not known
     window.JISR_VISITS_TODAY  a promise of today's count (a day runs on UTC time), or of null
     window.JISR_VISITS_LAST   the total this browser saw last time, or null
     window.JISR_VISITS_READ() reads both figures again without counting anything; a promise of
                               { total, today }, each a number or null
   The counts are kept by a free public counter service, abacus.jasoncameron.dev. Nothing about the visitor
   is sent to it beyond the request itself. The service is sometimes slow, so each request is given eight
   seconds; after that the last known number is used, and the site works the same either way.
   A page opened on this computer (localhost), as the tests do, is not counted. */
(function () {
  var local = /^(localhost|127\.|\[::1\]|0\.0\.0\.0)/.test(location.hostname) || location.protocol === "file:";
  var last = null;
  try { var kept = Number(localStorage.getItem("jisr.visits.last")); if (kept > 0) last = kept; } catch (_) {}
  window.JISR_VISITS_LAST = last;
  if (local || typeof fetch !== "function") {
    window.JISR_VISITS = Promise.resolve(null);
    window.JISR_VISITS_TODAY = Promise.resolve(null);
    window.JISR_VISITS_READ = function () { return Promise.resolve({ total: null, today: null }); };
    return;
  }
  var base = "https://abacus.jasoncameron.dev/", space = "landingpad-fun/";
  var day = new Date().toISOString().slice(0, 10), dayKey = "day-" + day, seen = false;
  try { seen = localStorage.getItem("jisr.visit") === day; } catch (_) {}
  /* One question to the counter: a number, or null when it did not answer in time. A counter nobody has
     touched yet answers "not found", which is a count of nothing. */
  function ask(path) {
    var stop = typeof AbortController === "function" ? new AbortController() : null;
    var timer = setTimeout(function () { if (stop) stop.abort(); }, 8000);
    return fetch(base + path, stop ? { signal: stop.signal } : undefined)
      .then(function (r) { if (r.status === 404) return { value: 0 }; if (!r.ok) throw new Error("no answer"); return r.json(); })
      .then(function (j) { clearTimeout(timer); return typeof j.value === "number" ? j.value : null; })
      .catch(function () { clearTimeout(timer); return null; });
  }
  function keep(n) { try { localStorage.setItem("jisr.visits.last", String(n)); } catch (_) {} last = n; window.JISR_VISITS_LAST = n; }
  var how = seen ? "get/" : "hit/";
  window.JISR_VISITS = ask(how + space + "visits").then(function (n) {
    if (n == null) return last;
    try { if (!seen) localStorage.setItem("jisr.visit", day); } catch (_) {}
    keep(n);
    return n;
  });
  window.JISR_VISITS_TODAY = ask(how + space + dayKey);
  window.JISR_VISITS_READ = function () {
    return Promise.all([ask("get/" + space + "visits"), ask("get/" + space + dayKey)]).then(function (a) {
      if (a[0] != null) keep(a[0]);
      return { total: a[0] == null ? last : a[0], today: a[1] };
    });
  };
})();

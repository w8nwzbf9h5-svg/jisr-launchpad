/* Page-by-page navigation on the home page. Each menu link (#stress, #vote, #proof, #try, #contact,
   #road, #machine, ...) shows its own section as a page of its own and starts it at the top; the header
   stays where it is. Without a known address the home page shows its overview sections.
   Old addresses such as #board are left to the scripts that handle them. */
(function () {
  const main = document.querySelector("main");
  if (!main) return;
  const sections = [...main.children].filter((el) => el.tagName === "SECTION");
  const open = main.querySelector("section.open"), hero = open && open.querySelector(".hero");
  const PAGES = new Set(["vote", "stress", "proof", "try", "contact"]);
  const HOME = (s) => !s.id || ["promo", "road", "numbers"].includes(s.id) || s === open;

  function pageOf(id) {
    if (!id) return null;
    const el = document.getElementById(id);
    if (!el || !main.contains(el)) return null;
    let s = el.closest("section");
    while (s && s.parentElement !== main) s = s.parentElement.closest("section");
    return s ? { section: s, target: el } : null;
  }

  function show(first) {
    const id = decodeURIComponent(location.hash.slice(1));
    const hit = pageOf(id);
    const own = hit && (PAGES.has(hit.section.id) || hit.target.id === "machine");
    sections.forEach((s) => { s.hidden = own ? s !== hit.section : !HOME(s); });
    if (hero) hero.hidden = !!(own && hit.target.id === "machine");
    document.body.dataset.page = own ? (hit.target.id === "machine" ? "machine" : hit.section.id) : "home";
    // a page starts at its top; a link to something inside the home page (e.g. #lpad) goes to that thing
    if (own) window.scrollTo(0, 0);
    else if (hit && !first) hit.target.scrollIntoView({ block: "start" });
    else if (!hit && !first) window.scrollTo(0, 0);
    document.querySelectorAll('.top a[href^="#"]').forEach((a) => a.classList.toggle("on", a.getAttribute("href") === "#" + id));
  }

  window.addEventListener("hashchange", () => show(false));
  // the brand link returns to the home page
  document.querySelectorAll('.top a.brand, a[href="./"], a[href="index.html"]').forEach((a) => a.addEventListener("click", (e) => {
    if (location.pathname.endsWith("/") || location.pathname.endsWith("index.html")) { e.preventDefault(); history.pushState(null, "", location.pathname + location.search); show(false); }
  }));
  window.addEventListener("popstate", () => show(false));
  show(true);
  window.JISR_NAV = { show };
})();

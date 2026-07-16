/* =========================================================================
   Publications — filtering only.

   The list itself is rendered at build time from data/publications.json (see
   scripts/fetch_publications.py), so it needs no network call, works with
   JavaScript disabled, and is indexable by search engines. This file only
   filters what is already on the page.
   ========================================================================= */
(function () {
  var listEl   = document.getElementById("pub-list");
  var countEl  = document.getElementById("pub-count");
  var emptyEl  = document.getElementById("pub-empty");
  var searchEl = document.getElementById("pub-search");
  var typeEl   = document.getElementById("pub-type");
  var yearEl   = document.getElementById("pub-year");
  if (!listEl || !searchEl) return;

  var pubs    = Array.prototype.slice.call(listEl.querySelectorAll(".pub"));
  var headers = Array.prototype.slice.call(listEl.querySelectorAll(".pub-year"));
  var TOTAL   = pubs.length;

  function norm(s) {
    return (s || "")
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")   // strip diacritics
      .toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  }

  // Pre-compute the haystack once, so typing stays instant.
  pubs.forEach(function (el) { el._hay = norm(el.getAttribute("data-search")); });

  function apply() {
    var q = norm(searchEl.value);
    var t = typeEl.value;
    var y = yearEl.value;
    var shown = 0;

    pubs.forEach(function (el) {
      var ok = true;
      if (t && el.getAttribute("data-group") !== t) ok = false;
      if (ok && y && el.getAttribute("data-year") !== y) ok = false;
      if (ok && q && el._hay.indexOf(q) === -1) ok = false;
      el.hidden = !ok;
      if (ok) shown++;
    });

    // Hide a year heading when nothing under it survived; update its counter.
    headers.forEach(function (h) {
      var n = 0, el = h.nextElementSibling;
      while (el && !el.classList.contains("pub-year")) {
        if (el.classList.contains("pub") && !el.hidden) n++;
        el = el.nextElementSibling;
      }
      h.hidden = n === 0;
      var badge = h.querySelector("span");
      if (badge) badge.textContent = n + " item" + (n === 1 ? "" : "s");
    });

    if (emptyEl) emptyEl.hidden = shown !== 0;
    countEl.textContent = shown === TOTAL
      ? TOTAL + " publications"
      : shown + " of " + TOTAL + " shown";
  }

  searchEl.addEventListener("input", apply);
  typeEl.addEventListener("change", apply);
  yearEl.addEventListener("change", apply);
  apply();
})();


/* =========================================================================
   Publications — fetch every group member's records from DBLP, match by PID
   (or name), de-duplicate, and render grouped by year with live filtering.
   ========================================================================= */
(function () {
  var ENDPOINT = window.SECOMMS_DBLP_ENDPOINT || "https://dblp.org/search/publ/api";
  var AUTHORS  = window.SECOMMS_AUTHORS || [];
  var listEl   = document.getElementById("pub-list");
  var countEl  = document.getElementById("pub-count");
  var searchEl = document.getElementById("pub-search");
  var typeEl   = document.getElementById("pub-type");
  var yearEl   = document.getElementById("pub-year");

  // ---- helpers -----------------------------------------------------------
  function norm(s) {
    return (s || "")
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")  // strip diacritics
      .replace(/\s+\d{4}$/, "")                          // drop DBLP "0001" suffix
      .toLowerCase().replace(/[^a-z\s]/g, "").replace(/\s+/g, " ").trim();
  }
  function asArray(x) { return x == null ? [] : (Array.isArray(x) ? x : [x]); }
  function esc(s) {
    return String(s || "").replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function authorList(info) {
    return asArray(info.authors && info.authors.author).map(function (a) {
      return typeof a === "string" ? { text: a, pid: "" } : { text: a.text || "", pid: a["@pid"] || "" };
    });
  }
  var TYPE_MAP = {
    "Journal Articles":               { label: "Journal",    code: "J", group: "Journal" },
    "Conference and Workshop Papers": { label: "Conference", code: "C", group: "Conference" },
    "Informal and Other Publications":{ label: "Preprint",   code: "i", group: "Preprint" },
    "Books and Theses":               { label: "Book/Thesis",code: "B", group: "Other" },
    "Parts in Books or Collections":  { label: "Chapter",    code: "Ch",group: "Other" },
    "Editorship":                     { label: "Editorship", code: "E", group: "Other" }
  };
  function typeInfo(t) { return TYPE_MAP[t] || { label: t || "Other", code: "•", group: "Other" }; }

  var MEMBER_NAMES = {};
  AUTHORS.forEach(function (a) { MEMBER_NAMES[norm(a.name)] = true; });

  // ---- fetch one author --------------------------------------------------
  function fetchAuthor(author) {
    var url = ENDPOINT + "?q=" + encodeURIComponent(author.name) + "&format=json&h=1000&c=0";
    return fetch(url, { headers: { "Accept": "application/json" } })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (data) {
        var hits = asArray(data && data.result && data.result.hits && data.result.hits.hit);
        var out = [];
        hits.forEach(function (h) {
          var info = h.info; if (!info) return;
          var authors = authorList(info);
          var match = author.pid
            ? authors.some(function (a) { return a.pid === author.pid; })
            : authors.some(function (a) { return norm(a.text) === norm(author.name); });
          if (match) out.push(info);
        });
        return out;
      });
  }

  // ---- merge + de-duplicate ---------------------------------------------
  function dedupe(infos) {
    // 1) unique by DBLP key
    var byKey = {};
    infos.forEach(function (info) { if (info.key) byKey[info.key] = info; });
    var records = Object.keys(byKey).map(function (k) {
      var info = byKey[k];
      var ti = typeInfo(info.type);
      return {
        key: info.key,
        title: String(info.title || "").replace(/\.$/, ""),
        authors: authorList(info),
        venue: info.venue || "",
        year: parseInt(info.year, 10) || 0,
        ee: info.ee || "",
        url: info.url || "",
        typeLabel: ti.label, typeCode: ti.code, typeGroup: ti.group,
        informal: ti.group === "Preprint"
      };
    });
    // 2) collapse preprint/published twins with the same title+year:
    //    if a formal version exists, drop the informal one(s).
    var groups = {};
    records.forEach(function (r) {
      var g = norm(r.title) + "|" + r.year;
      (groups[g] = groups[g] || []).push(r);
    });
    var kept = [];
    Object.keys(groups).forEach(function (g) {
      var arr = groups[g];
      var hasFormal = arr.some(function (r) { return !r.informal; });
      arr.forEach(function (r) { if (!(hasFormal && r.informal)) kept.push(r); });
    });
    kept.sort(function (a, b) {
      if (b.year !== a.year) return b.year - a.year;
      return a.title.localeCompare(b.title);
    });
    return kept;
  }

  // ---- render ------------------------------------------------------------
  var ALL = [];
  function authorsHTML(authors) {
    return authors.map(function (a) {
      var nm = esc(a.text);
      return MEMBER_NAMES[norm(a.text)] ? '<span class="me">' + nm + "</span>" : nm;
    }).join(", ");
  }
  function pubHTML(r) {
    var link = r.ee || r.url;
    var title = link ? '<a href="' + esc(link) + '" rel="noopener">' + esc(r.title) + "</a>" : esc(r.title);
    var links = [];
    if (r.ee)  links.push('<a href="' + esc(r.ee)  + '" rel="noopener">DOI / PDF ↗</a>');
    if (r.url) links.push('<a href="' + esc(r.url) + '" rel="noopener">DBLP ↗</a>');
    return '' +
      '<div class="pub">' +
        '<span class="pub__type" data-t="' + (r.informal ? "i" : "f") + '">' + esc(r.typeLabel) + "</span>" +
        "<div>" +
          '<div class="pub__title">' + title + "</div>" +
          '<div class="pub__authors">' + authorsHTML(r.authors) + "</div>" +
          (r.venue ? '<div class="pub__venue">' + esc(r.venue) + (r.year ? " · " + r.year : "") + "</div>" : "") +
          (links.length ? '<div class="pub__links">' + links.join("") + "</div>" : "") +
        "</div>" +
      "</div>";
  }
  function render(records) {
    if (!records.length) {
      listEl.innerHTML = '<div class="state">No publications match the current filters.</div>';
      countEl.textContent = "0 shown";
      return;
    }
    var html = "", curYear = null;
    records.forEach(function (r) {
      if (r.year !== curYear) {
        curYear = r.year;
        var n = records.filter(function (x) { return x.year === curYear; }).length;
        html += '<h2 class="pub-year">' + (curYear || "Undated") + "<span>" + n + " item" + (n === 1 ? "" : "s") + "</span></h2>";
      }
      html += pubHTML(r);
    });
    listEl.innerHTML = html;
    countEl.textContent = records.length + " of " + ALL.length + " shown";
  }
  function applyFilters() {
    var q = norm(searchEl.value);
    var t = typeEl.value, y = yearEl.value;
    var filtered = ALL.filter(function (r) {
      if (t && r.typeGroup !== t) return false;
      if (y && String(r.year) !== y) return false;
      if (q) {
        var hay = norm(r.title) + " " + r.authors.map(function (a) { return norm(a.text); }).join(" ");
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });
    render(filtered);
  }

  // ---- boot --------------------------------------------------------------
  if (!AUTHORS.length) {
    listEl.innerHTML = '<div class="state">No authors configured.</div>';
    return;
  }
  Promise.allSettled(AUTHORS.map(fetchAuthor)).then(function (results) {
    var infos = [], failures = 0;
    results.forEach(function (res) {
      if (res.status === "fulfilled") { infos = infos.concat(res.value); }
      else { failures++; }
    });
    if (!infos.length) {
      listEl.innerHTML = '<div class="state"><b>Could not reach DBLP right now.</b> ' +
        'This page loads publications directly from dblp.org in your browser; please try again, ' +
        'or browse the group on <a href="https://dblp.org" rel="noopener">dblp.org</a>.</div>';
      countEl.textContent = "";
      return;
    }
    ALL = dedupe(infos);

    // populate the year dropdown
    var years = [];
    ALL.forEach(function (r) { if (r.year && years.indexOf(r.year) === -1) years.push(r.year); });
    years.sort(function (a, b) { return b - a; });
    years.forEach(function (y) {
      var o = document.createElement("option"); o.value = y; o.textContent = y; yearEl.appendChild(o);
    });

    render(ALL);
    if (failures) {
      var note = document.createElement("div");
      note.className = "state";
      note.style.marginTop = "20px";
      note.innerHTML = "Note: " + failures + " author quer" + (failures === 1 ? "y" : "ies") +
        " could not be loaded, so a few records may be missing. Reloading often fixes this.";
      listEl.appendChild(note);
    }

    searchEl.addEventListener("input", applyFilters);
    typeEl.addEventListener("change", applyFilters);
    yearEl.addEventListener("change", applyFilters);
  });
})();

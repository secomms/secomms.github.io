/* =========================================================================
   Repositories — list public repos of the GitHub organisation, live.
   ========================================================================= */
(function () {
  var ORG = window.SECOMMS_GH_ORG || "secomms";
  var listEl = document.getElementById("repo-list");
  var countEl = document.getElementById("repo-count");

  // simple language -> colour for the dot (a small, curated palette)
  var LANG_COLOR = {
    "C": "#555555", "C++": "#f34b7d", "Python": "#3572A5", "Rust": "#dea584",
    "Sage": "#9c27b0", "MATLAB": "#e16737", "Jupyter Notebook": "#DA5B0B",
    "Shell": "#89e051", "Makefile": "#427819", "TeX": "#3D6117", "Java": "#b07219",
    "JavaScript": "#f1e05a", "HTML": "#e34c26"
  };

  function esc(s) {
    return String(s || "").replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function timeAgo(iso) {
    var d = new Date(iso), now = new Date();
    var days = Math.floor((now - d) / 86400000);
    if (days < 1) return "today";
    if (days < 30) return days + "d ago";
    var months = Math.floor(days / 30);
    if (months < 12) return months + "mo ago";
    return Math.floor(months / 12) + "y ago";
  }

  function repoHTML(r) {
    var dotColor = LANG_COLOR[r.language] || "var(--line-strong)";
    var foot = [];
    if (r.language) foot.push('<span><i class="repo__dot" style="background:' + dotColor + '"></i>' + esc(r.language) + "</span>");
    if (r.stargazers_count) foot.push("<span>★ " + r.stargazers_count + "</span>");
    if (r.forks_count) foot.push("<span>⑂ " + r.forks_count + "</span>");
    foot.push("<span>Updated " + timeAgo(r.updated_at) + "</span>");
    return '' +
      '<a class="repo" href="' + esc(r.html_url) + '" rel="noopener">' +
        '<span class="repo__name">' + esc(r.name) + "</span>" +
        '<span class="repo__desc">' + (r.description ? esc(r.description) : "No description provided.") + "</span>" +
        '<span class="repo__foot">' + foot.join("") + "</span>" +
      "</a>";
  }

  function fallback() {
    listEl.innerHTML = '<div class="state"><b>Couldn\'t load repositories from the GitHub API.</b> ' +
      'GitHub limits anonymous requests, so this can happen if the page is refreshed often. ' +
      'Browse them directly at <a href="https://github.com/' + esc(ORG) + '" rel="noopener">github.com/' + esc(ORG) + ' ↗</a>.</div>';
    countEl.textContent = "";
  }

  fetch("https://api.github.com/orgs/" + encodeURIComponent(ORG) + "/repos?per_page=100&sort=updated", {
    headers: { "Accept": "application/vnd.github+json" }
  })
    .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
    .then(function (repos) {
      if (!Array.isArray(repos) || !repos.length) {
        listEl.innerHTML = '<div class="state">No public repositories yet. ' +
          'Watch <a href="https://github.com/' + esc(ORG) + '" rel="noopener">github.com/' + esc(ORG) + '</a> for updates.</div>';
        countEl.textContent = "0 repositories";
        return;
      }
      repos = repos.filter(function (r) { return !r.archived || true; }) // keep all; archived still shown
                   .sort(function (a, b) {
                     if (b.stargazers_count !== a.stargazers_count) return b.stargazers_count - a.stargazers_count;
                     return new Date(b.updated_at) - new Date(a.updated_at);
                   });
      var html = '<div class="repos">' + repos.map(repoHTML).join("") + "</div>";
      listEl.innerHTML = html;
      countEl.textContent = repos.length + " repositor" + (repos.length === 1 ? "y" : "ies");
    })
    .catch(fallback);
})();

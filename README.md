# SECOMMS — Secure Communications research group

Website for the **Secure Communications (SECOMMS)** group at the Department of
Information Engineering (DII), Università Politecnica delle Marche, Ancona.

Built with [Hugo](https://gohugo.io). Publications and repositories are fetched
live in the browser (from DBLP and the GitHub API), so the site stays current
without rebuilds.

## Deploy to GitHub Pages

1. Create a repository named **`secomms.github.io`** in the `secomms` org and
   push these files to the `main` branch.
2. In the repo, go to **Settings → Pages → Build and deployment** and set
   **Source = GitHub Actions**.
3. The included workflow (`.github/workflows/hugo.yml`) builds with Hugo and
   publishes on every push to `main`. The site goes live at
   `https://secomms.github.io`.

`baseURL` in `hugo.toml` is set to `https://secomms.github.io/`. The workflow
also passes the Pages base URL at build time, and every internal link uses
`relURL`/`.RelPermalink`, so the site is portable if you ever host it under a
sub-path.

## Run locally

Install Hugo **extended** (v0.128+ recommended), then:

```bash
hugo server
```

Open http://localhost:1313. To produce a static build in `public/`:

```bash
hugo --minify
```

## Project structure

```
hugo.toml                 Site config, params and top navigation
data/
  members.yml             Group roster (faculty, postdocs, phd, alumni)
  topics.yml              Research topics (home + Research page)
  projects.yml            Projects (QSAFEIT + background activity)
content/                  One file per page (front matter only)
layouts/
  _default/baseof.html    HTML shell
  index.html              Home page (hero + parity-check matrix)
  _default/*.html         One layout per interior page
  partials/               head, header, footer, person card, page head
static/assets/
  css/style.css           Visual identity
  js/matrix.js            Animated parity-check matrix in the hero
  js/publications.js      DBLP fetch + de-duplicate + filter
  js/repositories.js      GitHub org repo listing
```

## How the Publications page works

For each member it queries the DBLP publication API by name, then keeps a
record only when a co-author matches:

* the member's **`dblp_pid`** — an exact, homonym-proof match, or
* the member's **name** — used for members without a PID (their names are
  distinctive and they co-author with the faculty anyway).

Records are de-duplicated by DBLP key, and preprint/published twins of the same
paper are collapsed, preferring the formal version. Everything runs client-side.

## Adding or editing people

Edit `data/members.yml`. To make a member's publication matching exact, open
their DBLP profile and copy the id from the URL — e.g.
`dblp.org/pid/26/3594.html` → `dblp_pid: "26/3594"`. Set
`in_publications: false` to keep someone out of the automatic query (this is
how former members are handled by default).

## Adding a project

Add an entry to `data/projects.yml`. Omit any meta field you don't need
(leave it out entirely rather than setting it to an empty string) and it won't
render a row.

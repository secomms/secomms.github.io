#!/usr/bin/env python3
"""
Refresh data/publications.json from dblp.org.

Uses dblp's *person page export API* (https://dblp.org/pid/<PID>.xml), which
dblp itself recommends for external services: one request per researcher,
exact by persistent identifier (no homonyms), no search involved.

Run it locally with `python3 scripts/fetch_publications.py`, or let the weekly
GitHub Action do it. The site renders whatever is in data/publications.json, so
the website never depends on dblp being reachable at build time or page load.
"""

import json
import os
import pathlib
import re
import sys
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET

ROOT = pathlib.Path(__file__).resolve().parent.parent
MEMBERS = ROOT / "data" / "members.yml"
OUT = ROOT / "data" / "publications.json"

UA = "SECOMMS-website/1.0 (https://secomms.github.io; publications list; contact m.baldi@univpm.it)"
DELAY = 1.5          # be polite: dblp rate-limits aggressive scripting
RETRIES = 3

# dblp record element -> (label, filter group)
TYPES = {
    "article":       ("Journal",     "Journal"),
    "inproceedings": ("Conference",  "Conference"),
    "proceedings":   ("Editorship",  "Other"),
    "incollection":  ("Chapter",     "Other"),
    "book":          ("Book",        "Other"),
    "phdthesis":     ("PhD thesis",  "Other"),
    "mastersthesis": ("MSc thesis",  "Other"),
}


def log(msg):
    print(msg, file=sys.stderr)


def load_members():
    """Minimal YAML reader for the flat structure of data/members.yml.

    Avoids a PyYAML dependency so the script runs anywhere with plain Python.
    Returns [(name, pid)] for members with a PID and in_publications != false.
    """
    members, cur = [], None
    for raw in MEMBERS.read_text(encoding="utf-8").splitlines():
        line = raw.split("#", 1)[0].rstrip() if not raw.strip().startswith("#") else ""
        if not line.strip():
            continue
        m = re.match(r'\s*-\s*name:\s*"([^"]+)"', line)
        if m:
            if cur:
                members.append(cur)
            cur = {"name": m.group(1), "pid": None, "include": True}
            continue
        if cur is None:
            continue
        m = re.match(r'\s*dblp_pid:\s*"([^"]+)"', line)
        if m:
            cur["pid"] = m.group(1)
        m = re.match(r"\s*in_publications:\s*(\S+)", line)
        if m:
            cur["include"] = m.group(1).lower() not in ("false", "no")
    if cur:
        members.append(cur)
    return members


def fetch(url):
    last = None
    for attempt in range(1, RETRIES + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            last = e
            # 429 = rate limited: back off and try again
            wait = int(e.headers.get("Retry-After", 0) or 0) or DELAY * 4 * attempt
            log(f"    HTTP {e.code}; retrying in {wait:.0f}s ({attempt}/{RETRIES})")
            time.sleep(wait)
        except Exception as e:  # noqa: BLE001 - network is best-effort
            last = e
            log(f"    {e}; retrying ({attempt}/{RETRIES})")
            time.sleep(DELAY * 2 * attempt)
    raise RuntimeError(f"giving up on {url}: {last}")


def text(el):
    """Flatten an element's text, including <i>/<sub>/<sup> children."""
    return re.sub(r"\s+", " ", "".join(el.itertext())).strip()


def parse_person(xml_bytes):
    """Yield publication dicts from a dblpperson XML document."""
    root = ET.fromstring(xml_bytes)
    for r in root.findall("./r"):
        for rec in list(r):
            if rec.tag not in TYPES:
                continue
            label, group = TYPES[rec.tag]
            title = text(rec.find("title")) if rec.find("title") is not None else ""
            if not title:
                continue
            informal = rec.get("publtype") == "informal"  # arXiv & co.
            if informal:
                label, group = "Preprint", "Preprint"

            venue = ""
            for tag in ("journal", "booktitle", "school", "publisher"):
                el = rec.find(tag)
                if el is not None and text(el):
                    venue = text(el)
                    break

            year_el = rec.find("year")
            try:
                year = int(text(year_el)) if year_el is not None else 0
            except ValueError:
                year = 0

            authors = [
                {"name": re.sub(r"\s+\d{4}$", "", text(a)), "pid": a.get("pid", "")}
                for a in rec.findall("author")
            ]

            # <ee> = electronic edition (DOI / publisher / arXiv). Prefer a DOI.
            ees = [text(e) for e in rec.findall("ee") if text(e)]
            doi = next((e for e in ees if "doi.org" in e), "")
            ee = doi or (ees[0] if ees else "")

            url_el = rec.find("url")
            dblp_url = ""
            if url_el is not None and text(url_el):
                u = text(url_el)
                dblp_url = u if u.startswith("http") else "https://dblp.org/" + u.lstrip("/")

            yield {
                "key": rec.get("key", ""),
                "title": title.rstrip("."),
                "authors": authors,
                "venue": venue,
                "year": year,
                "type": label,
                "group": group,
                "informal": informal,
                "ee": ee,
                "dblp": dblp_url,
            }


def norm_title(t):
    return re.sub(r"[^a-z0-9]+", "", t.lower())


def dedupe(records):
    """One entry per dblp key, then collapse preprint/published twins."""
    by_key = {}
    for r in records:
        prev = by_key.get(r["key"])
        # keep the record that carries a DOI if we see the same key twice
        if not prev or (not prev["ee"] and r["ee"]):
            by_key[r["key"]] = r

    # Group by title alone: a preprint and its published version share the
    # title but usually NOT the year (arXiv 2022 -> journal 2024), so keying on
    # title+year would leave both in the list.
    groups = {}
    for r in by_key.values():
        groups.setdefault(norm_title(r["title"]), []).append(r)

    kept = []
    for arr in groups.values():
        formal = [r for r in arr if not r["informal"]]
        chosen = formal or arr
        # prefer the formal version, then the richer/most recent record
        chosen.sort(key=lambda r: (bool(r["ee"]), r["year"], len(r["venue"])), reverse=True)
        kept.append(chosen[0])

    kept.sort(key=lambda r: (-r["year"], r["title"].lower()))
    return kept


def main():
    members = load_members()
    targets = [m for m in members if m["pid"] and m["include"]]
    skipped = [m["name"] for m in members if not m["pid"] and m["include"]]

    if not targets:
        log("No members with a dblp_pid; nothing to do.")
        return 1

    log(f"Fetching {len(targets)} dblp profile(s)…")
    records, failures = [], []
    for i, m in enumerate(targets):
        url = f"https://dblp.org/pid/{m['pid']}.xml"
        log(f"  {m['name']} ({m['pid']})")
        try:
            got = list(parse_person(fetch(url)))
            records.extend(got)
            log(f"    {len(got)} records")
        except Exception as e:  # noqa: BLE001
            failures.append(m["name"])
            log(f"    FAILED: {e}")
        if i < len(targets) - 1:
            time.sleep(DELAY)

    if not records:
        log("No records fetched; leaving the existing file untouched.")
        return 1
    if failures:
        # Refusing to publish a half-empty list is safer than silently dropping papers.
        log(f"ERROR: could not fetch {', '.join(failures)}. Aborting without writing.")
        return 1

    pubs = dedupe(records)
    payload = {
        "generated": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "source": "https://dblp.org",
        "queried": [{"name": m["name"], "pid": m["pid"]} for m in targets],
        "count": len(pubs),
        "publications": pubs,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")

    log(f"\nWrote {OUT.relative_to(ROOT)} — {len(pubs)} publications "
        f"({min(p['year'] for p in pubs if p['year'])}–{max(p['year'] for p in pubs)}).")
    if skipped:
        log(f"No dblp_pid (covered via co-authors): {', '.join(skipped)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

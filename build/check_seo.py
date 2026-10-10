"""SEO checks on the built site (run after build_site.py): python build/check_seo.py

Every page: exactly one <title> and one meta description, lengths in range, titles unique, JSON-LD parses.
Noindex pages keep their noindex and stay out of sitemap.xml; the home page carries ProfessionalService + WebSite.
"""
import json
import re
import sys
from html import unescape
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TITLE_MAX, DESC_MIN, DESC_MAX = 66, 70, 160
problems, titles = [], {}
sitemap = (ROOT / "sitemap.xml").read_text(encoding="utf-8")
pages = sorted(p for p in ROOT.rglob("*.html") if not {"src", "node_modules", "build", "tests", "assets"} & set(p.relative_to(ROOT).parts))
for page in pages:
    rel = page.relative_to(ROOT).as_posix()
    text = page.read_text(encoding="utf-8")
    ts = re.findall(r"<title>(.*?)</title>", text, re.S)
    ds = re.findall(r'<meta name="description" content="(.*?)">', text, re.S)
    if len(ts) != 1 or len(ds) != 1:
        problems.append(f"{rel}: {len(ts)} title(s), {len(ds)} description(s)")
        continue
    title, desc = unescape(ts[0]), unescape(ds[0])
    noindex = '<meta name="robots" content="noindex">' in text
    if len(title) > TITLE_MAX and not noindex:   # a noindex page's title is only a share preview; shorten it before it goes public
        problems.append(f"{rel}: title {len(title)} chars (max {TITLE_MAX})")
    if not title.endswith(" · Suivel"):
        problems.append(f"{rel}: title does not end with ' · Suivel'")
    if not DESC_MIN <= len(desc) <= DESC_MAX:
        problems.append(f"{rel}: description {len(desc)} chars ({DESC_MIN}-{DESC_MAX})")
    if title in titles:
        problems.append(f"{rel}: title duplicates {titles[title]}")
    titles[title] = rel
    for block in re.findall(r'<script type="application/ld\+json">(.*?)</script>', text, re.S):
        try:
            data = json.loads(block)
        except ValueError as e:
            problems.append(f"{rel}: JSON-LD does not parse ({e})")
            continue
        types = [n.get("@type") for n in data.get("@graph", [data])]
        if rel != "index.html":
            problems.append(f"{rel}: unexpected JSON-LD {types}")
        elif sorted(types) != ["ProfessionalService", "WebSite"]:
            problems.append(f"{rel}: JSON-LD types {types}")
    if rel == "index.html" and "application/ld+json" not in text:
        problems.append("index.html: no JSON-LD")
    url = "https://suivel.fr/" + rel.replace("index.html", "")
    in_sitemap = f"<loc>{url}</loc>" in sitemap
    if noindex and in_sitemap:
        problems.append(f"{rel}: noindex but in sitemap.xml")
    if not noindex and not in_sitemap and rel != "404.html":
        problems.append(f"{rel}: indexable but missing from sitemap.xml")
    print(f"{rel:48} title {len(title):3}  desc {len(desc):3}  {'noindex' if noindex else ''}")
print(f"\n{len(pages)} pages, {len(titles)} unique titles, {len(problems)} problem(s)")
for p in problems:
    print("  -", p)
sys.exit(1 if problems else 0)

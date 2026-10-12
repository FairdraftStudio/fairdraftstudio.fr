"""One name per tool: every French card or link that shows a tool's name must use the tool page's h1, word for word.

Why (docs/mistakes.md, 12 Oct 2026): the e-invoicing tool had four names across the site and the letter tool two, because each
card was written on its own. This reads the h1 of every src/fr/outils-*.html and compares it with the name shown wherever
that tool is linked in src/fr/index.html (cards and the hero's « Dernier outil gratuit »), src/fr/outils.html (rows) and
src/fr/realisations.html (cards). English pages use English names and are not checked here.

Usage (from the repo root): python repos/fairdraftstudio.fr/build/check_tool_names.py   -> exit 1 on any mismatch
"""
import html
import re
import sys
from pathlib import Path

SRC = Path(__file__).resolve().parent.parent / "src" / "fr"
PAGES = ["index.html", "outils.html", "realisations.html"]
EN_PAGES = ["index.html", "tools.html", "work.html"]


def norm(s):
    s = re.sub(r"<[^>]+>", "", s)
    s = html.unescape(s).replace(" ", " ").replace(" ", " ")
    return re.sub(r"\s+", " ", s).strip()


def tool_names():
    names = {}
    for f in sorted(SRC.glob("outils-*.html")):
        text = f.read_text(encoding="utf-8")
        path = re.search(r"^path:\s*(\S+)", text, re.M)
        h1 = re.search(r"^h1:\s*(.+)$", text, re.M)
        if path and h1:
            url = "/" + path.group(1).replace("index.html", "")
            names[url] = norm(h1.group(1))
    return names


def shown_names(text):
    """(url, name) for every tool link that shows a name: card anchors, hub rows, the hero's latest link."""
    found = []
    for m in re.finditer(r'<a class="card"[^>]*href="(/outils/[^"]+)"[^>]*>(.*?)</a>', text, re.S):
        h = re.search(r"<h[23][^>]*>(.*?)</h[23]>", m.group(2), re.S)
        if h:
            found.append((m.group(1), norm(h.group(1))))
    for m in re.finditer(r'<li class="tool-row">(.*?)</li>\s*(?=<li class="tool-row">|</ul>)', text, re.S):
        h = re.search(r"<h2[^>]*>(.*?)</h2>", m.group(1), re.S)
        a = re.search(r'<a class="btn" href="(/outils/[^"]+)"', m.group(1))
        if h and a:
            found.append((a.group(1), norm(h.group(1))))
    for m in re.finditer(r'<a class="latest" href="(/outils/[^"]+)".*?<span class="latest-name">(.*?)</span>', text, re.S):
        found.append((m.group(1), norm(m.group(2))))
    return found


def main():
    names = tool_names()
    problems, checked = [], 0
    for page in PAGES:
        for url, shown in shown_names((SRC / page).read_text(encoding="utf-8")):
            if url not in names:
                continue
            checked += 1
            if shown != names[url]:
                problems.append(f"{page}: {url} shows « {shown} », the page's h1 is « {names[url]} »")
    # English pages: no English tool page to compare with, so one English name per tool across index, tools and work (review 12 Oct)
    en_names = {}
    for page in EN_PAGES:
        for url, shown in shown_names((SRC.parent / "en" / page).read_text(encoding="utf-8")):
            checked += 1
            en_names.setdefault(url, {}).setdefault(shown, []).append(page)
    for url, variants in en_names.items():
        if len(variants) > 1:
            problems.append(f"en: {url} has {len(variants)} names: " + "; ".join(f"« {n} » ({', '.join(p)})" for n, p in variants.items()))
    for p in problems:
        print("  - " + p)
    print(f"{len(names)} tools, {checked} links checked, {len(problems)} name mismatch(es)")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())

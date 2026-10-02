"""Builds fairdraftstudio.fr from the fragments in src/.

Every page = one fragment in src/<lang>/<name>.html:
  a meta comment (title, description, path, nav, h1, kicker, intro),
  an optional <!--banner--> block that sits on the teal band under the header,
  then the page content.

Run: python build/build_site.py     (from the site folder or the workspace root)
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"

LOGO = ('<svg class="brand-mark" viewBox="0 0 1000 1000" aria-hidden="true" focusable="false">'
        '<rect width="1000" height="1000" rx="170" fill="#0F4C5C"/>'
        '<path d="M320 200H615L730 315V780Q730 810 700 810H320Q290 810 290 780V230Q290 200 320 200Z" fill="#F6F1EA"/>'
        '<path d="M615 200V290Q615 315 640 315H730Z" fill="#C2410C"/>'
        '<rect x="400" y="722" width="210" height="20" rx="10" fill="#C2410C"/>'
        '<text x="510" y="700" text-anchor="middle" font-family="DM Serif Display, Georgia, serif" '
        'font-size="500" fill="#0F4C5C">f</text></svg>')

SITE = "https://fairdraftstudio.fr/"   # final domain: canonical, og:url, sitemap, robots.txt
# Social preview image: source marketing/12-social-profiles/og-fairdraftstudio-fr.html (French text on both languages).
OG_IMAGE = SITE + "assets/img/og-fairdraft-1200x630.png"
OG_IMAGE_ALT = {"fr": "Fairdraft Studio&nbsp;: l'administratif des petites entreprises, automatisé.",
                "en": "Fairdraft Studio: “L'administratif des petites entreprises, automatisé” (small-business admin, automated)."}

EMAIL = "contact@fairdraftstudio.fr"

NAV = {
    "fr": [("/offres/", "Offres et prix", "offres"),
           ("/outils/", "Outils gratuits", "outils"),
           ("/realisations/", "Réalisations", "realisations"),
           ("/a-propos/", "À propos", "a-propos"),
           ("/contact/", "Contact", "contact")],
    "en": [("/en/offers/", "Offers and prices", "offers"),
           ("/en/tools/", "Free tools", "tools"),
           ("/en/work/", "Work", "work"),
           ("/en/about/", "About", "about"),
           ("/en/contact/", "Contact", "contact")],
}

TEXT = {
    "fr": dict(menu="Menu", skip="Aller au contenu", home="Fairdraft Studio, accueil", nav="Navigation principale",
               cta="Décrire mon besoin", cta_href="/contact/", lang_label="English version",
               lang_code="EN", lang_href="/en/", lang_hreflang="en",
               tagline="L'administratif des petites entreprises, automatisé.",
               f_offers="Offres", f_studio="Le studio", f_contact="Contact",
               f_reply="Réponse écrite sous un jour ouvré", f_where="Montpellier · à distance, partout en France",
               f_legal="Mentions légales", f_privacy="Confidentialité", f_terms="Conditions générales de vente",
               f_vat="TVA non applicable, art. 293 B du CGI",
               f_cookies="Ce site ne dépose aucun cookie et ne charge aucune ressource externe.",
               f_siret="Micro-entreprise (EI) · SIRET 938 479 193 00014"),
    "en": dict(menu="Menu", skip="Skip to content", home="Fairdraft Studio, home", nav="Main navigation",
               cta="Describe your task", cta_href="/en/contact/", lang_label="Version française",
               lang_code="FR", lang_href="/", lang_hreflang="fr",
               tagline="Small-business admin, automated.",
               f_offers="Offers", f_studio="The studio", f_contact="Contact",
               f_reply="Written reply within one working day", f_where="Montpellier, France · remote",
               f_legal="Legal notice (FR)", f_privacy="Privacy (FR)", f_terms="Terms of sale (FR)",
               f_vat="VAT not applicable, art. 293 B of the French tax code (CGI)",
               f_cookies="This site sets no cookies and loads nothing from third parties.",
               f_siret="Sole trader (EI) · SIRET 938 479 193 00014"),
}

FOOTER_LINKS = {
    "fr": {
        "offers": [("/offres/#offre-relances", "Relances de factures automatiques · 390&nbsp;€"),
                   ("/offres/#offre-comptes-rendus", "Comptes rendus et tâches automatiques · 290&nbsp;€"),
                   ("/offres/#offre-assistant", "Assistant IA pour vos textes répétitifs · 149&nbsp;€"),
                   ("/offres/#suivi", "Suivi mensuel · 49&nbsp;€/mois")],
        "studio": [("/realisations/", "Réalisations"), ("/a-propos/", "À propos"),
                   ("/contact/", "Contact"), ("/en/", "English")],
    },
    "en": {
        "offers": [("/en/offers/#offer-reminders", "Automatic invoice reminders · €390"),
                   ("/en/offers/#offer-meetings", "Automatic meeting notes and tasks · €290"),
                   ("/en/offers/#offer-assistant", "Custom AI assistant for repetitive writing · €149"),
                   ("/en/offers/#support", "Monthly support · €49/month")],
        "studio": [("/en/work/", "Work"), ("/en/about/", "About"),
                   ("/en/contact/", "Contact"), ("/", "Français")],
    },
}

SHELL = """<!doctype html>
<html lang="{lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<meta name="description" content="{description}">
{canonical}{alternates}<meta property="og:type" content="website">
<meta property="og:locale" content="{oglocale}">
<meta property="og:site_name" content="Fairdraft Studio">
<meta property="og:title" content="{ogtitle}">
<meta property="og:description" content="{description}">
{ogurl}<meta property="og:image" content="{ogimage}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="{ogimagealt}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{ogtitle}">
<meta name="twitter:description" content="{description}">
<meta name="twitter:image" content="{ogimage}">
<meta name="twitter:image:alt" content="{ogimagealt}">
<meta name="theme-color" content="#EFE7DB">
<link rel="icon" type="image/png" sizes="48x48" href="/assets/img/favicon-48.png">
<link rel="apple-touch-icon" href="/assets/img/apple-touch-icon.png">
<link rel="preload" href="/assets/fonts/dm-serif-display-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/assets/fonts/atkinson-next-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/site.css">
<script>document.documentElement.classList.add('js')</script>
<script src="/assets/site.js" defer></script>{extra_script}
</head>
<body>
<a class="skip" href="#main">{skip}</a>

<header class="top" id="top">
  <div class="wrap top-inner">
    <a class="brand" href="{home_href}" aria-label="{home}">
      {logo}
      <span class="brand-name">Fairdraft<span>Studio</span></span>
    </a>
    <nav class="nav" id="site-nav" aria-label="{nav}">
{navlinks}
    </nav>
    <div class="top-actions">
      <a class="lang" href="{lang_href}" hreflang="{lang_hreflang}" lang="{lang_hreflang}" aria-label="{lang_label}">{lang_code}</a>
      <a class="btn btn-small" href="{cta_href}">{cta}</a>
      <button class="menu-toggle" type="button" id="menu-toggle" aria-expanded="false" aria-controls="site-nav">{menu}</button>
    </div>
  </div>
</header>
{banner}
<main id="main">
{content}
</main>

<footer class="footer">
  <div class="wrap footer-grid">
    <div class="footer-brand">
      <a class="brand" href="{home_href}" aria-label="{home}">
        {logo}
        <span class="brand-name">Fairdraft<span>Studio</span></span>
      </a>
      <p class="footer-tag">{tagline}</p>
      <p class="footer-where">{f_where}</p>
    </div>
    <div>
      <h2 class="footer-title">{f_offers}</h2>
      <ul class="footer-list">
{footer_offers}
      </ul>
      <p class="footer-note footer-vat">{f_vat}</p>
    </div>
    <div>
      <h2 class="footer-title">{f_studio}</h2>
      <ul class="footer-list">
{footer_studio}
      </ul>
    </div>
    <div>
      <h2 class="footer-title">{f_contact}</h2>
      <ul class="footer-list">
        <li><a href="mailto:{email}">{email}</a></li>
        <li class="footer-note">{f_reply}</li>
      </ul>
    </div>
  </div>
  <div class="wrap footer-bottom">
    <p>© 2026 Fairdraft Studio · {f_siret}</p>
    <nav class="footer-legal" aria-label="{f_legal}">
      <a href="/mentions-legales.html">{f_legal}</a>
      <a href="/confidentialite.html">{f_privacy}</a>
      <a href="/cgv.html">{f_terms}</a>
    </nav>
    <p class="footer-note">{f_cookies}</p>
  </div>
</footer>
</body>
</html>
"""

PAGE_HEAD = """<div class="desk desk-page">
  <div class="wrap page-head">
    <p class="eyebrow">{kicker}</p>
    <h1>{h1}</h1>
{intro}  </div>
</div>
"""


def parse(fragment: str):
    m = re.match(r"<!--meta\n(.*?)\n-->\n", fragment, re.S)
    if not m:
        sys.exit("fragment without meta block")
    meta = {}
    for line in m.group(1).splitlines():
        key, _, value = line.partition(":")
        meta[key.strip()] = value.strip()
    body = fragment[m.end():]
    banner = ""
    bm = re.search(r"<!--banner-->\n(.*?)\n<!--/banner-->\n", body, re.S)
    if bm:
        banner = bm.group(1)
        body = body[:bm.start()] + body[bm.end():]
    return meta, banner, body.strip("\n")


def add_reveal(html: str) -> str:
    """Marks the blocks that fade in on scroll, so fragments stay free of motion markup."""
    html = re.sub(r'<div class="section-head">', '<div class="section-head reveal">', html)
    html = re.sub(r'<form class="sheet form"', '<form class="sheet form reveal"', html)

    def number(match, item_open='<li>'):
        head, body, tail = match.group(1), match.group(2), match.group(3)
        count = [0]

        def one(_m):
            i = count[0]
            count[0] += 1
            return '<li class="reveal" style="--i: {}">'.format(i)

        return head + re.sub(re.escape(item_open), one, body) + tail

    for wrapper in (r'(<ol class="steps">)(.*?)(</ol>)',
                    r'(<ol class="articles">)(.*?)(</ol>)',
                    r'(<ol class="fe-dates">)(.*?)(</ol>)'):
        html = re.sub(wrapper, number, html, flags=re.S)

    count = [0]

    def quote(m):
        i = count[0]
        count[0] += 1
        return '<article class="sheet quote reveal" style="--i: {}"'.format(i)

    return re.sub(r'<article class="sheet quote"', quote, html)


def build_page(lang: str, fragment: str) -> tuple[Path, str, str | None]:
    """Returns (output path, html, public URL for the sitemap, or None when the page is 'robots: noindex')."""
    meta, banner, content = parse(fragment)
    content = add_reveal(content)
    t = TEXT[lang]
    path = meta["path"]
    path_url = "" if path == "index.html" else path.replace("index.html", "")
    nav_current = meta.get("nav", "")
    navlinks = "\n".join(
        '      <a href="{}"{}>{}</a>'.format(href, ' aria-current="page"' if key and key == nav_current else "", label)
        for href, label, key in NAV[lang])
    if not banner:
        intro = '    <p class="page-intro">{}</p>\n'.format(meta["intro"]) if meta.get("intro") else ""
        banner = PAGE_HEAD.format(kicker=meta.get("kicker", ""), h1=meta["h1"], intro=intro)
    # "alt:" in the meta block = the same page in the other language (path), used for the switch and hreflang.
    alt = meta.get("alt", "index.html" if lang == "en" else "en/index.html")
    alt_url = "" if alt == "index.html" else alt.replace("index.html", "")
    fr_url, en_url = (path_url, alt_url) if lang == "fr" else (alt_url, path_url)
    alternates = ('<link rel="alternate" hreflang="fr" href="' + SITE + '{}">\n'
                  '<link rel="alternate" hreflang="en" href="' + SITE + '{}">\n'
                  '<link rel="alternate" hreflang="x-default" href="' + SITE + '{}">\n'
                  ).format(fr_url, en_url, fr_url) if "alt" in meta or path == "index.html" or path == "en/index.html" else ""
    # "robots: noindex" in the meta block (the 404 page): no canonical, hreflang or og:url, and kept out of the sitemap.
    noindex = meta.get("robots") == "noindex"
    if noindex:
        canonical, ogurl, alternates = '<meta name="robots" content="noindex">\n', "", ""
    else:
        canonical = '<link rel="canonical" href="{}{}">\n'.format(SITE, path_url)
        ogurl = '<meta property="og:url" content="{}{}">\n'.format(SITE, path_url)
    # "switch:" overrides the language switch only (no hreflang pair), for pages with no translation.
    t = dict(t, lang_href=meta.get("switch", "/" + alt_url))
    extra = meta.get("script", "")
    extra_script = '\n<script src="{}" defer></script>'.format(extra) if extra else ""
    html = SHELL.format(
        extra_script=extra_script,
        lang=lang, title=meta["title"], description=meta["description"],
        canonical=canonical, ogurl=ogurl, ogimage=OG_IMAGE, ogimagealt=OG_IMAGE_ALT[lang],
        alternates=alternates, oglocale="fr_FR" if lang == "fr" else "en_GB",
        ogtitle=meta.get("ogtitle", meta["title"]), logo=LOGO,
        home_href="/" if lang == "fr" else "/en/", navlinks=navlinks, banner=banner, content=content,
        email=EMAIL,
        footer_offers="\n".join('        <li><a href="{}">{}</a></li>'.format(h, l) for h, l in FOOTER_LINKS[lang]["offers"]),
        footer_studio="\n".join('        <li><a href="{}">{}</a></li>'.format(h, l) for h, l in FOOTER_LINKS[lang]["studio"]),
        **t)
    return ROOT / path, html, None if noindex else SITE + path_url


def main():
    written = 0
    urls = []
    for lang in ("fr", "en"):
        for fragment_path in sorted((SRC / lang).glob("*.html")):
            out, html, url = build_page(lang, fragment_path.read_text(encoding="utf-8"))
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_text(html, encoding="utf-8", newline="\n")
            print(f"{fragment_path.relative_to(ROOT)} -> {out.relative_to(ROOT)}")
            written += 1
            if url:
                urls.append(url)
    # sitemap.xml and robots.txt are generated too, so the domain lives in one place (SITE).
    urls.sort(key=lambda u: (u != SITE, u.startswith(SITE + "en/"), u))
    sitemap = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    sitemap += ["  <url><loc>{}</loc></url>".format(u) for u in urls] + ["</urlset>"]
    (ROOT / "sitemap.xml").write_text("\n".join(sitemap) + "\n", encoding="utf-8", newline="\n")
    (ROOT / "robots.txt").write_text("User-agent: *\nAllow: /\n\nSitemap: {}sitemap.xml\n".format(SITE),
                                     encoding="utf-8", newline="\n")
    print(f"{written} pages built, {len(urls)} in sitemap.xml")


if __name__ == "__main__":
    main()

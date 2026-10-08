"""Builds suivel.fr from the fragments in src/.

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

# Logo "Le fil" (marketing/15-brand/suivel/suivel-logo.svg), split into the mark and the name so phones can show
# the mark alone. Both share the lockup's height (CSS --logo-h); currentColor = teal on light, cream on teal.
LOGO = ('<svg class="brand-mark" viewBox="31.4 31.4 426.7 657.2" aria-hidden="true" focusable="false"><g transform="translate(-228.7 -116.2) scale(0.9524)"><path d="M605.2 296.3 A124 124 0 1 0 500 486 A138 138 0 1 1 478.4 760.3" fill="none" stroke="currentColor" stroke-width="106" stroke-linecap="round"/><circle cx="366.7" cy="659.7" r="63.6" fill="#E36A1B"/></g></svg>')
LOGO_NAME = ('<svg class="brand-name" viewBox="579.4 31.4 1522.1 657.2" aria-hidden="true" focusable="false"><g transform="translate(568.8 567.8)"><path d="M145.8 7.2Q114.2 7.2 87.1 -1.1Q60.1 -9.4 40.4 -25.3Q20.7 -41.3 10.6 -64.1L78.3 -88.8Q83.6 -70.2 103.2 -60.5Q122.8 -50.7 146.8 -50.7Q168 -50.7 184.4 -58.4Q200.8 -66.1 200.8 -80.8Q200.8 -91.5 190.8 -98.4Q180.7 -105.2 155.2 -109.7L110.1 -117.9Q83.7 -123.1 63.4 -133.3Q43.1 -143.4 31.7 -159.8Q20.2 -176.2 20.2 -199.1Q20.2 -227.9 37.9 -247.5Q55.5 -267.1 83.9 -277.1Q112.4 -287.2 144.9 -287.2Q184.4 -287.2 218.4 -272.6Q252.4 -257.9 268.2 -223.5L200.7 -198.9Q194.3 -214.5 179.3 -222.1Q164.3 -229.7 142.9 -229.7Q120.1 -229.7 107.8 -222.4Q95.5 -215 95.5 -202.9Q95.5 -192.7 103.9 -187.1Q112.4 -181.4 132 -177.6L178.9 -168.9Q211.9 -162.7 233.6 -152.9Q255.2 -143.1 265.9 -127Q276.6 -110.9 276.6 -85.8Q276.6 -55.4 258.9 -34.6Q241.1 -13.7 211.6 -3.3Q182 7.2 145.8 7.2Z" fill="currentColor"/><path d="M409.5 6.8Q373.1 6.8 352.2 -7Q331.3 -20.9 322.6 -47Q313.8 -73.1 313.8 -109.7V-279.7H392.4V-129.8Q392.4 -109.7 394.7 -92.5Q397 -75.3 406.8 -65.2Q416.5 -55.1 438.2 -55.1Q466.4 -55.1 479.1 -73.3Q491.8 -91.4 491.8 -131.4V-279.7H570.8V0H503.7L491.8 -39.7Q479.5 -18.9 460.8 -6.1Q442.1 6.8 409.5 6.8Z" fill="currentColor"/><path d="M656.5 0V-219.9H611.2V-279.7H735.5V0H656.5ZM691.7 -327.2Q672.2 -327.2 658.1 -341.3Q644 -355.4 644 -374.9Q644 -395.1 658.1 -409Q672.2 -422.8 691.6 -422.8Q711.9 -422.8 725.7 -408.9Q739.5 -395 739.5 -375Q739.5 -355.4 725.7 -341.3Q711.8 -327.2 691.7 -327.2Z" fill="currentColor"/><path d="M870.6 0 770.8 -279.7H852.4L914.7 -84L976.9 -279.7H1058.5L958.2 0H870.6Z" fill="currentColor"/><path d="M1217.5 6.8Q1172.6 6.8 1138.7 -11.3Q1104.8 -29.4 1086 -62.6Q1067.2 -95.8 1067.2 -141.1Q1067.2 -185.7 1087.3 -218.3Q1107.4 -251 1140.9 -269Q1174.3 -286.9 1214.5 -286.9Q1248.7 -286.9 1275.9 -274.4Q1303.1 -261.8 1321.8 -239.1Q1340.5 -216.4 1349.3 -185.6Q1358 -154.9 1355.3 -119.1H1144.7Q1147.9 -101.5 1154.9 -89.4Q1161.9 -77.4 1171.7 -69.7Q1181.5 -62.1 1192.9 -58.6Q1204.3 -55.1 1215.6 -55.1Q1236.1 -55.1 1250.8 -61.4Q1265.5 -67.6 1273.7 -77.3L1337.7 -54.6Q1317 -23.9 1284.9 -8.6Q1252.8 6.8 1217.5 6.8ZM1144.4 -168.3H1281.3Q1280.4 -186.7 1271.7 -199.9Q1262.9 -213.1 1248.8 -220.4Q1234.7 -227.6 1216.3 -227.6Q1200 -227.6 1184.9 -221.8Q1169.8 -216.1 1159.3 -203.3Q1148.8 -190.4 1144.4 -168.3Z" fill="currentColor"/><path d="M1482.4 0Q1449.6 0 1430.4 -5.9Q1411.1 -11.7 1402.9 -28.4Q1394.7 -45.1 1394.7 -76.6V-399.2H1473.2V-96Q1473.2 -76.6 1480.6 -70.6Q1488.1 -64.6 1509.4 -64.6H1532.7V0H1482.4Z" fill="currentColor"/></g></svg>')

SITE = "https://suivel.fr/"   # final domain: canonical, og:url, sitemap, robots.txt
# Social preview image: source marketing/15-brand/og-suivel-fr.html (French text on both languages).
OG_IMAGE = SITE + "assets/img/og-suivel-1200x630.png"
OG_IMAGE_ALT = {"fr": "Suivel&nbsp;: l'administratif des petites entreprises, automatisé.",
                "en": "Suivel: “L'administratif des petites entreprises, automatisé” (small-business admin, automated)."}

EMAIL = "contact@suivel.fr"

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
    "fr": dict(menu="Menu", skip="Aller au contenu", home="Suivel, accueil", nav="Navigation principale",
               cta="Décrire mon besoin", cta_href="/contact/", lang_label="English version",
               lang_code="EN", lang_href="/en/", lang_hreflang="en",
               tagline="L'administratif des petites entreprises, automatisé.",
               f_offers="Offres", f_studio="En savoir plus", f_contact="Contact",
               f_reply="Réponse écrite sous un jour ouvré", f_where="Montpellier · à distance, partout en France",
               f_legal="Mentions légales", f_privacy="Confidentialité", f_terms="Conditions générales de vente",
               f_vat="TVA non applicable, art. 293 B du CGI",
               f_cookies="Aucun cookie. Les visites sont comptées sans vous identifier (GoatCounter).",
               f_siret="Micro-entreprise (EI) · SIRET 938 479 193 00014"),
    "en": dict(menu="Menu", skip="Skip to content", home="Suivel, home", nav="Main navigation",
               cta="Describe your task", cta_href="/en/contact/", lang_label="Version française",
               lang_code="FR", lang_href="/", lang_hreflang="fr",
               tagline="Small-business admin, automated.",
               f_offers="Offers", f_studio="Learn more", f_contact="Contact",
               f_reply="Written reply within one working day", f_where="Montpellier, France · remote",
               f_legal="Legal notice (FR)", f_privacy="Privacy (FR)", f_terms="Terms of sale (FR)",
               f_vat="VAT not applicable, art. 293 B of the French tax code (CGI)",
               f_cookies="No cookies. Visits are counted without identifying you (GoatCounter).",
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
<meta property="og:site_name" content="Suivel">
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
<link rel="icon" type="image/svg+xml" href="/assets/img/favicon.svg">
<link rel="icon" type="image/png" sizes="48x48" href="/assets/img/favicon-48.png">
<link rel="apple-touch-icon" href="/assets/img/apple-touch-icon.png">
<link rel="preload" href="/assets/fonts/dm-serif-display-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/assets/fonts/atkinson-next-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/site.css">
<script>document.documentElement.classList.add('js')</script>
<script src="/assets/site.js" defer></script>
<script src="/assets/chat.js" defer></script>{extra_script}
<script>window.goatcounter = {{ no_onload: 'doNotTrack' in navigator && navigator.doNotTrack === '1' }};</script>
<script data-goatcounter="https://fairdraftstudio.goatcounter.com/count" async src="/assets/count.js"></script>
</head>
<body>
<a class="skip" href="#main">{skip}</a>

<header class="top" id="top">
  <div class="wrap top-inner">
    <a class="brand" href="{home_href}" aria-label="{home}">
      {logo}{logo_name}
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
        {logo}{logo_name}
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
    <p>© 2026 Suivel · {f_siret}</p>
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
        ogtitle=meta.get("ogtitle", meta["title"]), logo=LOGO, logo_name=LOGO_NAME,
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

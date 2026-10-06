# fairdraftstudio.fr

The services site: French, with English pages under `/en/`. Static HTML, CSS and a little JavaScript, no dependencies, meant for GitHub Pages.

## Changing a page
1. Edit the fragment in `src/fr/` or `src/en/` (content only — the header, navigation and footer live in the builder).
2. Run `python build/build_site.py`.
3. Preview locally: `python -m http.server 8766` from this folder, then open http://localhost:8766/.
4. Commit, get the review, then publish: `python build/publish.py "What changed"` (rebuilds, refuses uncommitted changes, pushes the tracked files to the public repo; live about a minute later).

**Never edit the generated pages** (`index.html`, `offres/index.html`, `cgv.html`, …): the builder overwrites them.

| Page | Fragment |
|---|---|
| `/` accueil | `src/fr/index.html` |
| `/offres/` | `src/fr/offres.html` |
| `/realisations/` | `src/fr/realisations.html` |
| `/a-propos/` | `src/fr/a-propos.html` |
| `/contact/` | `src/fr/contact.html` |
| `/outils/`, `/outils/lettre-de-relance/` (free tool; script `assets/relance.js`) | `src/fr/outils.html`, `src/fr/outils-lettre-de-relance.html` |
| `/outils/facture-electronique/` (free e-invoicing checker; script `assets/facture-electronique.js`) | `src/fr/outils-facture-electronique.html` |
| `/mentions-legales.html`, `/confidentialite.html`, `/cgv.html` | `src/fr/…` |
| `/en/`, `/en/offers/`, `/en/tools/`, `/en/work/`, `/en/about/`, `/en/contact/` | `src/en/…` |
| 404 page (GitHub Pages serves `/404.html` for any unknown address; `robots: noindex` in its meta block) | `src/fr/404.html` |

The builder also writes `sitemap.xml` (every page except the 404) and `robots.txt`; the final domain is the `SITE` constant at the top of `build/build_site.py`. Every page gets the Open Graph and Twitter tags with the preview image `assets/img/og-fairdraft-1200x630.png` (its HTML source is kept outside this repository).

## What is published
GitHub Pages builds this folder with Jekyll, and `_config.yml` lists what it leaves out of the website: `README.md`, `src/` and `build/`. So `fairdraftstudio.fr/src/…` and `/README.md` answer with the 404 page. This does not hide those files inside a public repository. Do not add a `.nojekyll` file: it switches `_config.yml` off.

Demo videos: the `#demos` section of `src/fr/realisations.html` and `src/en/work.html` (files in `assets/video/`; the home pages link to `#demos`, the menu does not). No autoplay, no third-party player; the text beside each video must match what the video shows.

The builder also adds the `reveal` class (fade-in on scroll) to section heads, quote sheets, steps and list items, so fragments stay free of motion markup.

## Design
Brand colours from the logo (teal `#0F4C5C`, cream `#F6F1EA`, orange `#C2410C`), deep teal `#0B3945` for the header, page banners, call-to-action bands and footer. Headings in DM Serif Display (the logo's face), text in Atkinson Hyperlegible Next, data and "machine" text in Atkinson Hyperlegible Mono; all self-hosted. The only outside request is the visit counter: GoatCounter's `assets/count.js` (self-hosted copy) sends one request per page view to `fairdraftstudio.goatcounter.com`, and none when the browser sends Do Not Track (inline guard written by the builder); no cookie. The privacy page describes it. Every document on the site — the invoice in the hero, the three quotes, the work cards, the form, the legal pages — is a "sheet" with the logo's folded orange corner.

Motion: the hero types "automatisé." and stamps the invoice "Payée"; sections fade in as they enter the view; the header tightens once you scroll; pages cross-fade through the View Transitions API where the browser supports it. Everything respects `prefers-reduced-motion`, and a CSS failsafe shows any faded section after 4 seconds even if the script fails.

## Hosting
GitHub Pages from `main`, custom domain in `CNAME` (`fairdraftstudio.fr`), HTTPS enforced.

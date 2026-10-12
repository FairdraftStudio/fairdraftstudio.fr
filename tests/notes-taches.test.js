// Tests for the page of "Notes de réunion en tâches" (assets/notes-taches.js, src/fr/outils-notes-en-taches.html).
// Run: node --test repos/fairdraftstudio.fr/tests/notes-taches.test.js   (or: node repos/fairdraftstudio.fr/tests/notes-taches.test.js)
// No dependencies, no network. The Worker side is tested in worker/test/notes.test.js.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SITE = path.join(__dirname, '..');
const REPO = path.join(SITE, '..', '..');
const read = (...p) => fs.readFileSync(path.join(...p), 'utf8');
const NT = require(path.join(SITE, 'assets', 'notes-taches.js'));
const NBSP = ' ';

const visibleText = (html) => html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/g, ' ').replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, NBSP).replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"');

// ---------------------------------------------------------------- the pure functions
test('endpoint: the live page talks to the same Worker as the chat; localhost only uses the local mock with ?mock', () => {
  const chat = read(SITE, 'assets', 'chat.js').match(/var LIVE = '(https:\/\/[^']+)\/chat'/)[1];
  assert.equal(NT.LIVE, chat + '/notes');
  assert.equal(NT.endpoint({ hostname: 'suivel.fr', search: '' }), NT.LIVE);
  assert.equal(NT.endpoint({ hostname: 'suivel.fr', search: '?mock' }), NT.LIVE, '?mock does nothing on the live site');
  assert.equal(NT.endpoint({ hostname: 'localhost', search: '' }), NT.LIVE);
  assert.equal(NT.endpoint({ hostname: 'localhost', search: '?mock' }), 'http://localhost:8787/notes');
  assert.equal(NT.endpoint({ hostname: '127.0.0.1', search: '?a=1&mock' }), 'http://localhost:8787/notes');
  assert.equal(NT.endpoint({ hostname: 'suivel.fr', search: '' }, 'http://x.test/notes'), 'http://x.test/notes');
});

test('counter: same limits as the Worker, characters not UTF-16 units, clear problems', () => {
  assert.equal(NT.MAX_CHARS, 6000);
  assert.equal(NT.counter('a'.repeat(6000)).problem, '');
  const over = NT.counter('a'.repeat(6001));
  assert.ok(over.over);
  assert.match(over.problem, /retirez 1 caractères/);
  assert.equal(NT.counter('😀'.repeat(6000)).problem, '', 'an emoji is one character, as the Worker counts it');
  assert.equal(NT.counter('😀'.repeat(6000)).n, 6000);
  assert.match(NT.counter('').problem, /Collez d’abord/);
  assert.match(NT.counter('   \n ').problem, /Collez d’abord/);
  assert.match(NT.counter('ok').problem, /trop courtes/);
  assert.equal(NT.counter('a'.repeat(20)).problem, '');
  assert.equal(NT.counter('a'.repeat(565)).label, `565 / 6${NBSP}000${NBSP}caractères`);
  assert.equal(NT.counter('a'.repeat(6050)).label, `6${NBSP}050 / 6${NBSP}000${NBSP}caractères : 50${NBSP}de trop`);
});

test('view: « à confirmer » is shown as such, flagged, in any spelling; other values are kept', () => {
  const v = NT.view({
    decisions: ['Valider le stand'],
    taches: [
      { quoi: 'réserver le stand', qui: 'Camille', quand: 'avant fin octobre' },
      { quoi: 'Mettre à jour le site', qui: 'à confirmer', quand: 'À confirmer.' },
      { quoi: 'Envoyer le plan', qui: 'moi', quand: '' },
    ],
    a_confirmer: ['Qui paie ?'],
    taches_texte: '- x', email: { objet: 'Récapitulatif', corps: 'Bonjour,' },
  });
  assert.deepEqual(v.tasks[0], { quoi: 'Réserver le stand', qui: 'Camille', quand: 'avant fin octobre', quiTbc: false, quandTbc: false });
  assert.deepEqual([v.tasks[1].qui, v.tasks[1].quand, v.tasks[1].quiTbc, v.tasks[1].quandTbc], [NT.TBC, NT.TBC, true, true]);
  assert.deepEqual([v.tasks[2].qui, v.tasks[2].quand, v.tasks[2].quandTbc], ['Moi', NT.TBC, true], 'moi is capitalised, an empty deadline is « à confirmer »');
  assert.equal(v.tbcCount, 2);
  assert.equal(v.summary, '1 décision, 3 tâches, 1 point à confirmer');
  assert.equal(v.emailSubject, 'Récapitulatif');
  assert.equal(v.emailBody, 'Bonjour,');
  assert.equal(v.tasksText, '- x');
});

test('view: anything unexpected from the network becomes empty lists, never an exception', () => {
  for (const bad of [null, undefined, 'x', 42, [], {}, { taches: 'non', decisions: [1, null, '  '], a_confirmer: {}, email: 'x' }, { taches: [null, {}, { quoi: 3 }, { quoi: '  ' }] }]) {
    const v = NT.view(bad);
    assert.deepEqual([v.decisions, v.tasks, v.questions, v.emailSubject, v.emailBody], [[], [], [], '', ''], JSON.stringify(bad));
    assert.equal(v.summary, '0 décision, 0 tâche, 0 point à confirmer');
  }
});

test('errorMessage: the Worker’s French message when there is one, else a polite one with the contact page', () => {
  assert.equal(NT.errorMessage({ ok: false, message: 'Trop de demandes.' }), 'Trop de demandes.');
  for (const bad of [null, {}, { message: '' }, { message: 5 }]) assert.match(NT.errorMessage(bad), /momentanément indisponible.*suivel\.fr\/contact\//);
});

test('typo: no-break space before : ; ? ! % € and inside « »', () => {
  assert.equal(NT.typo('Quoi : 5 % ? « oui » !'), `Quoi${NBSP}: 5${NBSP}%${NBSP}? «${NBSP}oui${NBSP}»${NBSP}!`);
});

// ---------------------------------------------------------------- the example is the one that was tested against a real model
test('the page’s example is identical to the one in the Worker tests and in the real-model check', () => {
  const fromTemplate = (file, re) => read(REPO, ...file).match(re)[1];
  const cli = fromTemplate(['worker', 'test', 'cli-check.mjs'], /example: `([\s\S]*?)`,/);
  const unit = fromTemplate(['worker', 'test', 'notes.test.js'], /EXAMPLE_NOTES = `([\s\S]*?)`;/);
  assert.equal(NT.EXAMPLE, cli);
  assert.equal(NT.EXAMPLE, unit);
  assert.ok(NT.counter(NT.EXAMPLE).problem === '');
  assert.match(NT.EXAMPLE, /Atelier Exemple/, 'clearly fictional');
});

// ---------------------------------------------------------------- the page itself
test('the script keeps nothing in the browser and builds the page from text nodes only', () => {
  const js = read(SITE, 'assets', 'notes-taches.js').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '');   // comments may name what the code avoids
  assert.ok(!/localStorage|sessionStorage|indexedDB|document\.cookie|innerHTML|outerHTML|insertAdjacentHTML|eval\(/.test(js));
  assert.ok(/credentials: 'omit'/.test(js) && /referrerPolicy: 'no-referrer'/.test(js));
  assert.ok(/go\.disabled = on/.test(js), 'the button is disabled while a request runs');
  assert.ok(!/console\.(log|info)/.test(js));
});

test('every element the script looks up exists in the page, and the required buttons are there', () => {
  const js = read(SITE, 'assets', 'notes-taches.js');
  const html = read(SITE, 'src', 'fr', 'outils-notes-en-taches.html');
  const ids = new Set([...js.matchAll(/\$\('(nt-[a-z-]+)'\)/g)].map((m) => m[1]));
  ids.add('nt-app');
  assert.ok(ids.size > 15);
  for (const id of ids) assert.ok(html.includes(`id="${id}"`), `missing #${id}`);
  const text = visibleText(html);
  for (const label of ['Essayer avec un exemple', 'Copier les tâches', 'Copier l\'e-mail', 'Effacer', 'Transformer mes notes']) assert.ok(text.includes(label), label);
  for (const section of ['Décisions prises', 'Tâches', 'Points à confirmer', 'E-mail récapitulatif']) assert.ok(text.includes(section), section);
});

test('the pasted notes do not come back after a reload (the privacy page says they disappear)', () => {
  // review 11 Oct: browsers may restore a textarea on reload or when a closed tab is reopened
  const html = read(SITE, 'src', 'fr', 'outils-notes-en-taches.html');
  assert.match(html, /<textarea id="nt-notes"[^>]*autocomplete="off"/);
  const js = read(SITE, 'assets', 'notes-taches.js');
  assert.match(js, /notes\.value = '';[^\n]*\n\s*updateCount\(\);/);
});

test('the notice before sending says where the text goes, who keeps nothing, and what not to paste; the result says it is AI work', () => {
  const text = visibleText(read(SITE, 'src', 'fr', 'outils-notes-en-taches.html'));
  assert.ok(text.includes('Votre texte est envoyé à Anthropic (États-Unis) pour être traité'));
  assert.ok(text.includes('Suivel ne le conserve pas'));
  assert.match(text, /ne collez ni données sensibles \(santé, coordonnées bancaires\)/);
  assert.ok(text.includes('Détails dans la politique de confidentialité'));
  assert.ok(text.includes('Résultat produit par une IA'));
  assert.ok(!/tout se passe dans votre navigateur|n'est envoyé nulle part|ne quitte (pas )?votre/.test(text), 'this tool is not local: no sentence that says so');
});

test('page meta: indexable (ships with the 13 Oct publish), kicker, title and description lengths, French only', () => {
  const html = read(SITE, 'src', 'fr', 'outils-notes-en-taches.html');
  const meta = Object.fromEntries(html.match(/^<!--meta\n([\s\S]*?)\n-->/)[1].split('\n').map((l) => [l.split(':')[0], l.slice(l.indexOf(':') + 1).trim()]));
  assert.equal(meta.robots, undefined, 'noindex removed when the tool ships');
  assert.equal(meta.kicker, 'Outil gratuit');
  assert.equal(meta.path, 'outils/notes-en-taches/index.html');
  assert.equal(meta.script, '/assets/notes-taches.js');
  assert.equal(meta.switch, '/en/tools/', 'no English page: the language switch goes to the English tools page');
  const unesc = (s) => s.replace(/&nbsp;/g, NBSP);
  assert.ok(unesc(meta.title).length <= 60, 'title ' + unesc(meta.title).length);
  assert.ok(unesc(meta.description).length <= 160 && unesc(meta.description).length >= 70, 'description ' + unesc(meta.description).length);
  assert.ok(unesc(meta.title).endsWith(' · Suivel'));
  assert.ok(!fs.existsSync(path.join(SITE, 'src', 'en', 'tools-notes.html')));
});

test('built page: indexable, in the sitemap, canonical, loads its script, no English hreflang', () => {
  const built = read(SITE, 'outils', 'notes-en-taches', 'index.html');
  assert.ok(!built.includes('content="noindex"'));
  assert.ok(built.includes('<script src="/assets/notes-taches.js" defer></script>'));
  assert.ok(built.includes('<link rel="canonical" href="https://suivel.fr/outils/notes-en-taches/">'));
  assert.ok(!/<link rel="alternate"/.test(built), 'French only: no hreflang alternate (the header switch link goes to /en/tools/)');
  assert.ok(read(SITE, 'sitemap.xml').includes('https://suivel.fr/outils/notes-en-taches/'));
  assert.ok(built.includes('<script src="/assets/chat.js" defer></script>'), 'the chat widget is on every page');
});

test('French typography in the page text: no plain space before : ; ? !, « » with no-break spaces', () => {
  for (const file of [['src', 'fr', 'outils-notes-en-taches.html'], ['outils', 'notes-en-taches', 'index.html']]) {
    const html = read(SITE, ...file);
    const text = visibleText(html.replace(/<(textarea|input)[^>]*>/g, ' '));
    const bad = [...text.matchAll(/[\p{L}\d.,)] [:;?!](?=\s|$)/gu)].map((m) => m[0]);
    assert.deepEqual(bad, [], file.join('/'));
    assert.ok(!/« [^»]|[^«] »/.test(text), 'guillemets without no-break spaces');
    assert.ok(!/[Ff]ranchement|[Hh]onnêtement|révolutionn|booster|sur mesure/.test(text));
  }
});

test('the /outils/ page lists the tool, and no longer says that everything stays in the browser', () => {
  const built = read(SITE, 'outils', 'index.html');
  assert.ok(built.includes('href="/outils/notes-en-taches/"'));
  const text = visibleText(built);
  assert.ok(!/Tout se calcule dans votre navigateur/.test(text));
  assert.match(text, /La plupart fonctionnent entièrement dans votre navigateur/);
  assert.match(text, /Seule exception\s*: «\s*Notes de réunion en tâches\s*» envoie votre texte à une IA pour le traiter/);
  // 11 Oct: the English tools page lists the tool too (free-tool step 6, six places), so it must not say
  // that everything runs in the browser any more
  const en = read(SITE, 'en', 'tools', 'index.html');
  assert.ok(en.includes('href="/outils/notes-en-taches/"'));
  const enText = visibleText(en);
  assert.ok(!/Everything runs in your browser/.test(enText));
  assert.match(enText, /The exception is .Meeting notes to tasks.: it sends your text to an AI to be processed/);   // EN name of the tool since 12 Oct (one name per tool)
});

test('the privacy page covers the tool next to the assistant (same processors, 30 days, nothing kept by the server)', () => {
  const text = visibleText(read(SITE, 'confidentialite.html'));
  assert.ok(text.includes('Notes de réunion en tâches'));
  assert.ok(text.includes('Transformer mes notes'));
  assert.match(text, /même[s]? prestataires que l'assistant IA \(Cloudflare, puis Anthropic/);
  assert.match(text, /Anthropic supprime le texte et le résultat de ses serveurs sous 30 jours/);
  assert.match(text, /Mon serveur ne garde ni votre texte ni le résultat/);
  assert.match(text, /Les prénoms des participants suffisent/);
});

test('the CSS block of the tool is present once, after the chat block, and nothing else follows the chat marker but plain blocks', () => {
  const css = read(SITE, 'assets', 'site.css');
  assert.equal(css.split('/* notes en tâches */').length, 2);
  assert.ok(css.indexOf('/* notes en tâches */') > css.indexOf('/* chat assistant */'));
  assert.ok(!css.slice(css.indexOf('/* chat assistant */')).includes('/* ---------- '));
});

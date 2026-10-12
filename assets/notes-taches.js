// Notes de réunion en tâches: the page of the second free tool (docs/tools/notes-en-taches.md).
// Unlike the other tools this one is NOT local: the pasted text is sent, when the visitor clicks, to the Worker (POST /notes),
// which passes it to Anthropic. Nothing is stored here (no cookie, no localStorage); the result lives in the page only.
// Part 1 = pure functions (tested with Node: tests/notes-taches.test.js). Part 2 = the DOM code, text inserted as text nodes only.
var NotesTaches = (function () {
  'use strict';

  var NBSP = ' ';
  var MAX_CHARS = 6000;            // same limits as the Worker, which enforces them
  var MIN_CHARS = 20;
  var TIMEOUT_MS = 60000;
  var TBC = 'à confirmer';
  var LIVE = 'https://fairdraft-chat.fairdraft-chat.workers.dev/notes';   // the same Worker as the chat assistant

  // Fictional notes for "Essayer avec un exemple" (clearly fictional: "Atelier Exemple"). Kept identical to the CLI check case.
  var EXAMPLE = [
    'Point hebdo Atelier Exemple',
    'Présents : Camille (gérante), Léa (graphiste), Hugo (commercial)',
    '',
    '- Salon de printemps : on y va, stand de 6 m² validé. Camille réserve avant fin octobre.',
    '- Flyers : Léa fait 2 maquettes pour jeudi. Impression chez le même imprimeur que l\'an dernier ?',
    '- Devis boulangerie Martin : Hugo relance par téléphone lundi. Remise de 5 % OK si commande avant le 15 novembre.',
    '- Site : il faudrait mettre à jour les horaires, voir qui s\'en occupe',
    '- Budget salon pas encore chiffré, à voir avec le comptable',
    '- Prochaine réunion mardi 20 octobre, 9 h'
  ].join('\n');

  function typo(s) { return String(s).replace(/ ([:;?!%€»])/g, NBSP + '$1').replace(/« /g, '«' + NBSP); }
  function str(v) { return typeof v === 'string' ? v : ''; }
  function fold(s) { return str(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[.\s]+$/g, '').trim(); }
  function isTbc(v) { var f = fold(v); return !f || f === 'a confirmer'; }
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function plural(n, one, many) { return n + ' ' + (n > 1 ? many : one); }
  function groups(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP); }
  function length(s) { return Array.from(String(s)).length; }   // characters, as the Worker counts them (not UTF-16 units)

  /** Where the page sends the notes: the Worker; on localhost the local mock with ?mock (worker/test/dev-server.js). */
  function endpoint(loc, override) {
    if (override) return override;
    var local = loc.hostname === 'localhost' || loc.hostname === '127.0.0.1';
    return local && /[?&]mock\b/.test(loc.search || '') ? 'http://localhost:8787/notes' : LIVE;
  }

  /** The counter under the text box and whether the text can be sent. */
  function counter(text) {
    var n = length(text);
    var trimmed = length(String(text).trim());
    var over = trimmed > MAX_CHARS;
    return {
      n: n,
      over: over,
      label: groups(n) + ' / ' + groups(MAX_CHARS) + NBSP + 'caractères' + (over ? ' : ' + groups(trimmed - MAX_CHARS) + NBSP + 'de trop' : ''),
      problem: !trimmed ? 'Collez d’abord vos notes.' :
        over ? 'Ces notes sont trop longues : retirez ' + groups(trimmed - MAX_CHARS) + ' caractères ou traitez une réunion à la fois.' :
        trimmed < MIN_CHARS ? 'Ces notes sont trop courtes pour en tirer quelque chose. Collez quelques lignes.' : ''
    };
  }

  /** What the Worker returned -> what the page shows. Defensive: anything unexpected becomes an empty list. */
  function view(result) {
    var r = result && typeof result === 'object' ? result : {};
    var list = function (v) { return (Array.isArray(v) ? v : []).filter(function (x) { return typeof x === 'string' && x.trim(); }); };
    var tasks = (Array.isArray(r.taches) ? r.taches : []).filter(function (t) { return t && typeof t.quoi === 'string' && t.quoi.trim(); }).map(function (t) {
      return {
        quoi: cap(t.quoi.trim()),
        qui: isTbc(t.qui) ? TBC : cap(str(t.qui).trim()),
        quand: isTbc(t.quand) ? TBC : str(t.quand).trim(),
        quiTbc: isTbc(t.qui),
        quandTbc: isTbc(t.quand)
      };
    });
    var email = r.email && typeof r.email === 'object' ? r.email : {};
    var v = {
      decisions: list(r.decisions),
      tasks: tasks,
      questions: list(r.a_confirmer),
      emailSubject: str(email.objet),
      emailBody: str(email.corps),
      tasksText: str(r.taches_texte)
    };
    v.summary = plural(v.decisions.length, 'décision', 'décisions') + ', ' + plural(tasks.length, 'tâche', 'tâches') +
      ', ' + plural(v.questions.length, 'point à confirmer', 'points à confirmer');
    v.tbcCount = tasks.filter(function (t) { return t.quiTbc || t.quandTbc; }).length;
    return v;
  }

  /** The message to show for a failed call (the Worker's own French message when there is one). */
  function errorMessage(data) {
    return data && typeof data.message === 'string' && data.message
      ? data.message
      : 'L’outil est momentanément indisponible. Réessayez dans quelques minutes, ou écrivez via la page Contact : https://suivel.fr/contact/';
  }

  return { NBSP: NBSP, MAX_CHARS: MAX_CHARS, MIN_CHARS: MIN_CHARS, TBC: TBC, LIVE: LIVE, EXAMPLE: EXAMPLE, typo: typo, isTbc: isTbc, cap: cap, plural: plural,
    groups: groups, length: length, endpoint: endpoint, counter: counter, view: view, errorMessage: errorMessage, TIMEOUT_MS: TIMEOUT_MS };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = NotesTaches;

// ---------- Part 2: the page ----------
(function () {
  'use strict';
  if (typeof document === 'undefined') return;
  var NT = NotesTaches;
  var app = document.getElementById('nt-app');
  if (!app) return;

  var $ = function (id) { return document.getElementById(id); };
  var form = $('nt-form'), notes = $('nt-notes'), go = $('nt-go'), status = $('nt-status'), count = $('nt-count');
  var ENDPOINT = NT.endpoint(location, window.SUIVEL_NOTES_ENDPOINT);
  var busy = false, epoch = 0, controller = null, last = null;

  function say(text, isError) {
    status.textContent = NT.typo(text);
    status.classList.toggle('nt-error', !!isError);
  }
  function clear(node) { node.textContent = ''; }
  function li(text) { var n = document.createElement('li'); n.textContent = NT.typo(text); return n; }

  function updateCount() {
    var c = NT.counter(notes.value);
    count.textContent = c.label;
    count.classList.toggle('is-over', c.over);
  }

  function showEmpty(on) { $('nt-empty').hidden = !on; }
  function hideResult() { $('nt-result').hidden = true; last = null; showEmpty(true); }

  function render(result) {
    var v = NT.view(result);
    last = v;
    var d = $('nt-decisions'); clear(d);
    v.decisions.forEach(function (t) { d.appendChild(li(t)); });
    $('nt-decisions-none').hidden = v.decisions.length > 0;

    var body = $('nt-tasks'); clear(body);
    v.tasks.forEach(function (t) {
      var tr = document.createElement('tr');
      [['Quoi', t.quoi, false], ['Qui', t.qui, t.quiTbc], ['Pour quand', t.quand, t.quandTbc]].forEach(function (c) {
        var td = document.createElement('td');
        td.setAttribute('data-label', c[0]);
        if (c[2]) { var pill = document.createElement('span'); pill.className = 'nt-tbc'; pill.textContent = NT.TBC; td.appendChild(pill); }
        else td.textContent = NT.typo(c[1]);
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
    $('nt-tasks-table').hidden = !v.tasks.length;
    $('nt-tasks-none').hidden = v.tasks.length > 0;
    $('nt-copy-tasks').hidden = !v.tasks.length;

    var q = $('nt-questions'); clear(q);
    v.questions.forEach(function (t) { q.appendChild(li(t)); });
    $('nt-questions-none').hidden = v.questions.length > 0;

    $('nt-email-subject').textContent = v.emailSubject;
    $('nt-email-body').textContent = v.emailBody;

    showEmpty(false);
    $('nt-result').hidden = false;
    say('Résultat prêt : ' + v.summary + '.');
  }

  function setBusy(on) {
    busy = on;
    go.disabled = on;
    go.textContent = NT.typo(on ? 'Lecture de vos notes…' : 'Transformer mes notes');
    $('nt-out').setAttribute('aria-busy', on ? 'true' : 'false');
  }

  function run() {
    if (busy) return;
    var problem = NT.counter(notes.value).problem;
    if (problem) { say(problem, true); notes.focus(); return; }
    var mine = ++epoch;
    setBusy(true);
    say('L’IA lit vos notes, cela prend quelques secondes.');
    controller = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, NT.TIMEOUT_MS) : null;
    var done = function () { if (timer) clearTimeout(timer); controller = null; if (mine === epoch) setBusy(false); };

    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: notes.value, site_web: $('nt-site').value }),
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: controller ? controller.signal : undefined
    }).then(function (res) {
      return res.json().catch(function () { return null; });
    }).then(function (data) {
      if (mine !== epoch) return;
      done();
      if (!data || !data.ok || !data.result) { hideResult(); say(NT.errorMessage(data), true); return; }
      render(data.result);
      if (window.matchMedia && window.matchMedia('(max-width: 1080px)').matches) {
        $('nt-result').scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
      }
    }).catch(function () {
      if (mine !== epoch) return;
      done();
      say(NT.errorMessage(null), true);
    });
  }

  function copyText(text, message) {
    var fail = function () { say('La copie a échoué : sélectionnez le texte à la main.', true); };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(function () { say(message); }, fail);
    } else {
      var area = document.createElement('textarea');
      area.setAttribute('aria-hidden', 'true');
      area.value = text; document.body.appendChild(area); area.select();
      try { document.execCommand('copy'); say(message); } catch (e) { fail(); }
      document.body.removeChild(area);
    }
  }

  form.addEventListener('submit', function (event) { event.preventDefault(); run(); });
  notes.addEventListener('input', function () { updateCount(); if (status.classList.contains('nt-error')) say(''); });
  $('nt-example').addEventListener('click', function () {
    if (busy) return;
    notes.value = NT.EXAMPLE; updateCount(); say(''); hideResult();
    notes.focus(); notes.setSelectionRange(0, 0); notes.scrollTop = 0;   // show the start of the text, not the caret at the end
  });
  $('nt-clear').addEventListener('click', function () {
    epoch += 1; if (controller) controller.abort(); setBusy(false);
    notes.value = ''; updateCount(); say(''); hideResult(); notes.focus();
  });
  $('nt-copy-tasks').addEventListener('click', function () { if (last) copyText(last.tasksText, 'Tâches copiées.'); });
  $('nt-copy-email').addEventListener('click', function () { if (last) copyText(last.emailBody, 'E-mail copié.'); });
  $('nt-copy-subject').addEventListener('click', function () { if (last) copyText(last.emailSubject, 'Objet copié.'); });

  notes.value = '';   // a browser may restore the pasted text on reload: the privacy page says it disappears
  updateCount();
  $('nt-site').value = '';
  app.classList.add('is-ready');
}());

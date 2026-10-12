// Combien vous coûtent vos tâches répétitives ? Everything runs in the browser: nothing typed here is sent or stored.
// Part 1 = pure functions (numbers, durations, the yearly sums, texts), tested with Node (tests/cout-taches.test.js).
// Part 2 = DOM code. Spec and choices: docs/tools/cout-taches.md. No legal fact, no outside figure: every number comes from the visitor,
// except two choices of this tool, both written on the page: 45 working weeks a year (editable) and working days of 7 hours.
var CoutTaches = (function () {
  'use strict';

  var NBSP = ' ';
  var NNBSP = ' ';
  // French typography: a no-break space before : ; ? ! % € and inside « »
  function typo(s) { return String(s).replace(/ ([:;?!%€»])/g, NBSP + '$1').replace(/« /g, '«' + NBSP); }

  var DEFAULT_WEEKS = 45;          // proposed by Suivel: 52 weeks minus holidays and public holidays; the visitor changes it
  var DAY_MINUTES = 7 * 60;        // a working day of 7 hours, to turn hours into days (a unit, not a rule)
  var MONTHS_PER_YEAR = 12;
  var LIMITS = { minutes: [1, 480], count: [1, 100], rate: [1, 1000], weeks: [1, 52] };

  // "12", "12,5", "12.5", "1 250" -> number; empty -> null; anything else -> NaN
  function parseNumber(text) {
    var s = String(text == null ? '' : text).replace(/[\s  ]/g, '').replace(',', '.');
    if (s === '') return null;
    if (!/^\d+(\.\d+)?$/.test(s)) return NaN;
    return Number(s);
  }

  function groupThousands(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, NNBSP); }
  function formatEuros(n) { return groupThousands(Math.round(n)) + NBSP + '€'; }
  function formatRate(n) {
    var s = (Math.round(n * 100) / 100).toString().replace('.', ',');
    return groupThousands(s.split(',')[0]) + (s.indexOf(',') > -1 ? ',' + s.split(',')[1] : '') + NBSP + '€';
  }
  // minutes -> "45 min", "4 h 04", "183 h"
  function formatDuration(minutes) {
    var m = Math.round(minutes);
    if (m < 60) return m + NBSP + 'min';
    var h = Math.floor(m / 60), r = m % 60;
    return groupThousands(h) + NBSP + 'h' + (r ? NBSP + (r < 10 ? '0' : '') + r : '');
  }
  function plural(n, one, many) { return n + NBSP + (n > 1 ? many : one); }

  function inRange(v, key) { return v >= LIMITS[key][0] && v <= LIMITS[key][1]; }

  // settings: { rate: text, weeks: text } -> { rate: number|null, weeks: number, errors: [] }
  function readSettings(raw) {
    var errors = [];
    var rate = parseNumber(raw && raw.rate);
    if (rate !== null && (isNaN(rate) || !inRange(rate, 'rate'))) {
      errors.push('La valeur d\'une heure doit être un nombre entre 1 et 1' + NNBSP + '000 €.');
      rate = null;
    }
    var weeks = parseNumber(raw && raw.weeks);
    if (weeks === null) weeks = DEFAULT_WEEKS;
    else if (isNaN(weeks) || weeks % 1 !== 0 || !inRange(weeks, 'weeks')) {
      errors.push('Le nombre de semaines travaillées doit être un nombre entier entre 1 et 52 : l\'outil compte 45 semaines en attendant.');
      weeks = DEFAULT_WEEKS;
    }
    return { rate: rate, weeks: weeks, errors: errors };
  }

  // one task: { name, minutes: text, count: text, unit: 'semaine'|'mois' } -> { blank } or { error } or { name, minutesYear }
  function readTask(raw, index, weeks) {
    var name = String(raw && raw.name || '').replace(/\s+/g, ' ').trim();
    var minutes = parseNumber(raw && raw.minutes), count = parseNumber(raw && raw.count);
    var label = name || 'Tâche ' + (index + 1);
    if (minutes === null && count === null) return { blank: true, name: label };
    if (minutes === null) return { error: 'indiquez combien de minutes elle prend à chaque fois.', name: label };
    if (isNaN(minutes) || !inRange(minutes, 'minutes')) return { error: 'les minutes doivent être un nombre entre 1 et 480.', name: label };
    if (count === null) return { error: 'indiquez combien de fois elle revient.', name: label };
    if (isNaN(count) || count % 1 !== 0 || !inRange(count, 'count')) return { error: 'le nombre de fois doit être un nombre entier entre 1 et 100.', name: label };
    var unit = raw.unit === 'mois' ? 'mois' : 'semaine';
    var times = count * (unit === 'mois' ? MONTHS_PER_YEAR : weeks);
    return { name: label, minutes: minutes, count: count, unit: unit, timesYear: times, minutesYear: Math.round(minutes * times) };
  }

  // tasks + settings -> the whole result, sorted by time (= by cost: one rate for all)
  function analyse(rawTasks, rawSettings) {
    var settings = readSettings(rawSettings);
    var items = [], problems = [];
    (rawTasks || []).forEach(function (raw, i) {
      var t = readTask(raw, i, settings.weeks);
      if (t.blank) return;
      if (t.error) { problems.push({ index: i, name: t.name, message: t.error }); return; }
      t.cost = settings.rate === null ? null : Math.round(t.minutesYear / 60 * settings.rate);
      items.push(t);
    });
    items.sort(function (a, b) { return b.minutesYear - a.minutesYear; });
    var total = items.reduce(function (s, t) { return s + t.minutesYear; }, 0);
    items.forEach(function (t) { t.share = total ? Math.round(t.minutesYear / total * 100) : 0; });
    var top = items[0] || null;
    // tasks tied at the top (same yearly time): no "heaviest" then (review 12 Oct)
    var tied = top ? items.filter(function (t) { return t.minutesYear === top.minutesYear; }) : [];
    return {
      items: items, problems: problems, settingsErrors: settings.errors,
      rate: settings.rate, weeks: settings.weeks,
      totalMinutesYear: total,
      minutesPerWeek: Math.round(total / settings.weeks),
      // under one 7-hour day: 0 ("moins d'une journée"); never round 3 h 45 up to a day (review 12 Oct)
      days: total < DAY_MINUTES ? 0 : Math.round(total / DAY_MINUTES),
      totalCost: settings.rate === null ? null : Math.round(total / 60 * settings.rate),
      top: top,
      tied: tied.length > 1 ? tied : []
    };
  }

  // "20 min, 4 fois par semaine"
  function frequency(t) { return String(t.minutes).replace('.', ',') + NBSP + 'min, ' + t.count + NBSP + 'fois par ' + t.unit; }

  // « A », « B » et « C »
  function quoteList(names) {
    var q = names.map(function (n) { return '« ' + n + ' »'; });
    return q.length > 1 ? q.slice(0, -1).join(', ') + ' et ' + q[q.length - 1] : q[0];
  }

  // the sentences under the figures (the page shows them as written here); one task, ties and tiny totals have their own wording
  function summaryText(res) {
    if (!res.items.length) return '';
    var one = res.items.length === 1;
    var week = res.minutesPerWeek >= 1 ? 'environ ' + formatDuration(res.minutesPerWeek) : 'moins d\'une minute';
    var days = res.days < 1 ? 'moins d\'une journée de 7' + NBSP + 'h'
      : 'environ ' + plural(res.days, 'journée de 7' + NBSP + 'h', 'journées de 7' + NBSP + 'h');
    var s = (one ? 'Cette tâche vous prend ' : 'Ces tâches vous prennent ') + week + ' par semaine travaillée, soit ' +
      formatDuration(res.totalMinutesYear) + ' par an (' + days + ').';
    if (res.totalCost !== null) s += ' À ' + formatRate(res.rate) + ' de l\'heure, cela représente environ ' + formatEuros(res.totalCost) + ' par an.';
    else s += ' Indiquez ce que vaut une heure de votre temps pour voir ce que cela représente en euros.';
    return typo(s);
  }
  function topText(res) {
    var t = res.top;
    if (!t) return '';
    var euros = t.cost !== null ? ', environ ' + formatEuros(t.cost) : '';
    var s;
    if (res.items.length === 1) {
      s = 'Votre tâche « ' + t.name + ' » : ' + formatDuration(t.minutesYear) + ' par an' + euros + '.';
    } else if (res.tied.length) {
      s = 'À égalité en tête : ' + quoteList(res.tied.map(function (x) { return x.name; })) + ', chacune ' +
        formatDuration(t.minutesYear) + ' par an' + (t.cost !== null ? ', soit environ ' + formatEuros(t.cost) : '') + '.';
    } else {
      s = 'Votre tâche la plus lourde : « ' + t.name + ' », ' + formatDuration(t.minutesYear) + ' par an' + euros + '.';
    }
    return typo(s);
  }

  // fictional example (fictional figures, neutral names): 5 tasks, 40 EUR an hour
  var EXAMPLE = {
    tasks: [
      { name: 'Relancer les factures impayées', minutes: '10', count: '3', unit: 'semaine' },
      { name: 'Mettre au propre les comptes rendus', minutes: '20', count: '4', unit: 'semaine' },
      { name: 'Recopier des demandes dans un tableau', minutes: '5', count: '10', unit: 'semaine' },
      { name: 'Préparer des devis qui se ressemblent', minutes: '30', count: '2', unit: 'semaine' },
      { name: 'Rapprocher les relevés bancaires', minutes: '90', count: '1', unit: 'mois' }
    ],
    rate: '40', weeks: '45'
  };
  var SUGGESTIONS = [
    'Relancer les factures impayées',
    'Mettre au propre les comptes rendus',
    'Recopier des demandes dans un tableau',
    'Classer les pièces jointes',
    'Répondre aux mêmes questions par e-mail',
    'Préparer des devis qui se ressemblent'
  ];

  return {
    NBSP: NBSP, NNBSP: NNBSP, DEFAULT_WEEKS: DEFAULT_WEEKS, LIMITS: LIMITS, EXAMPLE: EXAMPLE, SUGGESTIONS: SUGGESTIONS,
    typo: typo, parseNumber: parseNumber, formatEuros: formatEuros, formatRate: formatRate, formatDuration: formatDuration,
    plural: plural, readSettings: readSettings, readTask: readTask, analyse: analyse, frequency: frequency,
    summaryText: summaryText, topText: topText
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = CoutTaches;

// ---------- Part 2: the page ----------
(function () {
  'use strict';
  if (typeof document === 'undefined') return;
  var CT = CoutTaches;
  var app = document.getElementById('ct-app');
  if (!app) return;

  var $ = function (id) { return document.getElementById(id); };
  var el = function (tag, props, kids) {
    var node = document.createElement(tag);
    Object.keys(props || {}).forEach(function (k) {
      if (k === 'text') node.textContent = CT.typo(props[k]);
      else if (k === 'class') node.className = props[k];
      else node.setAttribute(k, props[k]);
    });
    (kids || []).forEach(function (kid) { node.appendChild(typeof kid === 'string' ? document.createTextNode(CT.typo(kid)) : kid); });
    return node;
  };
  var list = $('ct-tasks'), status = $('ct-status'), uid = 0;

  function say(text) { status.textContent = CT.typo(text); }

  function field(id, label, input) {
    return el('div', { class: 'field' }, [el('label', { for: id, text: label }), input]);
  }
  function addTask(values) {
    var n = ++uid, v = values || {};
    var name = el('input', { id: 'ct-name-' + n, type: 'text', autocomplete: 'off', maxlength: '120', placeholder: 'Par exemple : classer les pièces jointes' });
    var minutes = el('input', { id: 'ct-min-' + n, type: 'text', inputmode: 'decimal', autocomplete: 'off' });
    var count = el('input', { id: 'ct-count-' + n, type: 'text', inputmode: 'numeric', autocomplete: 'off' });
    var unit = el('select', { id: 'ct-unit-' + n }, [el('option', { value: 'semaine', text: 'par semaine' }), el('option', { value: 'mois', text: 'par mois' })]);
    name.value = v.name || ''; minutes.value = v.minutes || ''; count.value = v.count || ''; unit.value = v.unit === 'mois' ? 'mois' : 'semaine';
    var del = el('button', { type: 'button', class: 'ct-del', 'aria-label': 'Supprimer cette tâche' }, ['×']);
    var item = el('li', { class: 'ct-task' }, [
      el('div', { class: 'ct-task-name' }, [field(name.id, 'Tâche', name), del]),
      el('div', { class: 'ct-task-nums' }, [
        field(minutes.id, 'Minutes à chaque fois', minutes),
        field(count.id, 'Combien de fois', count),
        field(unit.id, 'Fréquence', unit)
      ]),
      el('p', { class: 'ct-err', role: 'status' })
    ]);
    item._inputs = { name: name, minutes: minutes, count: count, unit: unit };
    del.addEventListener('click', function () {
      var next = item.nextElementSibling || item.previousElementSibling;
      list.removeChild(item);
      if (!list.children.length) addTask();
      render();
      (next && next._inputs ? next._inputs.name : $('ct-add')).focus();
    });
    list.appendChild(item);
    return item;
  }
  function readTasks() {
    return Array.prototype.map.call(list.children, function (item) {
      var i = item._inputs;
      return { name: i.name.value, minutes: i.minutes.value, count: i.count.value, unit: i.unit.value };
    });
  }
  function loadTasks(tasks) {
    while (list.firstChild) list.removeChild(list.firstChild);
    (tasks.length ? tasks : [{}]).forEach(addTask);
  }

  function render() {
    var res = CT.analyse(readTasks(), { rate: $('ct-rate').value, weeks: $('ct-weeks').value });
    // errors next to their task, settings errors under the settings
    Array.prototype.forEach.call(list.children, function (item, i) {
      var p = item.querySelector('.ct-err'), found = res.problems.filter(function (x) { return x.index === i; })[0];
      p.textContent = found ? CT.typo('À compléter : ' + found.message) : '';
    });
    $('ct-settings-note').textContent = res.settingsErrors.map(CT.typo).join(' ');

    var out = $('ct-result');
    $('ct-empty').hidden = res.items.length > 0;
    out.hidden = !res.items.length;
    $('ct-summary').textContent = CT.summaryText(res);
    if (!res.items.length) return;

    var stats = $('ct-stats');
    while (stats.firstChild) stats.removeChild(stats.firstChild);
    var stat = function (label, value) { stats.appendChild(el('div', {}, [el('dt', { text: label }), el('dd', { text: value })])); };
    stat('Par semaine', CT.formatDuration(res.minutesPerWeek));
    stat('Par an', CT.formatDuration(res.totalMinutesYear));
    stat('En euros, par an', res.totalCost === null ? '—' : CT.formatEuros(res.totalCost));

    var body = $('ct-rows');
    while (body.firstChild) body.removeChild(body.firstChild);
    res.items.forEach(function (t, i) {
      body.appendChild(el('tr', i === 0 && res.items.length > 1 && !res.tied.length ? { class: 'is-top' } : {}, [
        el('td', {}, [el('span', { class: 'ct-tname', text: t.name }), el('span', { class: 'ct-freq', text: CT.frequency(t) })]),
        el('td', { 'data-label': 'Par an', text: CT.formatDuration(t.minutesYear) }),
        el('td', { 'data-label': 'En euros', text: t.cost === null ? '—' : CT.formatEuros(t.cost) }),
        el('td', { 'data-label': 'Part du temps', text: t.share + ' %' })
      ]));
    });
    $('ct-top').textContent = CT.topText(res);
  }

  // ----- events -----
  $('ct-form').addEventListener('input', render);
  $('ct-form').addEventListener('change', render);
  $('ct-form').addEventListener('submit', function (e) { e.preventDefault(); render(); });
  $('ct-add').addEventListener('click', function () { addTask()._inputs.name.focus(); render(); });
  $('ct-example').addEventListener('click', function () {
    loadTasks(CT.EXAMPLE.tasks);
    $('ct-rate').value = CT.EXAMPLE.rate; $('ct-weeks').value = CT.EXAMPLE.weeks;
    render();
    say('Exemple fictif chargé : remplacez-le par vos tâches.');
  });
  $('ct-clear').addEventListener('click', function () {
    loadTasks([]); $('ct-rate').value = ''; $('ct-weeks').value = String(CT.DEFAULT_WEEKS);
    render(); say('Tout est effacé.');
  });
  // suggestion chips: fill the first empty task name, or add a task
  var chips = $('ct-suggest');
  CT.SUGGESTIONS.forEach(function (name) {
    var b = el('button', { type: 'button', class: 'ct-chip', text: '+ ' + name });
    b.addEventListener('click', function () {
      var empty = Array.prototype.filter.call(list.children, function (item) { return !item._inputs.name.value.trim(); })[0];
      var item = empty || addTask();
      item._inputs.name.value = name;
      item._inputs.minutes.focus();
      render();
    });
    chips.appendChild(b);
  });

  addTask();
  render();
})();

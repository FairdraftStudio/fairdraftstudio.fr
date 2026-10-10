// Relances en lot: batch helper for unpaid invoices. Everything runs in the browser: nothing typed here is sent anywhere.
// Part 1 = pure functions (parsing, dates, amounts, levels, penalties, texts, .ics), tested with Node (docs/tools/relances-en-lot.md).
// Part 2 = DOM code. Legal sources and read dates: docs/claims/relances-en-lot.json (Service-Public F23211 and F31808, read 4 Oct 2026).
var RelancesLot = (function () {
  'use strict';

  var NBSP = '\u00a0';
  var NNBSP = '\u202f';
  var MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  var WEEKDAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  // French typography: a no-break space before : ; ? ! % € and inside « »
  function typo(s) { return String(s).replace(/ ([:;?!%€»])/g, NBSP + '$1').replace(/« /g, '«' + NBSP); }

  var FEE_CENTS = 4000;            // indemnité forfaitaire pour frais de recouvrement: 40 EUR, clients professionnels (Service-Public F23211)
  var MIN_GAP_DAYS = 7;            // our rule: two reminders at least 7 days apart (docs/decisions.md, 23 Sep 2026)
  var DEFAULT_FIRM = 15;           // proposed threshold: relance ferme from 15 days late (not a legal deadline)
  var DEFAULT_FORMAL = 30;         // proposed threshold: mise en demeure from 30 days late (not a legal deadline)
  var LEVEL_NAMES = { 1: 'Rappel poli', 2: 'Relance ferme', 3: 'Mise en demeure' };
  var LEVEL_ACTIONS = { 1: 'envoyer le rappel poli', 2: 'envoyer la relance ferme', 3: 'préparer la mise en demeure' };

  // Reference rate read on Service-Public F23211 (page checked 7 Aug 2026, read 4 Oct 2026): ECB refinancing rate 2.40 % + 10 points
  // for the 2nd half of 2026; minimum 8.25 % (3 times the legal interest rate). Shown only while it is the current half-year.
  var REFERENCE = { from: { y: 2026, m: 7, d: 1 }, to: { y: 2026, m: 12, d: 31 }, rate: 12.4, floor: 8.25, label: '2e semestre 2026' };

  // ---------- dates (calendar days, UTC arithmetic: no daylight-saving drift) ----------
  function dayNumber(p) { return Math.round(Date.UTC(p.y, p.m - 1, p.d) / 86400000); }
  function fromDayNumber(n) {
    var d = new Date(n * 86400000);
    return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() };
  }
  function validDate(y, m, d) {
    if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return false;
    var t = new Date(Date.UTC(y, m - 1, d));
    return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
  }
  // dd/mm/yyyy, dd-mm-yyyy, dd.mm.yyyy, dd/mm/yy, yyyy-mm-dd (an optional time after the date is ignored)
  function parseDate(text) {
    var s = String(text == null ? '' : text).replace(/[\u00a0\u202f]/g, ' ').trim().replace(/[ T]\d{1,2}:\d{2}(:\d{2})?$/, '');
    var m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
    var y, mo, d;
    if (m) {
      y = +m[1]; mo = +m[2]; d = +m[3];
    } else {
      m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2}|\d{4})$/.exec(s);
      if (!m) return null;
      d = +m[1]; mo = +m[2]; y = +m[3];
      if (m[3].length === 2) y += 2000;
    }
    return validDate(y, mo, d) ? { y: y, m: mo, d: d } : null;
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function toIso(p) { return p.y + '-' + pad2(p.m) + '-' + pad2(p.d); }
  function todayParts(date) { return { y: date.getFullYear(), m: date.getMonth() + 1, d: date.getDate() }; }
  function frenchDate(p) { return (p.d === 1 ? '1er' : String(p.d)) + ' ' + MONTHS[p.m - 1] + ' ' + p.y; }
  function weekdayName(p) { return WEEKDAYS[new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay()]; }
  function skipWeekend(n) {
    var wd = new Date(n * 86400000).getUTCDay();
    return wd === 6 ? n + 2 : wd === 0 ? n + 1 : n;   // Saturday and Sunday move to Monday
  }

  // ---------- amounts (integer cents) and rate ----------
  // "1 250,50", "1.250,50", "1250.50", "1 250 €", "940": comma is the decimal separator unless a dot comes after it.
  function parseAmountCents(text) {
    var s = String(text == null ? '' : text).replace(/[€\s\u00a0\u202f]/g, '').replace(/(ttc|eur|euros?)$/i, '');
    if (!s) return null;
    var lastComma = s.lastIndexOf(','), lastDot = s.lastIndexOf('.');
    var sep = null;
    if (lastComma >= 0 && lastDot >= 0) sep = lastComma > lastDot ? ',' : '.';
    else if (lastComma >= 0) sep = ',';
    else if (lastDot >= 0) sep = /^\d{1,3}(\.\d{3})+$/.test(s) ? null : '.';   // "1.250" = 1 250
    var whole = s, frac = '';
    if (sep) {
      var i = s.lastIndexOf(sep);
      whole = s.slice(0, i);
      frac = s.slice(i + 1);
    }
    whole = whole.replace(/[.,]/g, '');
    if (!/^\d+$/.test(whole) || !/^\d{0,2}$/.test(frac)) return null;
    var cents = parseInt(whole, 10) * 100 + parseInt((frac + '00').slice(0, 2), 10);
    return cents > 0 && cents < 1e12 ? cents : null;
  }
  function formatEuros(cents) {
    var whole = Math.floor(Math.abs(cents) / 100), frac = Math.abs(cents) % 100;
    return (cents < 0 ? '-' : '') + String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, NNBSP) + ',' + pad2(frac) + NBSP + '€';
  }
  // Annual penalty rate typed by the visitor: "12,40", "12.4 %". Empty = no rate (no penalty estimate).
  function parseRate(text) {
    var s = String(text == null ? '' : text).replace(/[%\s\u00a0\u202f]/g, '').replace(',', '.');
    if (!s) return { value: null, error: null };
    if (!/^\d+(\.\d{1,3})?$/.test(s) || !(parseFloat(s) > 0 && parseFloat(s) <= 100)) {
      return { value: null, error: typo('Taux illisible : écrivez par exemple 12,40.') };
    }
    return { value: parseFloat(s), error: null };
  }
  function rateInput(rate) { return rate.toFixed(2).replace('.', ','); }
  function formatRate(rate) { return rateInput(rate) + NBSP + '%'; }
  function referenceRate(today) {
    var n = dayNumber(today);
    return n >= dayNumber(REFERENCE.from) && n <= dayNumber(REFERENCE.to) ? REFERENCE : null;
  }
  function rateWarning(rate, today) {
    var ref = referenceRate(today);
    if (rate == null || !ref || rate >= ref.floor) return null;
    return typo('Ce taux est inférieur au minimum de ' + formatRate(ref.floor) + ' cité par Service-Public (3 fois le taux d\'intérêt légal) : vérifiez ce qui est écrit dans vos conditions générales de vente.');
  }

  // ---------- reading pasted rows ----------
  function clean(cell) { return cell.replace(/^"(.*)"$/, '$1').replace(/[\u00a0\u202f]/g, ' ').trim(); }
  // true = professional client, false = private individual, undefined = empty cell, null = not understood
  function parseClientType(cell) {
    var s = clean(cell || '').toLowerCase();
    if (!s) return undefined;
    if (/^(particulier|particuliers|part\.?|b2c|non)$/.test(s)) return false;
    if (/^(professionnel|professionnels|pro|b2b|entreprise|société|societe|oui)$/.test(s)) return true;
    return null;
  }
  // Rows copied from a spreadsheet: tab or semicolon separated; first row may be a header.
  // Columns: client, invoice number, amount incl. VAT, due date, optional "particulier" / "entreprise".
  function parseInput(text, defaultPro) {
    var rows = [], errors = [], skippedHeader = false, seen = 0;
    String(text == null ? '' : text).split(/\r\n|\r|\n/).forEach(function (raw, i) {
      if (!raw.trim()) return;
      seen += 1;
      var cells = raw.split(raw.indexOf('\t') >= 0 ? '\t' : ';').map(clean);
      if (seen === 1 && cells.length >= 4 && parseAmountCents(cells[2]) === null && parseDate(cells[3]) === null &&
          /client|factur|montant|ttc|échéance|echeance|date/i.test(raw)) {
        skippedHeader = true;
        return;
      }
      var line = i + 1, problems = [];
      if (cells.length < 4) {
        errors.push({ line: line, message: 'Il faut quatre colonnes (client, numéro de facture, montant TTC, date d\'échéance), séparées par une tabulation ou un point-virgule.' });
        return;
      }
      if (cells.length > 5) {
        errors.push({ line: line, message: 'Plus de cinq colonnes : gardez le client, le numéro, le montant TTC, l\'échéance et, en option, « particulier » ou « entreprise ».' });
        return;
      }
      var cents = parseAmountCents(cells[2]);
      if (cents === null) problems.push('montant illisible (« ' + cells[2] + ' »)');
      var due = parseDate(cells[3]);
      if (due === null) problems.push('date illisible (« ' + cells[3] + ' »), écrivez-la 15/09/2026 ou 2026-09-15');
      var pro = parseClientType(cells[4]);
      if (pro === null) problems.push('type de client non compris (« ' + cells[4] + ' »), écrivez « particulier » ou « entreprise »');
      if (problems.length) {
        errors.push({ line: line, message: problems.join(' ; ').replace(/^./, function (c) { return c.toUpperCase(); }) + '.' });
        return;
      }
      rows.push({ client: cells[0], invoice: cells[1], amountCents: cents, due: toIso(due), pro: pro === undefined ? defaultPro !== false : pro, line: line });
    });
    errors.forEach(function (e) { e.message = typo(e.message); });
    return { rows: rows, errors: errors, skippedHeader: skippedHeader };
  }

  // ---------- levels, fee, penalties, follow-up ----------
  function normaliseThresholds(firm, formal) {
    var f = parseInt(firm, 10), g = parseInt(formal, 10);
    if (f >= 2 && g > f && g <= 365) return { firm: f, formal: g, valid: true };
    return { firm: DEFAULT_FIRM, formal: DEFAULT_FORMAL, valid: false };
  }
  function levelFor(daysLate, th) {
    if (daysLate < 1) return 0;
    if (daysLate >= th.formal) return 3;
    if (daysLate >= th.firm) return 2;
    return 1;
  }
  // Next follow-up: when the invoice reaches the next level, never sooner than 7 days from today, weekends moved to Monday.
  function followUpFor(item, todayN, th) {
    var dueN = dayNumber(item.due);
    var next = item.level === 1 ? dueN + th.firm : item.level === 2 ? dueN + th.formal : null;
    var n = Math.max(todayN + MIN_GAP_DAYS, next === null ? 0 : next);
    n = skipWeekend(n);
    return { date: fromDayNumber(n), daysLate: n - dueN, level: levelFor(n - dueN, th), daysFromToday: n - todayN };
  }
  // rows: [{client, invoice, amountCents, due (iso string or {y,m,d}), pro}], today: {y,m,d}, opts: {rate, firm, formal}
  function analyse(rows, today, opts) {
    opts = opts || {};
    var th = normaliseThresholds(opts.firm, opts.formal);
    var rate = opts.rate == null ? null : opts.rate;
    var todayN = dayNumber(today);
    var items = rows.map(function (r, index) {
      var due = typeof r.due === 'string' ? parseDate(r.due) : r.due;
      var daysLate = todayN - dayNumber(due);
      var item = {
        index: index, client: r.client || '', invoice: r.invoice || '', amountCents: r.amountCents, due: due,
        pro: r.pro !== false, daysLate: daysLate, late: daysLate >= 1, daysUntilDue: daysLate < 0 ? -daysLate : 0,
        level: levelFor(daysLate, th), feeCents: 0, penaltyCents: null, followUp: null
      };
      if (item.late) {
        item.feeCents = item.pro ? FEE_CENTS : 0;
        item.penaltyCents = item.pro && rate !== null ? Math.round(item.amountCents * rate / 100 * item.daysLate / 365) : null;
        item.followUp = followUpFor(item, todayN, th);
      }
      return item;
    });
    items.sort(function (a, b) {
      if (a.late !== b.late) return a.late ? -1 : 1;
      return a.late ? (b.daysLate - a.daysLate || a.index - b.index) : (a.daysUntilDue - b.daysUntilDue || a.index - b.index);
    });
    var late = items.filter(function (i) { return i.late; });
    var pending = items.filter(function (i) { return !i.late; });
    var sum = function (list, key) { return list.reduce(function (t, i) { return t + (i[key] || 0); }, 0); };
    var proLate = late.filter(function (i) { return i.pro; });
    var summary = {
      lateCount: late.length,
      totalDueCents: sum(late, 'amountCents'),
      feeCount: proLate.length,
      feesCents: sum(late, 'feeCents'),
      penaltiesCents: rate !== null && proLate.length ? sum(late, 'penaltyCents') : null,
      privateLateCount: late.length - proLate.length,
      pendingCount: pending.length,
      pendingTotalCents: sum(pending, 'amountCents')
    };
    summary.totalClaimCents = summary.totalDueCents + summary.feesCents + (summary.penaltiesCents || 0);
    return { items: items, summary: summary, thresholds: th, rate: rate };
  }

  // ---------- reminder texts (wording of the letter tool, outils/lettre-de-relance) ----------
  function reminderText(item, today) {
    var invoice = item.invoice || '[numéro de facture]';
    var amount = formatEuros(item.amountCents) + NBSP + 'TTC';
    var due = frenchDate(item.due);
    var lateText = ', soit ' + item.daysLate + ' jour' + (item.daysLate > 1 ? 's' : '') + ' de retard';
    var signature = '[votre nom]';
    var colon = NBSP + ':';
    var fee = '40' + NBSP + '€';
    if (item.level === 1) {
      return 'Objet' + colon + ' rappel de paiement, facture ' + invoice + '\n\nBonjour,\n\n' +
        'Sauf erreur de ma part, la facture ' + invoice + ', d\'un montant de ' + amount + ', arrivée à échéance le ' + due + ', n\'a pas encore été réglée.\n\n' +
        'Il s\'agit sans doute d\'un oubli' + colon + ' je vous remets la facture en pièce jointe.\n\n' +
        'Si le règlement a déjà été fait, merci de ne pas tenir compte de ce message.\n\n' +
        'Bien à vous,\n' + signature;
    }
    if (item.level === 2) {
      return 'Objet' + colon + ' relance, facture ' + invoice + '\n\nBonjour,\n\n' +
        'Je reviens vers vous au sujet de la facture ' + invoice + ', d\'un montant de ' + amount + ', échue le ' + due + lateText + '.\n\n' +
        'À ce jour, je n\'ai pas reçu votre règlement. Merci de procéder au paiement sous huit jours, ou de m\'indiquer une date à laquelle il sera fait.\n\n' +
        (item.pro ? 'Je vous rappelle qu\'entre professionnels, tout retard de paiement fait courir des pénalités de retard et une indemnité forfaitaire de ' + fee +
          ' pour frais de recouvrement (articles L441-10 et D441-5 du Code de commerce).\n\n' : '') +
        'Bien à vous,\n' + signature;
    }
    var recipient = 'Destinataire' + colon + ' ' + (item.client || '[nom du client]') + '\n';
    return 'Objet' + colon + ' mise en demeure de payer, facture ' + invoice + '\n\n' +
      '[votre ville], le ' + frenchDate(today) + '\nLettre recommandée avec accusé de réception\n' + recipient + '\n' +
      'Madame, Monsieur,\n\n' +
      'Malgré mes relances, la facture ' + invoice + ', d\'un montant de ' + amount + ', échue le ' + due + lateText + ', reste impayée à ce jour.\n\n' +
      'Par la présente, je vous mets en demeure de régler la somme de ' + amount + ' sous huit jours à compter de la réception de ce courrier.\n\n' +
      'À défaut de paiement dans ce délai, je me réserve le droit d\'engager une procédure de recouvrement, y compris une requête en injonction de payer' +
      (item.pro ? ', et de réclamer les pénalités de retard ainsi que l\'indemnité forfaitaire de ' + fee + ' pour frais de recouvrement prévues par les articles L441-10 et D441-5 du Code de commerce.\n\n'
        : '.\n\n') +
      'Si vous rencontrez une difficulté de trésorerie, écrivez-moi' + colon + ' un échéancier est toujours préférable à une procédure.\n\n' +
      'Veuillez agréer, Madame, Monsieur, mes salutations distinguées.\n\n' + signature;
  }
  function itemLabel(item) {
    return (item.client || 'Client sans nom') + ', facture ' + (item.invoice || 'sans numéro');
  }
  function allReminders(items, today) {
    return items.filter(function (i) { return i.late; }).map(function (i) {
      return itemLabel(i) + ' (' + LEVEL_NAMES[i.level] + ')\n\n' + reminderText(i, today);
    }).join('\n\n----------------------------------------\n\n');
  }

  // ---------- calendar file (.ics, RFC 5545): one all-day follow-up per late invoice ----------
  function icsEscape(s) {
    return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  }
  function utf8Length(ch) {
    var c = ch.codePointAt(0);
    return c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
  }
  // Lines are folded at 75 octets: CRLF + one space continues the line.
  function foldLine(line) {
    var out = [], current = '', bytes = 0, limit = 75;
    Array.from(line).forEach(function (ch) {
      var len = utf8Length(ch);
      if (bytes + len > limit) {
        out.push(current);
        current = ''; bytes = 0; limit = 74;
      }
      current += ch; bytes += len;
    });
    out.push(current);
    return out.join('\r\n ');
  }
  function simpleHash(s) {
    var h = 5381;
    for (var i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
    return h.toString(16);
  }
  function icsDate(p) { return String(p.y) + pad2(p.m) + pad2(p.d); }
  function utcStamp(now) {
    return now.getUTCFullYear() + pad2(now.getUTCMonth() + 1) + pad2(now.getUTCDate()) + 'T' +
      pad2(now.getUTCHours()) + pad2(now.getUTCMinutes()) + pad2(now.getUTCSeconds()) + 'Z';
  }
  function buildIcs(items, today, now) {
    var late = items.filter(function (i) { return i.late; });
    if (!late.length) return null;
    var todayN = dayNumber(today), stamp = utcStamp(now);
    var lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Suivel//Relances en lot//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
    late.forEach(function (i, k) {
      var f = i.followUp;
      var description = 'Facture ' + (i.invoice || 'sans numéro') + (i.client ? ' de ' + i.client : '') + ', ' + formatEuros(i.amountCents) + ' TTC, échue le ' + frenchDate(i.due) +
        '. À cette date, elle aura ' + f.daysLate + ' jour' + (f.daysLate > 1 ? 's' : '') + ' de retard. À faire : ' + LEVEL_ACTIONS[f.level] + '. Vérifiez d\'abord que la facture n\'a pas été payée.' +
        (f.level === 3 ? ' La mise en demeure est à envoyer vous-même, de préférence en recommandé : rien n\'est envoyé automatiquement.' : '');
      lines.push('BEGIN:VEVENT',
        'UID:relance-' + todayN + '-' + k + '-' + simpleHash(itemLabel(i) + toIso(i.due)) + '@suivel.fr',
        'DTSTAMP:' + stamp,
        'DTSTART;VALUE=DATE:' + icsDate(f.date),
        'DTEND;VALUE=DATE:' + icsDate(fromDayNumber(dayNumber(f.date) + 1)),
        'SUMMARY:' + icsEscape(LEVEL_NAMES[f.level] + ' : facture ' + (i.invoice || 'sans numéro') + (i.client ? ' (' + i.client + ')' : '')),
        'DESCRIPTION:' + icsEscape(description),
        'END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    return lines.map(foldLine).join('\r\n') + '\r\n';
  }

  return {
    NBSP: NBSP, typo: typo, FEE_CENTS: FEE_CENTS, MIN_GAP_DAYS: MIN_GAP_DAYS, DEFAULT_FIRM: DEFAULT_FIRM, DEFAULT_FORMAL: DEFAULT_FORMAL,
    LEVEL_NAMES: LEVEL_NAMES, REFERENCE: REFERENCE,
    dayNumber: dayNumber, fromDayNumber: fromDayNumber, parseDate: parseDate, toIso: toIso, todayParts: todayParts, frenchDate: frenchDate,
    weekdayName: weekdayName, skipWeekend: skipWeekend, parseAmountCents: parseAmountCents, formatEuros: formatEuros, parseRate: parseRate,
    formatRate: formatRate, rateInput: rateInput, referenceRate: referenceRate, rateWarning: rateWarning, parseClientType: parseClientType, parseInput: parseInput,
    normaliseThresholds: normaliseThresholds, levelFor: levelFor, analyse: analyse, reminderText: reminderText, itemLabel: itemLabel,
    allReminders: allReminders, icsEscape: icsEscape, foldLine: foldLine, buildIcs: buildIcs
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = RelancesLot;

// ---------- Part 2: the page ----------
(function () {
  'use strict';
  if (typeof document === 'undefined') return;
  var RL = RelancesLot;
  var app = document.getElementById('rl-app');
  if (!app) return;

  var $ = function (id) { return document.getElementById(id); };
  var el = function (tag, props, kids) {
    var node = document.createElement(tag);
    Object.keys(props || {}).forEach(function (k) {
      if (k === 'text') node.textContent = RL.typo(props[k]);
      else if (k === 'class') node.className = props[k];
      else node.setAttribute(k, props[k]);
    });
    (kids || []).forEach(function (kid) { node.appendChild(typeof kid === 'string' ? document.createTextNode(RL.typo(kid)) : kid); });
    return node;
  };
  var rows = $('rl-rows'), status = $('rl-status'), lastIcs = null, lastAll = '';

  function say(text) { status.textContent = RL.typo(text); }
  function copyText(text, message) {
    var fail = function () { say('La copie a échoué : sélectionnez le texte à la main.'); };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(function () { say(message); }, fail);
    } else {
      var area = el('textarea', { 'aria-hidden': 'true' });
      area.value = text; document.body.appendChild(area); area.select();
      try { document.execCommand('copy'); say(message); } catch (e) { fail(); }
      document.body.removeChild(area);
    }
  }

  // ----- the table of invoices -----
  var FIELDS = [
    ['client', 'Client', 'text', 'Client A'],
    ['invoice', 'N° de facture', 'text', 'F-2026-014'],
    ['amount', 'Montant TTC', 'text', '1 250,50'],
    ['due', 'Date d\'échéance', 'date', '']
  ];
  function addRow(data) {
    data = data || {};
    if (data.amount == null && data.amountCents != null) data.amount = (data.amountCents / 100).toFixed(2).replace('.', ',');   // rows read from pasted text
    var tr = el('tr');
    FIELDS.forEach(function (f) {
      var input = el('input', { type: f[2], 'data-f': f[0], 'aria-label': f[1], autocomplete: 'off' });
      if (f[0] === 'amount') input.setAttribute('inputmode', 'decimal');
      if (f[3]) input.setAttribute('placeholder', f[3]);
      if (data[f[0]] != null) input.value = data[f[0]];
      tr.appendChild(el('td', {}, [input]));
    });
    var pro = el('input', { type: 'checkbox', 'data-f': 'pro', 'aria-label': 'Client professionnel' });
    pro.checked = data.pro !== false;
    tr.appendChild(el('td', { class: 'rl-pro' }, [el('label', {}, [pro, ' Entreprise'])]));
    var del = el('button', { type: 'button', class: 'rl-del', 'aria-label': 'Supprimer cette ligne', text: '×' });
    del.addEventListener('click', function () { tr.remove(); if (!rows.children.length) addRow(); render(); });
    tr.appendChild(el('td', {}, [del]));
    rows.appendChild(tr);
    return tr;
  }
  function field(tr, name) { return tr.querySelector('[data-f="' + name + '"]'); }
  function readRows() {
    var good = [], problems = [];
    Array.prototype.forEach.call(rows.children, function (tr, i) {
      var client = field(tr, 'client').value.trim(), invoice = field(tr, 'invoice').value.trim();
      var amountText = field(tr, 'amount').value.trim(), dueText = field(tr, 'due').value.trim();
      if (!client && !invoice && !amountText && !dueText) return;
      var cents = RL.parseAmountCents(amountText), due = RL.parseDate(dueText), bad = [];
      if (cents === null) bad.push(amountText ? 'montant illisible' : 'montant manquant');
      if (due === null) bad.push(dueText ? 'date illisible' : 'date d\'échéance manquante');
      if (bad.length) { problems.push('Ligne ' + (i + 1) + ' : ' + bad.join(', ') + '.'); return; }
      good.push({ client: client, invoice: invoice, amountCents: cents, due: RL.toIso(due), pro: field(tr, 'pro').checked });
    });
    return { rows: good, problems: problems };
  }
  function loadRows(list) {
    rows.textContent = '';
    list.forEach(addRow);
    if (!list.length) addRow();
    render();
  }

  // ----- output -----
  function clear(node) { node.textContent = ''; }
  function stat(label, value, note) {
    var kids = [el('dt', { text: label }), el('dd', { text: value })];
    if (note) kids.push(el('dd', { class: 'rl-note', text: note }));
    return el('div', {}, kids);
  }
  function plural(n, one, many) { return n + ' ' + (n > 1 ? many : one); }

  function render() {
    var read = readRows();
    var rate = RL.parseRate($('rl-rate').value);
    var today = RL.todayParts(new Date());
    var res = RL.analyse(read.rows, today, { rate: rate.value, firm: $('rl-firm').value, formal: $('rl-formal').value });
    var s = res.summary;

    // messages under the settings and the table
    var notes = [];
    if (rate.error) notes.push(rate.error);
    var warn = RL.rateWarning(rate.value, today);
    if (warn) notes.push(warn);
    if (!res.thresholds.valid) notes.push('Seuils non valides : l\'outil utilise ' + RL.DEFAULT_FIRM + ' et ' + RL.DEFAULT_FORMAL + ' jours (le second doit dépasser le premier).');
    clear($('rl-settings-note'));
    notes.forEach(function (n) { $('rl-settings-note').appendChild(el('p', { text: n })); });
    clear($('rl-problems'));
    read.problems.forEach(function (p) { $('rl-problems').appendChild(el('p', { text: p })); });

    var out = $('rl-output'), empty = $('rl-empty');
    clear(out);
    lastIcs = null; lastAll = '';
    $('rl-actions').hidden = true;
    if (!res.items.length) { empty.hidden = false; return; }
    empty.hidden = true;

    // summary
    var stats = el('dl', { class: 'rl-stats' });
    stats.appendChild(stat('Factures en retard', String(s.lateCount), s.pendingCount ? plural(s.pendingCount, 'autre facture pas encore échue', 'autres factures pas encore échues') + ', non comptées' : ''));
    stats.appendChild(stat('Total dû (TTC)', RL.formatEuros(s.totalDueCents)));
    stats.appendChild(stat('Indemnités de 40 €', RL.formatEuros(s.feesCents), s.feeCount ? plural(s.feeCount, 'facture', 'factures') + ', clients professionnels' : 'aucun client professionnel en retard'));
    stats.appendChild(stat('Pénalités estimées', s.penaltiesCents === null ? 'taux non saisi' : RL.formatEuros(s.penaltiesCents), s.penaltiesCents === null ? (s.feeCount ? 'saisissez votre taux plus haut' : '') : 'estimation'));
    stats.appendChild(stat('Total à réclamer', RL.formatEuros(s.totalClaimCents), 'estimation, hors frais éventuels'));
    out.appendChild(el('div', { class: 'sheet rl-block' }, [
      el('p', { class: 'form-head', text: 'Résumé au ' + RL.frenchDate(today) }), stats,
      s.privateLateCount ? el('p', { class: 'rl-small', text: plural(s.privateLateCount, 'facture est celle', 'factures sont celles') + ' d\'un particulier : ni indemnité de 40 € ni pénalités calculées.' }) : el('span')
    ]));

    // detail table
    var head = el('tr', {}, ['Client', 'Facture', 'Échéance', 'Retard', 'Niveau', 'Indemnité', 'Pénalités', 'Total à régler'].map(function (h) { return el('th', { scope: 'col', text: h }); }));
    var body = el('tbody');
    res.items.forEach(function (i) {
      var cells;
      if (i.late) {
        var extra = i.feeCents + (i.penaltyCents || 0);
        cells = [i.client || '-', i.invoice || '-', RL.frenchDate(i.due), plural(i.daysLate, 'jour', 'jours'), RL.LEVEL_NAMES[i.level],
          i.pro ? RL.formatEuros(i.feeCents) : 'non due', i.pro ? (i.penaltyCents === null ? '-' : RL.formatEuros(i.penaltyCents)) : 'non calculées',
          RL.formatEuros(i.amountCents + extra)];
      } else {
        cells = [i.client || '-', i.invoice || '-', RL.frenchDate(i.due), i.daysUntilDue ? 'pas encore échue (dans ' + plural(i.daysUntilDue, 'jour', 'jours') + ')' : 'échéance aujourd\'hui', '-', '-', '-', RL.formatEuros(i.amountCents)];
      }
      var tr = el('tr', i.late ? {} : { class: 'rl-pending' }, cells.map(function (c, k) { return el('td', { text: c, 'data-label': head.children[k].textContent }); }));
      body.appendChild(tr);
    });
    out.appendChild(el('div', { class: 'sheet rl-block' }, [
      el('p', { class: 'form-head', text: 'Facture par facture' }),
      el('div', { class: 'rl-scroll' }, [el('table', { class: 'rl-table' }, [el('thead', {}, [head]), body])])
    ]));

    // texts
    var late = res.items.filter(function (i) { return i.late; });
    if (late.length) {
      var cards = el('div', { class: 'rl-cards' });
      late.forEach(function (i) {
        var text = RL.reminderText(i, today);
        var area = el('textarea', { rows: String(text.split('\n').length + 1), 'aria-label': 'Texte pour ' + RL.itemLabel(i), spellcheck: 'false' });
        area.value = text;
        var copy = el('button', { type: 'button', class: 'btn btn-ghost btn-small', text: 'Copier ce texte' });
        copy.addEventListener('click', function () { copyText(area.value, 'Texte copié : ' + RL.itemLabel(i) + '.'); });
        var f = i.followUp;
        cards.appendChild(el('article', { class: 'rl-card' }, [
          el('div', { class: 'rl-card-head' }, [el('h3', { text: RL.itemLabel(i) }), el('span', { class: 'tag', text: RL.LEVEL_NAMES[i.level] })]),
          el('p', { class: 'rl-small', text: plural(i.daysLate, 'jour', 'jours') + ' de retard · prochain suivi le ' + RL.weekdayName(f.date) + ' ' + RL.frenchDate(f.date) + ' (' + RL.LEVEL_NAMES[f.level].toLowerCase() + ')' }),
          i.level === 3 ? el('p', { class: 'rl-warn', text: 'À envoyer vous-même, de préférence en recommandé. Cet outil n\'envoie rien. Complétez [votre ville] et [votre nom].' }) : el('span'),
          area, el('div', { class: 'tool-actions' }, [copy])
        ]));
      });
      out.appendChild(el('div', { class: 'sheet rl-block' }, [
        el('p', { class: 'form-head', text: 'Un texte par facture' }),
        el('p', { class: 'rl-small', text: 'Complétez [votre nom] et relisez avant d\'envoyer. Vous pouvez modifier chaque texte avant de le copier.' }), cards
      ]));
      lastAll = RL.allReminders(res.items, today);
      lastIcs = RL.buildIcs(res.items, today, new Date());
      $('rl-actions').hidden = false;
    }
    say('');
  }

  // ----- events -----
  $('rl-form').addEventListener('input', render);
  $('rl-form').addEventListener('change', render);
  $('rl-form').addEventListener('submit', function (e) { e.preventDefault(); render(); });
  $('rl-add').addEventListener('click', function () { addRow().querySelector('input').focus(); });
  $('rl-clear').addEventListener('click', function () { $('rl-paste').value = ''; clear($('rl-load-status')); loadRows([]); });
  $('rl-load').addEventListener('click', function () {
    var parsed = RL.parseInput($('rl-paste').value, $('rl-default').value === 'pro');
    var box = $('rl-load-status');
    clear(box);
    if (parsed.rows.length) {
      loadRows(parsed.rows);
      box.appendChild(el('p', { text: plural(parsed.rows.length, 'ligne chargée', 'lignes chargées') + (parsed.skippedHeader ? ' (en-tête ignoré)' : '') + '.' }));
    } else if (!parsed.errors.length) {
      box.appendChild(el('p', { text: 'Rien à charger : collez d\'abord vos lignes.' }));
    }
    parsed.errors.forEach(function (e) { box.appendChild(el('p', { class: 'rl-error', text: 'Ligne ' + e.line + ' ignorée : ' + e.message })); });
  });
  $('rl-example').addEventListener('click', function () {
    var n = RL.dayNumber(RL.todayParts(new Date()));
    var ago = function (days) { return RL.toIso(RL.fromDayNumber(n - days)); };
    loadRows([
      { client: 'Client A', invoice: 'F-2026-021', amount: '1 250,50', due: ago(6) },
      { client: 'Société B', invoice: 'F-2026-017', amount: '3 400', due: ago(20) },
      { client: 'Cabinet C', invoice: 'F-2026-009', amount: '780', due: ago(45) },
      { client: 'Particulier D', invoice: 'F-2026-024', amount: '240', due: ago(10), pro: false },
      { client: 'Société E', invoice: 'F-2026-030', amount: '960', due: ago(-8) }
    ]);
    say('Exemple fictif chargé : remplacez-le par vos factures.');
  });
  $('rl-copy-all').addEventListener('click', function () { if (lastAll) copyText(lastAll, 'Tous les textes sont copiés.'); });
  $('rl-ics').addEventListener('click', function () {
    if (!lastIcs) return;
    var url = URL.createObjectURL(new Blob([lastIcs], { type: 'text/calendar;charset=utf-8' }));
    var link = el('a', { href: url, download: 'relances-suivi.ics' });
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    say('Calendrier téléchargé : ouvrez le fichier .ics pour l\'ajouter à votre agenda.');
  });

  // reference rate: shown only while it is the current half-year
  var ref = RL.referenceRate(RL.todayParts(new Date()));
  var refBox = $('rl-rate-ref');
  if (ref) {
    refBox.appendChild(document.createTextNode(RL.typo('Repère : taux ' + RL.formatRate(ref.rate) + ' pour le ' + ref.label + ' (Service-Public, page vérifiée le 7' + RL.NBSP + 'août' + RL.NBSP + '2026, lue le 4' + RL.NBSP + 'octobre' + RL.NBSP + '2026 : taux de refinancement de la BCE, 2,40' + RL.NBSP + '%, plus 10 points). ' +
      'Ce n\'est pas votre taux : utilisez celui de vos conditions générales de vente. ')));
    var use = el('button', { type: 'button', class: 'rl-link', text: 'Mettre ' + RL.formatRate(ref.rate) });
    use.addEventListener('click', function () { $('rl-rate').value = RL.rateInput(ref.rate); render(); });
    refBox.appendChild(use);
  } else {
    refBox.textContent = 'Le taux en vigueur est publié sur la page Service-Public citée plus bas.';
  }

  addRow();
  render();
})();

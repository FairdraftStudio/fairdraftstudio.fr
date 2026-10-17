// Vos demandes de contact, du mail au tableau: paste the notification e-mails of a contact form, get one row per request.
// Everything runs in the browser: nothing typed or pasted here is sent or stored.
// Part 1 = pure functions (reading the e-mails, the table, the copy and CSV texts), tested with Node (tests/demandes-tableau.test.js).
// Part 2 = DOM code. Formats and their sources: docs/tools/demandes-tableau.md (CF7, WPForms, Shopify, Elementor read 12 Oct 2026).
var DemandesTableau = (function () {
  'use strict';

  var NBSP = ' ';
  function typo(s) { return String(s).replace(/ ([:;?!%€»])/g, NBSP + '$1').replace(/« /g, '«' + NBSP); }

  // Field names as forms write them -> one column name (French). Keys are compared lower-case, without accents and "(optional)".
  var CANON = {
    'nom': 'Nom', 'name': 'Nom', 'your name': 'Nom', 'votre nom': 'Nom', 'nom complet': 'Nom', 'full name': 'Nom', 'last name': 'Nom', 'nom de famille': 'Nom',
    'prenom': 'Prénom', 'first name': 'Prénom', 'votre prenom': 'Prénom',
    'e-mail': 'E-mail', 'email': 'E-mail', 'mail': 'E-mail', 'courriel': 'E-mail', 'adresse e-mail': 'E-mail', 'adresse email': 'E-mail',
    'adresse mail': 'E-mail', 'your email': 'E-mail', 'votre e-mail': 'E-mail', 'votre email': 'E-mail', 'email address': 'E-mail', 'e-mail address': 'E-mail',
    'telephone': 'Téléphone', 'tel': 'Téléphone', 'tel.': 'Téléphone', 'phone': 'Téléphone', 'phone number': 'Téléphone', 'numero de telephone': 'Téléphone',
    'votre telephone': 'Téléphone', 'portable': 'Téléphone', 'mobile': 'Téléphone',
    'societe': 'Société', 'entreprise': 'Société', 'company': 'Société', 'raison sociale': 'Société',
    'objet': 'Objet', 'sujet': 'Objet', 'subject': 'Objet', 'your subject': 'Objet', 'votre objet': 'Objet',
    'message': 'Message', 'your message': 'Message', 'votre message': 'Message', 'comment': 'Message', 'commentaire': 'Message',
    'comment or message': 'Message', 'message body': 'Message', 'corps du message': 'Message', 'demande': 'Message', 'votre demande': 'Message',
    'ville': 'Ville', 'city': 'Ville', 'code postal': 'Code postal', 'postal code': 'Code postal', 'zip': 'Code postal',
    'adresse': 'Adresse', 'address': 'Adresse', 'date': 'Date', 'heure': 'Heure', 'time': 'Heure', 'country code': 'Pays', 'pays': 'Pays', 'country': 'Pays'
  };
  // The sender line of Contact Form 7's default mail: "De : Jean Dupont <jean@x.fr>" -> Nom + E-mail
  var SENDER = { 'de': true, 'from': true };
  // Labels that are mail headers or technical lines, never form fields
  var DROP = { 'envoye': true, 'sent': true, 'a': true, 'to': true, 'cc': true, 'cci': true, 'bcc': true, 'user agent': true, 'remote ip': true,
    'adresse ip': true, 'ip': true, 'powered by': true, 'propulse par': true, 'unterstutzt von': true };
  // Columns that hold one line: text after their value is not part of them
  var ONE_LINE = { 'Nom': true, 'Prénom': true, 'E-mail': true, 'Téléphone': true, 'Code postal': true, 'Ville': true, 'Pays': true,
    'Date': true, 'Heure': true, 'Société': true, 'Objet': true };
  // Lines that are notices around the fields (form plugins' footers), ignored
  var NOTICE = /^(ceci est une notification|this is a notification|cet e-?mail a été envoyé|envoyé (depuis|via|par)|sent (from|via|by)|powered by|propulsé par|you received a new message|vous avez reçu un nouveau message)/i;

  function fold(s) {
    return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/\s*\((optionnel|facultatif|optional|obligatoire|required)\)\s*$/, '').replace(/\s*\*\s*$/, '').replace(/\s+/g, ' ').trim();
  }
  function canon(label) {
    var key = fold(label);
    if (CANON[key]) return CANON[key];
    var clean = String(label).replace(/\s*\*\s*$/, '').replace(/\s+/g, ' ').trim();
    return clean.charAt(0).toUpperCase() + clean.slice(1);
  }
  function isKnown(label) { return !!CANON[fold(label)] || !!SENDER[fold(label)]; }

  // One line -> { kind: 'label', label, value } | { kind: 'text', text } | { kind: 'blank' } | { kind: 'sig' } | { kind: 'notice' }
  var DASHED = /^-{2,}\s*(.{1,40}?)\s*-{2,}$/;
  var COLON = /^([^\s:][^:]{0,39}?)\s*:\s*(.*)$/;
  function readLine(line) {
    var s = line.replace(/[  \t]/g, ' ').replace(/\s+$/, '');
    var t = s.trim();
    if (!t) return { kind: 'blank' };
    if (/^--\s*$/.test(t) || /^-{3,}$/.test(t) || /^_{3,}$/.test(t)) return { kind: 'sig' };
    if (NOTICE.test(t)) return { kind: 'notice' };
    var d = DASHED.exec(t);
    if (d) return { kind: 'label', label: d[1], value: '' };
    var c = COLON.exec(t);
    // a label is short, starts with a letter, has at most 5 words, and is not a URL or a time ("https:", "10:30")
    if (c && /^\p{L}/u.test(c[1]) && c[1].split(/\s+/).length <= 5 && !/^https?$/i.test(c[1]) && !/^\/\//.test(c[2])) {
      return { kind: 'label', label: c[1], value: c[2].trim() };
    }
    if (isKnown(t) && t.length <= 40) return { kind: 'label', label: t, value: '' };   // label alone, value on the next lines
    return { kind: 'text', text: t };
  }

  function splitSender(value) {
    var m = /<?([^\s<>@]+@[^\s<>@]+\.[^\s<>@]+)>?/.exec(value);
    if (!m) return { Nom: value.trim() };
    var name = value.replace(m[0], '').replace(/[<>"]/g, '').trim();
    var out = {};
    if (name) out.Nom = name;
    out['E-mail'] = m[1];
    return out;
  }

  // The pasted text -> { columns: [...], rows: [{col: value}], ignored: N (lines outside any field) }
  function parse(text) {
    var lines = String(text == null ? '' : text).replace(/\r\n?/g, '\n').split('\n');
    var records = [], cur = null, field = null, seenLabels = {}, ignored = 0, afterSig = false;
    function startRecord() { cur = { values: {}, order: [] }; records.push(cur); field = null; }
    function setField(col, value) {
      if (!cur || Object.prototype.hasOwnProperty.call(cur.values, col)) startRecord();
      cur.values[col] = value;
      cur.order.push(col);
      field = col;
      seenLabels[col] = true;
    }
    lines.forEach(function (line) {
      var r = readLine(line);
      if (r.kind === 'blank') return;
      if (r.kind === 'notice') { afterSig = true; field = null; return; }
      if (r.kind === 'sig') { afterSig = true; field = null; return; }
      if (r.kind === 'label') {
        var key = fold(r.label);
        if (DROP[key]) { field = null; return; }
        var col = canon(r.label);
        // inside a message, a "Word: text" line is part of the message unless the label is a known field or one seen before
        if (field === 'Message' && !isKnown(r.label) && !seenLabels[col]) {
          cur.values.Message += (cur.values.Message ? '\n' : '') + line.trim();
          return;
        }
        afterSig = false;
        if (SENDER[key]) {
          var parts = splitSender(r.value);
          Object.keys(parts).forEach(function (k, i) {
            if (i === 0) setField(k, parts[k]);
            else { cur.values[k] = parts[k]; cur.order.push(k); seenLabels[k] = true; }
          });
          field = null;
          return;
        }
        var value = /^\((empty|vide)\)$/i.test(r.value) ? '' : r.value;
        setField(col, value);
        return;
      }
      // text: continues the current field (a one-line field only takes it when it is still empty: label, then value on the next line),
      // else it is outside any field
      if (field && !afterSig && cur && (!ONE_LINE[field] || cur.values[field] === '')) {
        var v = /^\((empty|vide)\)$/i.test(r.text) ? '' : r.text;
        cur.values[field] += (cur.values[field] ? '\n' : '') + v;
      } else {
        ignored += 1;
      }
    });
    var columns = [];
    records.forEach(function (rec) { rec.order.forEach(function (c) { if (columns.indexOf(c) < 0) columns.push(c); }); });
    var rows = records.filter(function (rec) { return rec.order.length; }).map(function (rec) { return rec.values; });
    return { columns: columns, rows: rows, ignored: ignored };
  }

  // A spreadsheet reads a cell starting with = + - @ as a formula: these come from site visitors, so they are made plain text.
  // Same for their full-width forms and a leading tab or line break (OWASP « CSV Injection », read 16 Oct 2026).
  function safeCell(v) {
    var s = String(v == null ? '' : v);
    return /^[=+\-@\t\r\n＝＋－＠]/.test(s) ? "'" + s : s;
  }
  // Copy for Google Sheets or Excel: tab-separated; line breaks inside a cell become " / " (a paste would split the row otherwise)
  function toTsv(res) {
    var out = [res.columns.map(safeCell).join('\t')];   // a field name also comes from the visitor's e-mail
    res.rows.forEach(function (row) {
      out.push(res.columns.map(function (c) { return safeCell(String(row[c] || '').replace(/\t/g, ' ').replace(/\n+/g, ' / ')); }).join('\t'));
    });
    return out.join('\n');
  }
  // CSV for Excel in French: UTF-8 with BOM, ";" separator, CRLF, quotes when needed; line breaks kept inside quoted cells
  function toCsv(res) {
    function q(v) {
      var s = safeCell(v);
      return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }
    var out = [res.columns.map(q).join(';')];
    res.rows.forEach(function (row) { out.push(res.columns.map(function (c) { return q(row[c] || ''); }).join(';')); });
    return '﻿' + out.join('\r\n') + '\r\n';
  }

  // Text pasted but no field found: say so (review 16 Oct: the page otherwise looked as if nothing had happened)
  function noFieldText(res, pasted) {
    if (res.rows.length || !String(pasted || '').trim()) return '';
    var s = 'Aucun champ reconnu dans ce texte';
    if (res.ignored) s += ' (' + (res.ignored === 1 ? '1 ligne laissée' : res.ignored + ' lignes laissées') + ' de côté)';
    return typo(s + '. L\'outil lit les lignes « Nom : … », les blocs « --- Nom --- » et les noms de champ courants (Nom, E-mail, Message…) seuls sur leur ligne, avec la valeur en dessous.');
  }

  function summaryText(res) {
    var n = res.rows.length;
    if (!n) return '';
    var s = n === 1 ? '1 demande lue' : n + ' demandes lues';
    s += ', ' + (res.columns.length === 1 ? '1 colonne' : res.columns.length + ' colonnes') + ' : ' + res.columns.join(', ') + '.';
    if (res.ignored) s += ' ' + (res.ignored === 1 ? '1 ligne n\'appartient' : res.ignored + ' lignes n\'appartiennent') + ' à aucun champ et ' + (res.ignored === 1 ? 'est laissée' : 'sont laissées') + ' de côté.';
    return typo(s);
  }

  // Fictional example: three requests in three formats (a custom "Nom : …" form, WPForms plain text, a label-then-value form)
  var EXAMPLE = [
    'Nom : Claire Petit',
    'E-mail : claire.petit@example.com',
    'Ville : Montpellier',
    'Message : Bonjour, je voudrais un devis pour trois portes intérieures.',
    'Pouvez-vous me rappeler en fin de journée ?',
    '',
    '-- ',
    'Cet e-mail a été envoyé via le formulaire de contact de votre site.',
    '',
    '--- Nom ---',
    '',
    'Paul Martin',
    '',
    '--- E-mail ---',
    '',
    'paul.martin@example.com',
    '',
    '--- Ville ---',
    '',
    'Sète',
    '',
    '--- Message ---',
    '',
    'Avez-vous des disponibilités en novembre pour une salle de bain ?',
    '',
    'Nom :',
    'Léa Garcia',
    'E-mail :',
    'lea.garcia@example.com',
    'Message :',
    'Je cherche quelqu\'un pour repeindre un bureau de 20 m².'
  ].join('\n');

  return {
    NBSP: NBSP, EXAMPLE: EXAMPLE, typo: typo, fold: fold, canon: canon, readLine: readLine, splitSender: splitSender,
    parse: parse, safeCell: safeCell, toTsv: toTsv, toCsv: toCsv, summaryText: summaryText, noFieldText: noFieldText
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = DemandesTableau;

// ---------- Part 2: the page ----------
(function () {
  'use strict';
  if (typeof document === 'undefined') return;
  var DT = DemandesTableau;
  var app = document.getElementById('mt-app');
  if (!app) return;

  var $ = function (id) { return document.getElementById(id); };
  var status = $('mt-status'), last = null;
  function say(text) { status.textContent = DT.typo(text); }

  function render() {
    var res = DT.parse($('mt-paste').value);
    last = res;
    var has = res.rows.length > 0;
    $('mt-empty').hidden = has;
    $('mt-result').hidden = !has;
    $('mt-summary').textContent = DT.summaryText(res);
    var head = $('mt-head'), body = $('mt-rows');
    while (head.firstChild) head.removeChild(head.firstChild);
    while (body.firstChild) body.removeChild(body.firstChild);
    var none = DT.noFieldText(res, $('mt-paste').value);
    if (none || status.getAttribute('data-none')) { status.textContent = none; status.setAttribute('data-none', none ? '1' : ''); }
    if (!has) return;
    res.columns.forEach(function (c) { var th = document.createElement('th'); th.scope = 'col'; th.textContent = c; head.appendChild(th); });
    res.rows.forEach(function (row) {
      var tr = document.createElement('tr');
      res.columns.forEach(function (c) {
        var td = document.createElement('td');
        td.textContent = DT.typo(row[c] || '');   // display only: « ? » stays with its word; the copy and the CSV keep the text as pasted
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
  }

  function copyText(text, message) {
    var fail = function () { say('La copie a échoué : sélectionnez le tableau à la main, ou téléchargez le fichier CSV.'); };
    // Older method, also tried when the browser refuses the clipboard API (some embedded browsers do)
    var legacy = function () {
      var area = document.createElement('textarea');
      area.setAttribute('aria-hidden', 'true');
      area.value = text; document.body.appendChild(area); area.select();
      var done = false;
      try { done = document.execCommand('copy'); } catch (e) { done = false; }
      document.body.removeChild(area);
      if (done) say(message); else fail();
    };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(function () { say(message); }, legacy);
    } else {
      legacy();
    }
  }

  $('mt-paste').addEventListener('input', render);
  $('mt-example').addEventListener('click', function () { $('mt-paste').value = DT.EXAMPLE; render(); say('Exemple fictif chargé : remplacez-le par vos e-mails.'); });
  $('mt-clear').addEventListener('click', function () { $('mt-paste').value = ''; render(); say('Tout est effacé.'); $('mt-paste').focus(); });
  $('mt-copy').addEventListener('click', function () {
    if (last && last.rows.length) copyText(DT.toTsv(last), 'Tableau copié : collez-le dans la cellule A1 d\'une feuille Google Sheets ou Excel.');
  });
  $('mt-csv').addEventListener('click', function () {
    if (!last || !last.rows.length) return;
    var url = URL.createObjectURL(new Blob([DT.toCsv(last)], { type: 'text/csv;charset=utf-8' }));
    var link = document.createElement('a');
    link.href = url; link.download = 'demandes.csv';
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    say('Fichier demandes.csv téléchargé : ouvrez-le avec Excel ou importez-le dans Google Sheets.');
  });
  render();
})();

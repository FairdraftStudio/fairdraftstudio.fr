// Tests for assets/demandes-tableau.js (pure functions). Run: node repos/fairdraftstudio.fr/tests/demandes-tableau.test.js
// No dependencies, fictional data (example.com addresses, RFC 2606). Layouts from docs/tools/demandes-tableau.md (read 12 Oct 2026).
'use strict';
var path = require('path');
var fs = require('fs');
var DT = require(path.join(__dirname, '..', 'assets', 'demandes-tableau.js'));

var passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed += 1; console.log('  ok   ' + name); }
  catch (e) { failed += 1; console.log('  FAIL ' + name + '\n         ' + e.message); }
}
function eq(actual, expected, label) {
  var a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a !== b) throw new Error((label ? label + ': ' : '') + 'expected ' + b + ', got ' + a);
}
function ok(cond, label) { if (!cond) throw new Error(label || 'condition is false'); }
var S = DT.NBSP;

console.log('Labels');
test('synonyms become one column name', function () {
  eq(['Your name', 'Votre nom', 'Email address', 'Courriel', 'Phone Number', 'Tél', 'Subject', 'Corps du message', 'Comment', 'Message (optionnel)', 'Société *']
    .map(DT.canon), ['Nom', 'Nom', 'E-mail', 'E-mail', 'Téléphone', 'Téléphone', 'Objet', 'Message', 'Message', 'Message', 'Société']);
  eq(DT.canon('type de travaux'), 'Type de travaux', 'unknown labels keep their words, first letter upper-case');
});
test('what is a label and what is not', function () {
  eq(DT.readLine('Nom : Claire').kind, 'label'); eq(DT.readLine('Nom: Claire').kind, 'label'); eq(DT.readLine('Nom : Claire').value, 'Claire');
  eq(DT.readLine('--- E-mail ---'), { kind: 'label', label: 'E-mail', value: '' });
  eq(DT.readLine('Téléphone').kind, 'label', 'known label alone on its line');
  eq(DT.readLine('Bonjour').kind, 'text', 'unknown word alone is text');
  eq(DT.readLine('10:30').kind, 'text'); eq(DT.readLine('https://suivel.fr').kind, 'text');
  eq(DT.readLine('Voici ce que je voudrais pour la cuisine et le salon : un devis').kind, 'text', 'more than five words before the colon');
  eq(DT.readLine('-- ').kind, 'sig'); eq(DT.readLine('---').kind, 'sig');
  eq(DT.readLine('Ceci est une notification qu’un formulaire de contact a été envoyé sur votre site web').kind, 'notice');
});

console.log('The fictional example (three layouts)');
var EX = DT.parse(DT.EXAMPLE);
test('three requests, four columns, nothing left over', function () {
  eq(EX.columns, ['Nom', 'E-mail', 'Ville', 'Message']);
  eq(EX.rows.length, 3); eq(EX.ignored, 0);
  eq(EX.rows.map(function (r) { return r.Nom; }), ['Claire Petit', 'Paul Martin', 'Léa Garcia']);
  eq(EX.rows[0].Message, 'Bonjour, je voudrais un devis pour trois portes intérieures.\nPouvez-vous me rappeler en fin de journée ?');
  eq(EX.rows[1].Ville, 'Sète'); eq(EX.rows[2]['E-mail'], 'lea.garcia@example.com');
});
test('summary', function () {
  eq(DT.summaryText(EX), '3 demandes lues, 4 colonnes' + S + ': Nom, E-mail, Ville, Message.');
  var extra = DT.parse('Nom : A\nE-mail : a@example.com\nbonjour');
  eq(extra.rows, [{ Nom: 'A', 'E-mail': 'a@example.com' }], 'text after a one-line field is not glued to it');
  eq(DT.summaryText(extra), '1 demande lue, 2 colonnes' + S + ': Nom, E-mail. 1 ligne n\'appartient à aucun champ et est laissée de côté.');
});

console.log('Real layouts from the research');
test('Contact Form 7 default mail (French)', function () {
  var r = DT.parse('De : Jean Dupont <jean.dupont@example.com>\nObjet : Devis\n\nCorps du message :\nligne 1\nligne 2\n\n-- \nCeci est une notification qu’un formulaire de contact a été envoyé sur votre site web (Site https://site.example.com).');
  eq(r.columns, ['Nom', 'E-mail', 'Objet', 'Message']);
  eq(r.rows, [{ Nom: 'Jean Dupont', 'E-mail': 'jean.dupont@example.com', Objet: 'Devis', Message: 'ligne 1\nligne 2' }]);
  eq(r.ignored, 0);
});
test('Contact Form 7, current source (no angle brackets)', function () {
  eq(DT.parse('From: Jean Dupont jean@example.com\nSubject: Devis\n\nMessage Body:\nBonjour').rows[0],
    { Nom: 'Jean Dupont', 'E-mail': 'jean@example.com', Objet: 'Devis', Message: 'Bonjour' });
});
test('WPForms plain text, with an empty field', function () {
  var r = DT.parse('--- Name ---\n\nJohn Doe\n\n--- Email ---\n\njohn@example.com\n\n--- Comment or Message ---\n\n(empty)\n\nSent from Mon site');
  eq(r.rows, [{ Nom: 'John Doe', 'E-mail': 'john@example.com', Message: '' }]);
});
test('Shopify: label, then value on the next line', function () {
  var r = DT.parse('You received a new message from your online store\'s contact form.\nCountry Code:\nFR\nName:\nJoe Bloggs\nEmail:\njoe@example.com\nPhone Number:\n0600000000\nComment:\nBonjour\nmerci');
  eq(r.columns, ['Pays', 'Nom', 'E-mail', 'Téléphone', 'Message']);
  eq(r.rows[0].Message, 'Bonjour\nmerci'); eq(r.ignored, 0);
});
test('Elementor: fields, then technical lines dropped', function () {
  var r = DT.parse('Your name: Tom Martin\nEmail address: tom@example.com\n---\nDate: 6 février 2026\nTime: 5:39\nPage URL: https://site.example.com/contact/\nUser Agent: Mozilla/5.0\nRemote IP: 192.0.2.1\nPowered by: Elementor');
  eq(r.columns, ['Nom', 'E-mail', 'Date', 'Heure', 'Page URL']);
  eq(r.rows[0]['Page URL'], 'https://site.example.com/contact/');
});
test('a "Word: text" line inside a message stays in the message', function () {
  var r = DT.parse('Nom : A\nMessage : Bonjour\nRemarque : je suis libre lundi\nRappel à 10:30 si possible\nE-mail : a@example.com');
  eq(r.rows[0].Message, 'Bonjour\nRemarque : je suis libre lundi\nRappel à 10:30 si possible');
  eq(r.rows[0]['E-mail'], 'a@example.com', 'a known label ends the message');
});
test('a label that comes back starts a new request; columns are the union, in order', function () {
  var r = DT.parse('Nom : A\nE-mail : a@example.com\nNom : B\nTéléphone : 01\nE-mail : b@example.com');
  eq(r.columns, ['Nom', 'E-mail', 'Téléphone']);
  eq(r.rows, [{ Nom: 'A', 'E-mail': 'a@example.com' }, { Nom: 'B', 'Téléphone': '01', 'E-mail': 'b@example.com' }]);
});
test('mail headers are dropped; text outside any field is counted', function () {
  var r = DT.parse('Envoyé : lundi 12 octobre 2026 10:02\nÀ : contact@example.com\nBonjour,\nNom : A\nE-mail : a@example.com');
  eq(r.rows, [{ Nom: 'A', 'E-mail': 'a@example.com' }]); eq(r.ignored, 1);
  ok(/1 ligne n'appartient à aucun champ et est laissée de côté\./.test(DT.summaryText(r)) || /1 ligne n'appartient/.test(DT.summaryText(r)), 'says so');
  eq(DT.parse('').rows, []); eq(DT.parse('du texte sans champ').rows, []); eq(DT.summaryText(DT.parse('')), '');
});

console.log('Copy and CSV');
test('copy for a spreadsheet: tabs, line breaks as " / ", formulas neutralised', function () {
  var r = DT.parse('Nom : =HYPERLINK("x")\nTéléphone : +33 6 00 00 00 00\nMessage : ligne 1\nligne 2');
  eq(DT.toTsv(r), 'Nom\tTéléphone\tMessage\n\'=HYPERLINK("x")\t\'+33 6 00 00 00 00\tligne 1 / ligne 2');
  eq(DT.safeCell('@SUM(A1)'), '\'@SUM(A1)'); eq(DT.safeCell('-2'), '\'-2'); eq(DT.safeCell('Claire'), 'Claire');
  // OWASP list (16 Oct 2026): full-width forms, leading tab or line break
  eq(DT.safeCell('＝1+2'), '\'＝1+2'); eq(DT.safeCell('＠x'), '\'＠x'); eq(DT.safeCell('\t=1'), '\'\t=1'); eq(DT.safeCell('\n=1'), '\'\n=1');
  eq(DT.safeCell('Marie-Claire'), 'Marie-Claire');
  // the header row comes from the visitor's e-mail too (review 16 Oct)
  var h = DT.parse('Adresse : 1 rue X\n--- =HYPERLINK("http://x") ---\nvaleur');
  ok(DT.toTsv(h).split('\n')[0].split('\t').every(function (c) { return !/^[=+\-@]/.test(c); }), 'no header cell starts with a formula sign');
});
test('text pasted but no field found: the visitor is told, with what the tool reads (review 16 Oct)', function () {
  var r = DT.parse('Vous avez une nouvelle réponse.\nOuvrez le formulaire pour la voir.');
  eq(r.rows, []);
  ok(/^Aucun champ reconnu dans ce texte/.test(DT.noFieldText(r, 'Vous avez…')), 'says no field');
  ok(/lignes laissées de côté|ligne laissée de côté/.test(DT.noFieldText(r, 'x')), 'says how many lines');
  eq(DT.noFieldText(r, '   '), '');
  eq(DT.noFieldText(DT.parse('Nom : Claire'), 'Nom : Claire'), '');
  ok(!/ [:;?!»€]/.test(DT.noFieldText(r, 'x')), 'French spaces');
});
test('CSV for Excel in French: BOM, semicolons, CRLF, quotes, line breaks kept', function () {
  var r = DT.parse('Nom : Petit; Claire\nMessage : il a dit "oui"\nmerci');
  eq(DT.toCsv(r), '﻿Nom;Message\r\n"Petit; Claire";"il a dit ""oui""\nmerci"\r\n');
});

console.log('Brand and privacy');
test('no old brand, nothing sent or stored, French spaces in the texts', function () {
  var src = fs.readFileSync(path.join(__dirname, '..', 'assets', 'demandes-tableau.js'), 'utf8');
  ok(!/fairdraft|studio/i.test(src), 'no old brand');
  ok(!/fetch\(|XMLHttpRequest|localStorage|sessionStorage|document\.cookie|sendBeacon/.test(src), 'nothing sent or stored');
  ok(!/ [:;?!»€]/.test(DT.summaryText(EX)), 'no ordinary space before : ; ? ! » €');
});

console.log('\n' + passed + '/' + (passed + failed) + ' tests passed');
if (failed) process.exit(1);

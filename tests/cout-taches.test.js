// Tests for assets/cout-taches.js (pure functions). Run: node repos/fairdraftstudio.fr/tests/cout-taches.test.js
// No dependencies, fictional data, no clock (the tool uses no date).
// Every sentence the tool writes is tried on the example AND on the cases a visitor meets first: one task, a tie, tiny totals
// (review 12 Oct: « Ces tâches » for one task and 3 h 45 shown as one 7-hour day had passed the first tests).
'use strict';
var path = require('path');
var fs = require('fs');
var CT = require(path.join(__dirname, '..', 'assets', 'cout-taches.js'));

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
var S = CT.NBSP, N = CT.NNBSP;
function task(name, minutes, count, unit) { return { name: name, minutes: String(minutes), count: String(count), unit: unit || 'semaine' }; }

console.log('Numbers');
test('French and plain numbers', function () {
  eq(CT.parseNumber('12'), 12); eq(CT.parseNumber('12,5'), 12.5); eq(CT.parseNumber('12.5'), 12.5);
  eq(CT.parseNumber(' 1 250 '), 1250); eq(CT.parseNumber('1' + N + '250'), 1250); eq(CT.parseNumber(''), null); eq(CT.parseNumber(null), null);
});
test('bad numbers are NaN', function () {
  ok(isNaN(CT.parseNumber('abc'))); ok(isNaN(CT.parseNumber('-5'))); ok(isNaN(CT.parseNumber('1,2,3'))); ok(isNaN(CT.parseNumber('5 min')));
});

console.log('Formats');
test('durations', function () {
  eq(CT.formatDuration(0), '0' + S + 'min'); eq(CT.formatDuration(45), '45' + S + 'min'); eq(CT.formatDuration(60), '1' + S + 'h');
  eq(CT.formatDuration(244), '4' + S + 'h' + S + '04'); eq(CT.formatDuration(1350), '22' + S + 'h' + S + '30');
  eq(CT.formatDuration(10980), '183' + S + 'h'); eq(CT.formatDuration(60000), '1' + N + '000' + S + 'h');
});
test('euros and rates', function () {
  eq(CT.formatEuros(7320), '7' + N + '320' + S + '€'); eq(CT.formatEuros(810), '810' + S + '€'); eq(CT.formatEuros(1012.5), '1' + N + '013' + S + '€');
  eq(CT.formatRate(40), '40' + S + '€'); eq(CT.formatRate(37.5), '37,5' + S + '€'); eq(CT.formatRate(1000), '1' + N + '000' + S + '€');
});

console.log('Settings');
test('defaults and bounds', function () {
  eq(CT.readSettings({ rate: '', weeks: '' }), { rate: null, weeks: 45, errors: [] });
  eq(CT.readSettings({ rate: '40', weeks: '47' }), { rate: 40, weeks: 47, errors: [] });
  eq(CT.readSettings({ rate: '1000', weeks: '52' }).errors, []);
  eq(CT.readSettings({ rate: '1', weeks: '1' }).errors, []);
});
test('bad settings fall back, with a message', function () {
  var r = CT.readSettings({ rate: '0', weeks: '53' });
  eq(r.rate, null); eq(r.weeks, 45); eq(r.errors.length, 2);
  eq(CT.readSettings({ rate: '1001' }).rate, null);
  eq(CT.readSettings({ weeks: '45,5' }).weeks, 45);
  eq(CT.readSettings({ weeks: 'x' }).errors.length, 1);
});

console.log('Tasks');
test('weekly and monthly counts', function () {
  var w = CT.readTask(task('A', 10, 3), 0, 45);
  eq(w.minutesYear, 1350); eq(w.timesYear, 135);
  var m = CT.readTask(task('B', 90, 1, 'mois'), 1, 45);
  eq(m.minutesYear, 1080); eq(m.timesYear, 12);
  eq(CT.readTask(task('C', 90, 1, 'mois'), 2, 30).minutesYear, 1080, 'months ignore the weeks');
  eq(CT.readTask(task('D', '12,5', 2, 'autre'), 3, 45).unit, 'semaine', 'unknown unit = week');
});
test('blank, incomplete and out-of-range tasks', function () {
  ok(CT.readTask({ name: 'Rien', minutes: '', count: '' }, 0, 45).blank, 'blank row is skipped');
  eq(CT.readTask({ name: '', minutes: '', count: '' }, 4, 45).name, 'Tâche 5');
  eq(CT.readTask({ name: 'X', minutes: '', count: '2' }, 0, 45).error, 'indiquez combien de minutes elle prend à chaque fois.');
  eq(CT.readTask({ name: 'X', minutes: '5', count: '' }, 0, 45).error, 'indiquez combien de fois elle revient.');
  eq(CT.readTask(task('X', 0, 1), 0, 45).error, 'les minutes doivent être un nombre entre 1 et 480.');
  eq(CT.readTask(task('X', 481, 1), 0, 45).error, 'les minutes doivent être un nombre entre 1 et 480.');
  ok(!CT.readTask(task('X', 480, 100), 0, 45).error, 'upper bounds accepted');
  eq(CT.readTask(task('X', 5, 101), 0, 45).error, 'le nombre de fois doit être un nombre entier entre 1 et 100.');
  eq(CT.readTask(task('X', 5, '1,5'), 0, 45).error, 'le nombre de fois doit être un nombre entier entre 1 et 100.');
  eq(CT.readTask(task('  Classer   les PJ ', 5, 1), 0, 45).name, 'Classer les PJ');
});

console.log('The fictional example, recomputed by hand');
// Relances 10 min x 3 x 45 = 1350 min (22 h 30); comptes rendus 20 x 4 x 45 = 3600 (60 h); recopier 5 x 10 x 45 = 2250 (37 h 30);
// devis 30 x 2 x 45 = 2700 (45 h); rapprochement 90 x 1 x 12 = 1080 (18 h). Total 10 980 min = 183 h; / 45 = 244 min = 4 h 04 a week;
// / 420 = 26.14 -> 26 days of 7 h; at 40 EUR: 183 x 40 = 7 320 EUR; comptes rendus 60 x 40 = 2 400 EUR, 3600 / 10980 = 32.8 % -> 33 %.
var EX = CT.analyse(CT.EXAMPLE.tasks, { rate: CT.EXAMPLE.rate, weeks: CT.EXAMPLE.weeks });
test('totals', function () {
  eq(EX.totalMinutesYear, 10980); eq(EX.minutesPerWeek, 244); eq(EX.days, 26); eq(EX.totalCost, 7320); eq(EX.problems, []); eq(EX.tied, []);
});
test('sorted by time, with costs and shares', function () {
  eq(EX.items.map(function (t) { return t.minutesYear; }), [3600, 2700, 2250, 1350, 1080]);
  eq(EX.items.map(function (t) { return t.cost; }), [2400, 1800, 1500, 900, 720]);
  eq(EX.items.map(function (t) { return t.share; }), [33, 25, 20, 12, 10]);
  eq(EX.top.name, 'Mettre au propre les comptes rendus');
});
test('texts', function () {
  eq(CT.summaryText(EX), 'Ces tâches vous prennent environ 4' + S + 'h' + S + '04 par semaine travaillée, soit 183' + S + 'h par an (environ 26' + S + 'journées de 7' + S + 'h). À 40' + S + '€ de l\'heure, cela représente environ 7' + N + '320' + S + '€ par an.');
  eq(CT.topText(EX), 'Votre tâche la plus lourde' + S + ': «' + S + 'Mettre au propre les comptes rendus' + S + '», 60' + S + 'h par an, environ 2' + N + '400' + S + '€.');
  eq(CT.frequency(EX.items[0]), '20' + S + 'min, 4' + S + 'fois par semaine');
});

console.log('The cases a visitor meets first');
test('one task: singular, no "heaviest", 3 h 45 is less than a day', function () {
  var r = CT.analyse([task('Classer', 5, 1)], { rate: '40' });
  eq(r.totalMinutesYear, 225); eq(r.days, 0);
  eq(CT.summaryText(r), 'Cette tâche vous prend environ 5' + S + 'min par semaine travaillée, soit 3' + S + 'h' + S + '45 par an (moins d\'une journée de 7' + S + 'h). À 40' + S + '€ de l\'heure, cela représente environ 150' + S + '€ par an.');
  eq(CT.topText(r), 'Votre tâche «' + S + 'Classer' + S + '»' + S + ': 3' + S + 'h' + S + '45 par an, environ 150' + S + '€.');
});
test('tiny total: less than a minute a week', function () {
  var r = CT.analyse([task('Archiver', 1, 1, 'mois')], {});
  eq(r.totalMinutesYear, 12); eq(r.minutesPerWeek, 0);
  eq(CT.summaryText(r), 'Cette tâche vous prend moins d\'une minute par semaine travaillée, soit 12' + S + 'min par an (moins d\'une journée de 7' + S + 'h). Indiquez ce que vaut une heure de votre temps pour voir ce que cela représente en euros.');
});
test('days: under 420 min none, from 420 min "environ", singular at one', function () {
  eq(CT.analyse([task('A', 419, 1, 'mois')], {}).days, 12, '419 x 12 = 5028 min = 11.97 days');
  var one = CT.analyse([task('A', 35, 1, 'mois')], {});
  eq(one.days, 1, '420 min = 1 day');
  ok(CT.summaryText(one).indexOf('(environ 1' + S + 'journée de 7' + S + 'h)') > -1, 'singular day with « environ »');
  eq(CT.analyse([task('A', 34, 1, 'mois')], {}).days, 0, '408 min is less than a day');
});
test('a tie at the top: no "heaviest"', function () {
  var r = CT.analyse([task('Devis', 30, 2), task('Relances', 20, 3), task('Tri', 5, 1)], { rate: '40' });
  eq(r.tied.map(function (t) { return t.name; }), ['Devis', 'Relances']);
  eq(CT.topText(r), 'À égalité en tête' + S + ': «' + S + 'Devis' + S + '» et «' + S + 'Relances' + S + '», chacune 45' + S + 'h par an, soit environ 1' + N + '800' + S + '€.');
  var three = CT.analyse([task('A', 10, 1), task('B', 10, 1), task('C', 10, 1)], {});
  eq(CT.topText(three), 'À égalité en tête' + S + ': «' + S + 'A' + S + '», «' + S + 'B' + S + '» et «' + S + 'C' + S + '», chacune 7' + S + 'h' + S + '30 par an.');
});

console.log('Without a rate, and other edge cases');
test('hours only when no rate is given', function () {
  var r = CT.analyse([task('A', 30, 1)], { rate: '', weeks: '' });
  eq(r.totalCost, null); eq(r.items[0].cost, null); eq(r.days, 3, '22 h 30 / 7 h = 3.2');
  ok(/Indiquez ce que vaut une heure/.test(CT.summaryText(r)), 'asks for the rate');
  ok(!/€/.test(CT.topText(r)), 'no euros in the top line');
});
test('empty list, errors kept apart', function () {
  var none = CT.analyse([], {});
  eq(none.items, []); eq(none.top, null); eq(none.tied, []); eq(CT.summaryText(none), ''); eq(CT.topText(none), '');
  var mixed = CT.analyse([task('Bon', 10, 1), { name: 'Mauvais', minutes: 'x', count: '1' }, {}], { rate: '50' });
  eq(mixed.items.length, 1); eq(mixed.problems, [{ index: 1, name: 'Mauvais', message: 'les minutes doivent être un nombre entre 1 et 480.' }]);
});

console.log('Brand and typography');
test('no old brand, French spaces, no outside request in the script', function () {
  var src = fs.readFileSync(path.join(__dirname, '..', 'assets', 'cout-taches.js'), 'utf8');
  ok(!/fairdraft|studio/i.test(src), 'no old brand');
  ok(!/fetch\(|XMLHttpRequest|localStorage|sessionStorage|document\.cookie/.test(src), 'nothing sent or stored');
  var texts = [CT.summaryText(EX), CT.topText(EX), CT.summaryText(CT.analyse([task('A', 5, 1)], { rate: '40' }))].join(' ');
  ok(!/ [:;?!»€]/.test(texts), 'no ordinary space before : ; ? ! » €');
});

console.log('\n' + passed + '/' + (passed + failed) + ' tests passed');
if (failed) process.exit(1);

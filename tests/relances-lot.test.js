// Tests for assets/relances-lot.js (pure functions). Run: node repos/fairdraftstudio.fr/tests/relances-lot.test.js
// No dependencies. Fictional data, fixed "today" dates (never the real clock).
'use strict';
var path = require('path');
var RL = require(path.join(__dirname, '..', 'assets', 'relances-lot.js'));

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

var FRI = { y: 2026, m: 10, d: 9 };    // Friday 9 October 2026
var SAT = { y: 2026, m: 10, d: 10 };   // Saturday 10 October 2026
var SUN = { y: 2026, m: 10, d: 11 };   // Sunday 11 October 2026

function row(due, extra) {
  var r = { client: 'Client fictif', invoice: 'F-2026-001', amountCents: 125050, due: due, pro: true };
  Object.keys(extra || {}).forEach(function (k) { r[k] = extra[k]; });
  return r;
}
function one(due, today, opts, extra) { return RL.analyse([row(due, extra)], today, opts).items[0]; }

console.log('Calendar sanity');
test('the test dates are the weekdays the tests assume', function () {
  eq(RL.weekdayName(FRI), 'vendredi'); eq(RL.weekdayName(SAT), 'samedi'); eq(RL.weekdayName(SUN), 'dimanche');
});

console.log('Days late');
test('French date formats', function () {
  eq(RL.parseDate('15/09/2026'), { y: 2026, m: 9, d: 15 });
  eq(RL.parseDate('5/9/2026'), { y: 2026, m: 9, d: 5 });
  eq(RL.parseDate('15-09-2026'), { y: 2026, m: 9, d: 15 });
  eq(RL.parseDate('15.09.2026'), { y: 2026, m: 9, d: 15 });
  eq(RL.parseDate('15/09/26'), { y: 2026, m: 9, d: 15 });
});
test('ISO date format', function () {
  eq(RL.parseDate('2026-09-15'), { y: 2026, m: 9, d: 15 });
  eq(RL.parseDate('2026-09-15 08:30'), { y: 2026, m: 9, d: 15 });
});
test('impossible dates are refused', function () {
  eq(RL.parseDate('31/02/2026'), null); eq(RL.parseDate('2026-13-01'), null);
  eq(RL.parseDate('29/02/2027'), null); eq(RL.parseDate('abc'), null); eq(RL.parseDate(''), null);
});
test('days late from a French date string and from an ISO date string give the same count (15 Sep to 9 Oct = 24)', function () {
  eq(one('15/09/2026', FRI).daysLate, 24); eq(one('2026-09-15', FRI).daysLate, 24);
});
test('days late from ISO and from a parsed French date', function () {
  var fr = RL.parseInput('Client fictif;F-1;1 250,50;15/09/2026', true).rows[0];
  var iso = RL.parseInput('Client fictif;F-1;1 250,50;2026-09-15', true).rows[0];
  eq(fr.due, '2026-09-15'); eq(iso.due, '2026-09-15');
  eq(RL.analyse([fr], FRI).items[0].daysLate, 24);
  eq(RL.analyse([iso], FRI).items[0].daysLate, 24);
});
test('across a month end and a leap day (28 Feb to 1 Mar 2028 = 2)', function () {
  eq(one('2028-02-28', { y: 2028, m: 3, d: 1 }).daysLate, 2);
  eq(one('2027-02-28', { y: 2027, m: 3, d: 1 }).daysLate, 1);
});
test('across a year end (30 Dec 2026 to 2 Jan 2027 = 3)', function () {
  eq(one('2026-12-30', { y: 2027, m: 1, d: 2 }).daysLate, 3);
});

console.log('Reminder level');
test('level thresholds at the bounds: 14 days polite, 15 firm, 29 firm, 30 formal', function () {
  eq(one('2026-09-26', FRI).daysLate, 13); eq(one('2026-09-26', FRI).level, 1);
  eq(one('2026-09-25', FRI).daysLate, 14); eq(one('2026-09-25', FRI).level, 1);
  eq(one('2026-09-24', FRI).daysLate, 15); eq(one('2026-09-24', FRI).level, 2);
  eq(one('2026-09-10', FRI).daysLate, 29); eq(one('2026-09-10', FRI).level, 2);
  eq(one('2026-09-09', FRI).daysLate, 30); eq(one('2026-09-09', FRI).level, 3);
  eq(one('2026-08-01', FRI).level, 3);
});
test('1 day late is level 1; 0 days is no level', function () {
  eq(one('2026-10-08', FRI).level, 1); eq(one('2026-10-09', FRI).level, 0);
});
test('levelFor with the default thresholds', function () {
  var th = RL.normaliseThresholds(15, 30);
  eq([0, 1, 14, 15, 29, 30, 200].map(function (n) { return RL.levelFor(n, th); }), [0, 1, 1, 2, 2, 3, 3]);
});
test('custom thresholds are used, invalid ones fall back to 15 and 30', function () {
  eq(RL.normaliseThresholds(10, 20), { firm: 10, formal: 20, valid: true });
  eq(RL.normaliseThresholds(20, 10).valid, false);
  eq(RL.normaliseThresholds(20, 10).firm, 15); eq(RL.normaliseThresholds(20, 10).formal, 30);
  eq(RL.normaliseThresholds('', '').valid, false);
  eq(one('2026-09-25', FRI, { firm: 10, formal: 20 }).level, 2);   // 14 days late with firm = 10
});

console.log('Fee of 40 EUR');
test('40 EUR for a professional client who is late', function () {
  var i = one('2026-09-24', FRI);
  eq(i.feeCents, 4000); eq(i.pro, true);
});
test('no fee for a private client', function () {
  var i = one('2026-09-24', FRI, null, { pro: false });
  eq(i.feeCents, 0); eq(i.pro, false);
});
test('one fee per invoice, whatever the number of days late', function () {
  eq(one('2026-09-24', FRI).feeCents, 4000); eq(one('2025-01-10', FRI).feeCents, 4000);
});
test('summary counts the fee for professional clients only', function () {
  var res = RL.analyse([row('2026-09-24'), row('2026-09-10', { pro: false, invoice: 'F-2' }), row('2026-08-01', { invoice: 'F-3' })], FRI);
  eq(res.summary.lateCount, 3); eq(res.summary.feeCount, 2); eq(res.summary.feesCents, 8000); eq(res.summary.privateLateCount, 1);
});
test('the pasted fifth column and the default decide professional or private', function () {
  var p = RL.parseInput('A;F-1;100;2026-09-01\nB;F-2;100;2026-09-01;particulier\nC;F-3;100;2026-09-01;entreprise', true);
  eq(p.rows.map(function (r) { return r.pro; }), [true, false, true]);
  eq(RL.parseInput('A;F-1;100;2026-09-01', false).rows[0].pro, false);
});
test('reminder texts mention 40 EUR only for professional clients (levels 2 and 3)', function () {
  var proText2 = RL.reminderText(one('2026-09-24', FRI), FRI);
  var privText2 = RL.reminderText(one('2026-09-24', FRI, null, { pro: false }), FRI);
  var proText3 = RL.reminderText(one('2026-08-01', FRI), FRI);
  var privText3 = RL.reminderText(one('2026-08-01', FRI, null, { pro: false }), FRI);
  ok(/40 €/.test(proText2) && /40 €/.test(proText3), 'professional texts must mention 40 EUR');
  ok(!/40 €|L441-10/.test(privText2) && !/40 €|L441-10/.test(privText3), 'private texts must not mention 40 EUR');
  ok(!/40 €/.test(RL.reminderText(one('2026-09-25', FRI), FRI)), 'level 1 never mentions the fee');
});

console.log('Late-payment penalties');
test('no rate typed: no penalty estimate', function () {
  var res = RL.analyse([row('2026-09-15')], FRI);
  eq(res.items[0].penaltyCents, null); eq(res.summary.penaltiesCents, null); eq(res.rate, null);
});
test('rate typed: amount x rate x days / 365, rounded (1 250,50 EUR, 12,40 %, 24 days = 10,20 EUR)', function () {
  // 125050 x 12.4 % x 24 / 365 = 1019.58 cents, rounded to 1020
  var res = RL.analyse([row('2026-09-15')], FRI, { rate: 12.4 });
  eq(res.items[0].daysLate, 24); eq(res.items[0].penaltyCents, 1020); eq(res.summary.penaltiesCents, 1020);
  eq(res.summary.totalClaimCents, 125050 + 4000 + 1020);
});
test('the day count in the formula follows the days late (1 day, 365 days)', function () {
  eq(one('2026-10-08', FRI, { rate: 10 }, { amountCents: 365000 }).penaltyCents, 100);       // 3650 EUR x 10 % / 365 = 1 EUR
  eq(one('2025-10-09', FRI, { rate: 10 }, { amountCents: 100000 }).penaltyCents, 10000);     // 365 days: 10 % of 1000 EUR
});
test('no penalty for a private client even with a rate', function () {
  var res = RL.analyse([row('2026-09-15', { pro: false })], FRI, { rate: 12.4 });
  eq(res.items[0].penaltyCents, null); eq(res.summary.penaltiesCents, null);
});
test('rate parsing', function () {
  eq(RL.parseRate('12,40').value, 12.4); eq(RL.parseRate('12.4 %').value, 12.4);
  eq(RL.parseRate('').value, null); eq(RL.parseRate('').error, null);
  ok(RL.parseRate('abc').error, 'text is refused'); ok(RL.parseRate('0').error, 'zero is refused'); ok(RL.parseRate('101').error, 'over 100 is refused');
});
test('rate below 8,25 % is flagged during the 2nd half of 2026 only', function () {
  ok(RL.rateWarning(8, FRI), 'warning below the floor');
  eq(RL.rateWarning(12.4, FRI), null); eq(RL.rateWarning(null, FRI), null);
  eq(RL.rateWarning(8, { y: 2027, m: 1, d: 5 }), null);
  eq(RL.referenceRate(FRI).rate, 12.4); eq(RL.referenceRate({ y: 2027, m: 1, d: 5 }), null);
});

console.log('Due today or in the future');
test('due today is not late: no level, no fee, no penalty, no follow-up', function () {
  var i = one('2026-10-09', FRI, { rate: 12.4 });
  eq(i.late, false); eq(i.daysLate, 0); eq(i.level, 0); eq(i.feeCents, 0); eq(i.penaltyCents, null); eq(i.followUp, null);
});
test('due in the future is not late and counts days until due', function () {
  var i = one('2026-10-12', FRI, { rate: 12.4 });
  eq(i.late, false); eq(i.daysLate, -3); eq(i.daysUntilDue, 3); eq(i.level, 0); eq(i.feeCents, 0); eq(i.followUp, null);
});
test('summary: not-yet-due invoices are pending, not in the totals', function () {
  var res = RL.analyse([row('2026-09-15'), row('2026-10-09', { invoice: 'F-2' }), row('2026-11-01', { invoice: 'F-3' })], FRI, { rate: 12.4 });
  eq(res.summary.lateCount, 1); eq(res.summary.pendingCount, 2); eq(res.summary.totalDueCents, 125050);
  eq(res.summary.pendingTotalCents, 250100); eq(res.summary.feesCents, 4000);
});
test('not-yet-due invoices are left out of the reminders and of the calendar', function () {
  var res = RL.analyse([row('2026-10-09'), row('2026-11-01', { invoice: 'F-2' })], FRI);
  eq(RL.allReminders(res.items, FRI), '');
  eq(RL.buildIcs(res.items, FRI, new Date(Date.UTC(2026, 9, 9, 8, 0, 0))), null);
  var mixed = RL.analyse([row('2026-09-15'), row('2026-10-09', { invoice: 'F-2' })], FRI);
  var ics = RL.buildIcs(mixed.items, FRI, new Date(Date.UTC(2026, 9, 9, 8, 0, 0)));
  eq(ics.split('BEGIN:VEVENT').length - 1, 1);
});

console.log('Follow-up date (.ics rule)');
function follow(due, today, firm, formal) {
  var i = one(due, today, firm ? { firm: firm, formal: formal } : null);
  return i.followUp;
}
test('level 1 invoice: the day it reaches level 2, if it is at least 7 days ahead (1 day late on Friday 9 Oct: Fri 23 Oct)', function () {
  var f = follow('2026-10-08', FRI);
  eq(RL.toIso(f.date), '2026-10-23'); eq(f.daysLate, 15); eq(f.level, 2); eq(f.daysFromToday, 14);
});
test('never sooner than 7 days from today (level 1, 14 days late: level 2 tomorrow, follow-up Fri 16 Oct)', function () {
  var f = follow('2026-09-25', FRI);
  eq(RL.toIso(f.date), '2026-10-16'); eq(f.daysFromToday, 7); eq(f.daysLate, 21); eq(f.level, 2);
});
test('level 2 invoice: the day it reaches level 3, at least 7 days ahead (24 days late: Thu 15 Oct is only 6 days away, so Fri 16 Oct)', function () {
  var f = follow('2026-09-15', FRI);
  eq(RL.toIso(f.date), '2026-10-16'); eq(f.daysLate, 31); eq(f.level, 3); eq(f.daysFromToday, 7);
});
test('level 3 invoice: today + 7 days', function () {
  var f = follow('2026-08-01', FRI);
  eq(RL.toIso(f.date), '2026-10-16'); eq(f.level, 3); eq(f.daysFromToday, 7);
});
test('a Saturday result moves to Monday (level 2 reaching level 3 on Sat 24 Oct: Mon 26 Oct)', function () {
  var f = follow('2026-09-24', FRI);   // due + 30 = Sat 24 Oct
  eq(RL.weekdayName(RL.fromDayNumber(RL.dayNumber({ y: 2026, m: 10, d: 24 }))), 'samedi');
  eq(RL.toIso(f.date), '2026-10-26'); eq(RL.weekdayName(f.date), 'lundi'); eq(f.daysLate, 32); eq(f.level, 3);
});
test('a Saturday result moves to Monday (level 1 reaching level 2 on Sat 24 Oct, asked on Saturday 10 Oct)', function () {
  var f = follow('2026-10-09', SAT);   // due + 15 = Sat 24 Oct; today + 7 = Sat 17 Oct
  eq(RL.toIso(f.date), '2026-10-26'); eq(RL.weekdayName(f.date), 'lundi'); eq(f.level, 2);
});
test('a Sunday result moves to Monday (level 3 asked on Sunday 11 Oct: Sun 18 Oct becomes Mon 19 Oct)', function () {
  var f = follow('2026-08-01', SUN);
  eq(RL.toIso(f.date), '2026-10-19'); eq(RL.weekdayName(f.date), 'lundi'); eq(f.daysFromToday, 8);
});
test('level 3 asked on Saturday 10 Oct: Sat 17 Oct becomes Mon 19 Oct', function () {
  eq(RL.toIso(follow('2026-08-01', SAT).date), '2026-10-19');
});
test('skipWeekend leaves weekdays alone', function () {
  var fri = RL.dayNumber(FRI);
  eq(RL.fromDayNumber(RL.skipWeekend(fri)), FRI);
  eq(RL.fromDayNumber(RL.skipWeekend(fri + 1)), { y: 2026, m: 10, d: 12 });
  eq(RL.fromDayNumber(RL.skipWeekend(fri + 2)), { y: 2026, m: 10, d: 12 });
});
test('a follow-up is never on a weekend and never earlier than today + 7, whatever the due date', function () {
  var todayN = RL.dayNumber(FRI), bad = [];
  for (var back = 1; back <= 120; back++) {
    var due = RL.fromDayNumber(todayN - back);
    var f = one(RL.toIso(due), FRI).followUp;
    var wd = RL.weekdayName(f.date);
    if (wd === 'samedi' || wd === 'dimanche' || f.daysFromToday < 7) bad.push(back);
  }
  eq(bad, []);
});
test('the .ics file: one all-day event per late invoice, on the follow-up date', function () {
  var res = RL.analyse([row('2026-09-15'), row('2026-08-01', { invoice: 'F-2', client: 'Société, B; fictive' })], FRI);
  var ics = RL.buildIcs(res.items, FRI, new Date(Date.UTC(2026, 9, 9, 8, 0, 0)));
  ok(ics.indexOf('BEGIN:VCALENDAR\r\n') === 0 && /END:VCALENDAR\r\n$/.test(ics), 'calendar envelope with CRLF');
  eq(ics.split('BEGIN:VEVENT').length - 1, 2); eq(ics.split('END:VEVENT').length - 1, 2);
  ok(ics.indexOf('DTSTART;VALUE=DATE:20261016') >= 0 && ics.indexOf('DTEND;VALUE=DATE:20261017') >= 0, 'start 16 Oct, end 17 Oct');
  ok(ics.indexOf('DTSTAMP:20261009T080000Z') >= 0, 'stamp');
  ok(ics.indexOf('PRODID:-//Suivel//') >= 0 && ics.indexOf('@suivel.fr') >= 0, 'brand in PRODID and UID');
  ok(!/fairdraft/i.test(ics), 'no old brand in the calendar file');
  ics.split('\r\n').forEach(function (line) { ok(Buffer.byteLength(line, 'utf8') <= 75, 'line over 75 octets: ' + line); });
  ok(ics.replace(/\r\n /g, '').indexOf('Société\\, B\\; fictive') >= 0, 'commas and semicolons escaped');
});

console.log('Input and amounts (supporting checks)');
test('amounts', function () {
  eq(RL.parseAmountCents('1 250,50'), 125050); eq(RL.parseAmountCents('1.250,50'), 125050);
  eq(RL.parseAmountCents('1250.50'), 125050); eq(RL.parseAmountCents('940'), 94000);
  eq(RL.parseAmountCents('1 250 €'), 125000); eq(RL.parseAmountCents('0'), null); eq(RL.parseAmountCents('abc'), null);
});
test('header row skipped, bad rows reported with their line number', function () {
  var p = RL.parseInput('Client;Facture;Montant TTC;Échéance\nA;F-1;100;15/09/2026\nB;F-2;pas un montant;15/09/2026\nC;F-3;100', true);
  eq(p.skippedHeader, true); eq(p.rows.length, 1); eq(p.errors.map(function (e) { return e.line; }), [3, 4]);
});
test('tab-separated rows (copied from a spreadsheet)', function () {
  var p = RL.parseInput('A\tF-1\t100,00\t15/09/2026\nB\tF-2\t200\t2026-09-20\tparticulier', true);
  eq(p.rows.length, 2); eq(p.rows[1].pro, false);
});
test('no old brand in the reminder texts', function () {
  [one('2026-09-25', FRI), one('2026-09-24', FRI), one('2026-08-01', FRI)].forEach(function (i) {
    ok(!/fairdraft|studio/i.test(RL.reminderText(i, FRI)), 'level ' + i.level);
  });
});

console.log('\n' + passed + '/' + (passed + failed) + ' tests passed' + (failed ? ', ' + failed + ' FAILED' : ''));
process.exit(failed ? 1 : 0);

import test from 'node:test';
import assert from 'node:assert/strict';
import { calculate, normalizeInputs, questions, ENGINE_VERSION } from '../engine/valuation.mjs';
import { makePdf } from '../engine/pdf.mjs';
import { referenceInputs, excelContributions } from './engine-reference.mjs';

// Brescia: SUM was −5 because E58 "nessuno" was text. Intended floorRepairs +1 → correction −4.
// value = 65 × 1450 × 0.96 = 90_480; minimum = 90% = 81_432.
test('Brescia workbook case reproduces every effective contribution and both amounts', () => {
  const result = calculate(referenceInputs, 1450);
  const actual = Object.fromEntries(result.factors.map(f => [f.id, f.value]));
  for (const [id, value] of Object.entries(excelContributions)) assert.equal(actual[id] ?? 0, value, id);
  assert.equal(result.correction, -4);
  assert.equal(result.value, 90480);
  assert.equal(result.minimum, 81432);
  assert.deepEqual(result.warnings, []);
});

test('unavailable floor and year formulas are identified on partial estimates', () => {
  const input = { ...referenceInputs, floor: 'terra', year: 'Dopo il 2008' };
  const result = calculate(input, 1450);
  assert.equal(result.correction, -7);
  assert.equal(result.warnings.length, 2);
  assert.match(result.warnings[0], /Piano/);
});

test('piano and anno selects follow the PHP options without inventing missing maps', () => {
  const floor = questions.find(q => q.id === 'floor');
  const year = questions.find(q => q.id === 'year');
  assert.equal(ENGINE_VERSION, 'xls-1.1.0');
  assert.equal(floor.type, 'select');
  assert.deepEqual(floor.options.slice(0, 4), ['rialzato', 'interrato', 'terra', '1']);
  assert.ok(floor.options.includes('50'));
  assert.equal(year.type, 'select');
  assert.ok(year.options.includes('1900'));
  assert.ok(year.options.includes('Di nuova costruzione'));
  assert.ok(year.options.includes('Prima del 1920'));
  assert.throws(() => calculate({ ...referenceInputs, floor: 'ultimo' }, 1450), RangeError);
  assert.deepEqual(calculate({ ...referenceInputs, year: 1900 }, 1450).warnings, []);
});

test('parking uses the workbook fallback, including for zero or blank', () => {
  for (const value of ['', 0, 4]) {
    assert.equal(calculate({ surface: 100, garages: value, parkingSpaces: value }, 1000).correction, -2);
  }
  assert.equal(calculate({ surface: 100, garages: 3, parkingSpaces: 2 }, 1000).correction, 9);
});

test('empty and numeric-zero answers stay zero; repaired Excel text coefficients use intended scores', () => {
  const raw = { surface: '60,50', livingRooms: 0, attics: '', floorRepairs: 'nessuno', noise: 'inquinamento acustico intenso' };
  const inputs = normalizeInputs(raw);
  assert.equal(inputs.livingRooms, 0);
  assert.ok(!Object.hasOwn(inputs, 'attics'));
  // parking/garage fallback −1 each, E58 nessuno +1, E74 intenso −1.9 → −2.9
  assert.equal(calculate(inputs, 1000).correction, -2.9);
});

test('lease and multiple-level fields only apply when relevant', () => {
  const raw = { ...referenceInputs, occupancy: 'locato', leaseType: 'locato soggetto a equo canone', leaseYears: 2, singleLevel: 'No', levels: 5 };
  assert.equal(calculate(raw, 1450).correction, -11.2);
  const clean = normalizeInputs({ ...raw, occupancy: 'libero', singleLevel: 'si' });
  assert.equal(clean.leaseYears, undefined);
  assert.equal(clean.levels, undefined);
  assert.equal(calculate(clean, 1450).correction, -4);
});

test('ascensore and maintenance use their own workbook coefficients', () => {
  assert.equal(calculate({ ...referenceInputs, elevator: 'Sì', buildingCondition: 'ottimo' }, 1450).correction, 0.5);
  // E61 "va bene così" is +1 (peer rows), not Excel's +6; Brescia −4 + 1.6 from −0.6 → −2.4
  assert.equal(calculate({ ...referenceInputs, entranceDoor: 'va bene così' }, 1450).correction, -2.4);
});

test('vista key eccezzionale is accepted as Eccezionale and is not a public option', () => {
  const view = questions.find(q => q.id === 'view');
  assert.ok(view.options.includes('Eccezionale'));
  assert.ok(!view.options.includes('eccezzionale'));
  const inputs = normalizeInputs({ ...referenceInputs, view: 'eccezzionale' });
  assert.equal(inputs.view, 'Eccezionale');
  assert.equal(calculate(inputs, 1450).correction, -1.2);
});

test('validates inputs and money rounding', () => {
  for (const value of [null, '', 0, -1, 0.009, Infinity, {}, '1e7']) assert.throws(() => calculate({ surface: value }, 1000), RangeError);
  for (const rate of [0, -1, '100', Infinity, NaN]) assert.throws(() => calculate(referenceInputs, rate), RangeError);
  assert.throws(() => calculate({ surface: 10, elevator: 'maybe' }, 2), RangeError);
  assert.throws(() => calculate({ surface: 10, garages: 2.2 }, 2), RangeError);
  const amount = calculate({ surface: 1, parkingSpaces: 1, garages: 1 }, 1.0625);
  assert.equal(amount.value, 1.11);
  assert.equal(amount.minimum, 0.99);
});

test('public question identifiers are unique and score metadata stays on the server', () => {
  assert.equal(new Set(questions.map(q => q.id)).size, questions.length);
  for (const q of questions) {
    assert.ok(!Object.hasOwn(q, 'scores'));
    assert.ok(!Object.hasOwn(q, 'aliases'));
    if (q.type === 'select') assert.ok(q.options.length > 0);
    if (q.when) assert.ok(questions.some(item => item.id === q.when.id));
  }
});

test('PDF bytes include the saved estimate, source, dates and qualifications', () => {
  const inputs = { ...referenceInputs, floor: 'terra' };
  const result = calculate(inputs, 1450);
  const pdf = new TextDecoder().decode(makePdf({ result, inputs, comune: 'Comune prova', zona: 'Centro',
    destinazione: 'Direzionale', fonte: 'Listino prova', data_riferimento: '2025-01-01', createdAt: '2026-01-01T00:00:00Z', engineVersion: ENGINE_VERSION }));
  for (const str of ['%PDF-1.4', 'Stima indicativa parziale', 'Listino prova', 'Comune prova', '87.652,50', '78.887,25', ENGINE_VERSION, '%%EOF']) {
    assert.ok(pdf.includes(str), str);
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { calculate, normalizeInputs, questions } from '../engine/valuation.mjs';
import { makePdf } from '../engine/pdf.mjs';
import { referenceInputs, excelContributions } from './engine-reference.mjs';

test('Brescia workbook case reproduces every effective contribution and both amounts', () => {
  const result = calculate(referenceInputs, 1450);
  const actual = Object.fromEntries(result.factors.map(f => [f.id, f.value]));
  for (const [id, value] of Object.entries(excelContributions)) assert.equal(actual[id] ?? 0, value, id);
  assert.equal(result.correction, -5);
  assert.equal(result.value, 89537.50);
  assert.equal(result.minimum, 80583.75);
  assert.deepEqual(result.warnings, []);
});

test('unavailable floor and year formulas are identified on partial estimates', () => {
  const input = { ...referenceInputs, floor: 'ultimo', year: 2000 };
  const result = calculate(input, 1450);
  assert.equal(result.correction, -8);
  assert.equal(result.warnings.length, 2);
  assert.match(result.warnings[0], /Piano/);
});

test('parking uses the workbook fallback, including for zero or blank', () => {
  for (const value of ['', 0, 4]) {
    assert.equal(calculate({ surface: 100, garages: value, parkingSpaces: value }, 1000).correction, -2);
  }
  assert.equal(calculate({ surface: 100, garages: 3, parkingSpaces: 2 }, 1000).correction, 9);
});

test('empty, numeric zero, and text-valued Excel results retain their semantics', () => {
  const raw = { surface: '60,50', livingRooms: 0, attics: '', floorRepairs: 'nessuno', noise: 'inquinamento acustico intenso' };
  const inputs = normalizeInputs(raw);
  assert.equal(inputs.livingRooms, 0);
  assert.ok(!Object.hasOwn(inputs, 'attics'));
  assert.equal(calculate(inputs, 1000).correction, -2);
});

test('lease and multiple-level fields only apply when relevant', () => {
  const raw = { ...referenceInputs, occupancy: 'locato', leaseType: 'locato soggetto a equo canone', leaseYears: 2, singleLevel: 'No', levels: 5 };
  assert.equal(calculate(raw, 1450).correction, -12.2);
  const clean = normalizeInputs({ ...raw, occupancy: 'libero', singleLevel: 'si' });
  assert.equal(clean.leaseYears, undefined);
  assert.equal(clean.levels, undefined);
  assert.equal(calculate(clean, 1450).correction, -5);
});

test('ascensore and maintenance use their own workbook coefficients', () => {
  assert.equal(calculate({ ...referenceInputs, elevator: 'Sì', buildingCondition: 'ottimo' }, 1450).correction, -0.5);
  assert.equal(calculate({ ...referenceInputs, entranceDoor: 'va bene così' }, 1450).correction, 1.6);
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
    if (q.type === 'select') assert.ok(q.options.length > 0);
    if (q.when) assert.ok(questions.some(item => item.id === q.when.id));
  }
});

test('PDF bytes include the saved estimate, source, dates and qualifications', () => {
  const inputs = { ...referenceInputs, floor: 'ultimo' };
  const result = calculate(inputs, 1450);
  const pdf = new TextDecoder().decode(makePdf({ result, inputs, comune: 'Comune prova', zona: 'Centro',
    destinazione: 'Direzionale', fonte: 'Listino prova', data_riferimento: '2025-01-01', createdAt: '2026-01-01T00:00:00Z', engineVersion: 'xls-1.0.0' }));
  for (const str of ['%PDF-1.4', 'Stima indicativa parziale', 'Listino prova', 'Comune prova', '86.710,00', '78.039,00', 'xls-1.0.0', '%%EOF']) {
    assert.ok(pdf.includes(str), str);
  }
});

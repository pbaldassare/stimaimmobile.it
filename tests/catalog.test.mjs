import test from 'node:test';
import assert from 'node:assert/strict';
import { fields } from '../engine/model.mjs';
import { calculate } from '../engine/valuation.mjs';
import { fromAdminFields, fromDbRows, publicQuestions, toAdminFields, toDbRows, validateCatalog } from '../engine/catalog.mjs';
import { referenceInputs } from './engine-reference.mjs';

test('Excel seed round-trips through admin payload and database rows', () => {
  const admin = toAdminFields(fields);
  const restored = fromAdminFields({ fields: admin });
  assert.equal(restored.length, fields.length);
  const seed = calculate(referenceInputs, 1450);
  const again = calculate(referenceInputs, 1450, restored);
  assert.equal(again.correction, seed.correction);
  assert.equal(again.value, seed.value);
  const { fields: fieldRows, options } = toDbRows(fields);
  const fromDb = fromDbRows(fieldRows, options);
  assert.equal(calculate(referenceInputs, 1450, fromDb).value, seed.value);
});

test('public questions hide coefficients and never expose free text', () => {
  for (const question of publicQuestions(fields)) {
    assert.equal(question.scores, undefined);
    assert.notEqual(question.type, 'text');
  }
});

test('rejects a catalog without surface or with a cyclic condition', () => {
  assert.throws(() => validateCatalog([{ id: 'alarm', label: 'Antifurto', group: 'Dotazioni', type: 'yesno', options: ['Sì', 'No'] }]), /superficie/);
  assert.throws(() => fromAdminFields({
    fields: [
      { id: 'surface', label: 'Superficie commerciale (m²)', group: 'Superfici e locali', type: 'number', required: true, min: 0.01, step: 0.01, options: [] },
      { id: 'a', label: 'A', group: 'Edificio', type: 'select', when: { id: 'b', values: ['x'] }, options: [{ value: 'x', coefficient: 0 }] },
      { id: 'b', label: 'B', group: 'Edificio', type: 'select', when: { id: 'a', values: ['x'] }, options: [{ value: 'x', coefficient: 0 }] },
    ]
  }), /ciclica/);
});

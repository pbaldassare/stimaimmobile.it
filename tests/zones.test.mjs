import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalZone, sameZone } from '../engine/zones.mjs';

test('Excel typo Cenro storico is an alias of Centro storico', () => {
  assert.equal(canonicalZone('Cenro storico'), 'Centro storico');
  assert.ok(sameZone('cenro storico', 'Centro storico'));
  assert.equal(canonicalZone('Centro storico'), 'Centro storico');
  assert.equal(canonicalZone('  Brescia  '), 'Brescia');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { addressCandidates } from '../supabase/functions/stimaimmobile-api/geocoding.mjs';

const component = (type, long_name, short_name = long_name) => ({types:[type], long_name, short_name});
test('prefers the Italian municipality over a locality and deduplicates districts', () => {
  const result = {formatted_address:'Indirizzo di esempio', address_components:[
    component('country','Italia','IT'), component('locality','Frazione'),
    component('administrative_area_level_3','Comune'), component('neighborhood','Centro'), component('sublocality','Centro')]};
  assert.deepEqual(addressCandidates([result]), [{label:'Indirizzo di esempio', comune:'Comune', districts:['Centro']}]);
});
test('rejects non-Italian or ambiguous results without guessing a municipality', () => {
  assert.deepEqual(addressCandidates([{formatted_address:'Indirizzo',address_components:[component('country','IT')]},
    {formatted_address:'Indirizzo',address_components:[component('country','CH'),component('locality','Lugano')]}]), []);
});


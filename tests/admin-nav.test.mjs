import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../admin.html', import.meta.url), 'utf8');
const js = readFileSync(new URL('../admin.js', import.meta.url), 'utf8');

test('reserved admin sidebar lists Parametri, Richieste, Dati OMI in that order', () => {
  const nav = html.match(/<nav class="sidebar"[\s\S]*?<\/nav>/);
  assert.ok(nav);
  const labels = [...nav[0].matchAll(/<button[^>]*>([^<]+)<\/button>/g)].map(match => match[1]);
  assert.deepEqual(labels, ['Parametri', 'Richieste', 'Dati OMI']);
  assert.match(html, /id="panel-parametri"/);
  assert.match(html, /id="panel-richieste"/);
  assert.match(html, /id="panel-omi"/);
  assert.match(html, /id="field-search"/);
  assert.match(html, /id="contacts"/);
  assert.match(html, /id="omi-rows"/);
  assert.match(html, /Agenzia delle Entrate – OMI/);
  assert.match(html, /id="field-save"/);
  assert.match(html, /id="filter-status"/);
  assert.doesNotMatch(html, /re-import|Reimporta|import:omi/i);
});

test('field search filters by name and OMI browse stays read-only', () => {
  assert.match(js, /fieldQuery/);
  assert.match(js, /omi\/quotes\?/);
  assert.match(js, /showPanel\('parametri'\)/);
  const omi = html.slice(html.indexOf('id="panel-omi"'), html.indexOf('id="status"'));
  assert.match(omi, /Agenzia delle Entrate – OMI/);
  assert.doesNotMatch(omi, /2018-2|semestre|il più recente in archivio/i);
  assert.doesNotMatch(html, /2016-1|2016-2|2017-1|2017-2|2018-1|2018-2|name="semester"/);
  assert.doesNotMatch(js, /form\.elements\.semester|2016-1|2018-1|2018-2|semestre|il più recente in archivio/i);
  assert.doesNotMatch(js, /omi_ingest|import:omi|publish_omi_rates/);
});

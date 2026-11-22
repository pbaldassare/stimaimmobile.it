import { apiFetch } from './api-client.js';
const el = (id) => document.getElementById(id);
const KIND = { contact: 'Contatto', coverage: 'Copertura', estimate: 'Stima' };
const STATUS = { new: 'Nuova', contacted: 'Contattata', closed: 'Chiusa' };
let token = '';
let reviewed = '';
let reviewVersion = 0;
let contacts = [];
let modelFields = [];
let editingIndex = -1;
let fieldQuery = '';
let omiOffset = 0;
let comuniLoaded = false;
const OMI_PAGE = 80;
const PANELS = ['parametri', 'richieste', 'omi'];
const CONTROL = { select: 'Tendina', yesno: 'Sì / No', count: 'Conteggio 0–N', number: 'Numero' };
const euroFormat = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

function notify(message) { el('status').textContent = message; }
function clearPreview() {
  reviewed = '';
  reviewVersion++;
  el('review').hidden = true;
  el('publish').disabled = true;
}
function signOut() {
  token = '';
  contacts = [];
  modelFields = [];
  editingIndex = -1;
  el('login').reset();
  el('load').reset();
  clearPreview();
  el('contacts').replaceChildren();
  el('issues').replaceChildren();
  el('rows').replaceChildren();
  el('field-rows').replaceChildren();
  el('field-editor').hidden = true;
  el('field-search').value = '';
  fieldQuery = '';
  el('field-count').textContent = '';
  el('omi-search').reset();
  el('omi-rows').replaceChildren();
  el('omi-summary').textContent = '';
  el('omi-more').hidden = true;
  omiOffset = 0;
  showPanel('parametri');
  el('access').hidden = false;
  el('management').hidden = true;
}
async function request(path, payload) {
  const headers = {};
  if (payload !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = 'Bearer ' + token;
  const response = await apiFetch('/api/admin/' + path, {method: payload === undefined ? 'GET' : 'POST', headers, body: payload === undefined ? undefined : JSON.stringify(payload)});
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && token) signOut();
    throw new Error(typeof data.error === 'string' ? data.error : 'Operazione non riuscita. Verifica l’accesso e riprova.');
  }
  return data;
}
function node(tag, value, className) {
  const item = document.createElement(tag);
  if (className) item.className = className;
  item.textContent = value ?? '';
  return item;
}
function option(value, label, selected) {
  const item = document.createElement('option');
  item.value = value;
  item.textContent = label;
  item.selected = Boolean(selected);
  return item;
}
function renderContacts() {
  const target = el('contacts');
  target.replaceChildren();
  const filter = el('filter-status').value;
  const rows = contacts.filter(item => !filter || item.status === filter);
  if (!rows.length) {
    target.append(node('p', contacts.length ? 'Nessuna richiesta in questo stato.' : 'Nessuna richiesta ricevuta.'));
    return;
  }
  for (const contact of rows) {
    const form = document.createElement('form');
    form.className = 'request';
    const when = new Date(contact.created_at).toLocaleString('it-IT');
    const kind = KIND[contact.kind] || 'Contatto';
    const place = [contact.comune, contact.zona, contact.destinazione].filter(Boolean).join(' · ');
    const head = document.createElement('div');
    head.className = 'request-head';
    head.append(node('span', kind, 'badge'), node('strong', contact.name || 'Senza nome'));
    form.append(head, node('p', (contact.email || '') + ' · ' + when), node('p', place), node('p', contact.message));
    const statusLabel = node('label', 'Stato');
    const status = document.createElement('select');
    status.name = 'status';
    for (const [value, label] of Object.entries(STATUS)) status.append(option(value, label, contact.status === value));
    statusLabel.append(status);
    const notesLabel = node('label', 'Note interne');
    const notes = document.createElement('textarea');
    notes.name = 'notes';
    notes.maxLength = 4000;
    notes.rows = 3;
    notes.value = contact.notes || '';
    notesLabel.append(notes);
    const save = document.createElement('button');
    save.type = 'submit';
    save.textContent = 'Salva';
    form.append(statusLabel, notesLabel, save);
    form.addEventListener('submit', async event => {
      event.preventDefault();
      save.disabled = true;
      notify('Salvataggio in corso…');
      try {
        const {contact: updated} = await request('contact', {id: contact.id, status: status.value, notes: notes.value});
        const index = contacts.findIndex(item => item.id === contact.id);
        if (index >= 0) contacts[index] = updated;
        notify('Richiesta aggiornata.');
        renderContacts();
      } catch (error) { notify(error.message); save.disabled = false; }
    });
    target.append(form);
  }
}
async function loadOmi() {
  const session = token;
  const data = await request('omi').catch(() => null);
  if (token !== session || !data) return;
  const stats = el('omi-stats');
  if (!stats) return;
  const latest = data.latest ? '. Semestre ' + data.latest : '';
  stats.textContent = 'Archivio OMI: ' + (data.zones ?? 0) + ' zone, ' + (data.quotes ?? 0) + ' quotazioni' + latest +
    '. Listino sito: ' + (data.rates ?? 0) + ' righe OMI e ' + (data.other_rates ?? 0) +
    ' righe di altra fonte. Fonte: ' + (data.fonte || 'Agenzia delle Entrate – OMI') +
    ' (' + (data.license || 'CC-BY 4.0') + '). ondata redistribuisce i CSV; il download ufficiale è Forniture OMI.';
}
async function loadContacts() {
  const session = token;
  const data = await request('contacts');
  if (token !== session) return;
  contacts = Array.isArray(data.contacts) ? data.contacts : [];
  renderContacts();
}
el('filter-status').onchange = renderContacts;
el('refresh').onclick = () => loadContacts().catch(error => notify(error.message));
el('logout').onclick = () => { signOut(); notify('Sessione chiusa su questo dispositivo.'); };
el('login').onsubmit = async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button');
  const values = new FormData(form);
  button.disabled = true;
  notify('Accesso in corso…');
  try {
    const data = await request('login', {email:values.get('email'), password:values.get('password')});
    token = data.access_token;
    form.reset();
    el('access').hidden = true;
    el('management').hidden = false;
    showPanel('parametri');
    notify('');
    await Promise.all([loadContacts(), loadOmi(), loadFields()]);
  } catch (error) { notify(error.message); }
  finally { button.disabled = false; }
};
el('load').elements.list.onchange = clearPreview;
el('load').onsubmit = async (event) => {
  event.preventDefault();
  clearPreview();
  const version = reviewVersion;
  const file = event.currentTarget.elements.list.files[0];
  if (!file) return;
  if (file.size > 1024 * 1024) return notify('Il file supera il limite di 1 MB.');
  notify('Verifica del listino in corso…');
  try {
    const csv = await file.text();
    const data = await request('preview', {csv});
    if (version !== reviewVersion) return;
    el('review').hidden = false;
    el('summary').textContent = data.total + ' quotazioni nel file. Prime ' + Math.min(data.rows.length, 30) + ' righe in anteprima.';
    el('issues').replaceChildren(...data.errors.map(error => node('li', error)));
    const rows = data.rows.slice(0,30).map(row => {
      const tr = document.createElement('tr');
      for (const key of ['comune','zona','destinazione','euro_mq','fonte','data_riferimento']) tr.append(node('td', row[key]));
      return tr;
    });
    el('rows').replaceChildren(...rows);
    if (!data.errors.length && data.total > 0) { reviewed = csv; el('publish').disabled = false; }
    notify(reviewed ? 'Il listino è pronto per la pubblicazione.' : 'Correggi il file e ripeti la verifica.');
  } catch (error) { if (version === reviewVersion) notify(error.message); }
};
function blankField() {
  return {
    id: 'campo', label: 'Nuovo campo', group: 'Edificio', type: 'select', _new: true,
    required: false, active: true, partial: false, min: null, max: null, step: null, fallback: null,
    whenFieldId: null, whenValues: [],
    options: [
      { value: 'Sì', label: 'Sì', coefficient: 0, scored: true, public: true, aliases: [] },
      { value: 'No', label: 'No', coefficient: 0, scored: true, public: true, aliases: [] }
    ]
  };
}
function uniqueId(base) {
  const used = new Set(modelFields.map(item => item.id));
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(base + n)) n++;
  return base + n;
}
function renderGroups() {
  el('field-groups').replaceChildren(...[...new Set(modelFields.map(item => item.group))].map(name => option(name, name)));
}
function points(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '0';
  const text = String(number).replace('.', ',');
  return number > 0 ? '+' + text : text;
}
function answerPreview(field) {
  const options = Array.isArray(field.options) ? field.options : [];
  if (!options.length) return '—';
  const shown = options.slice(0, 4).map(item => (item.label || item.value) + ' ' + points(item.coefficient));
  if (options.length > 4) shown.push('+' + (options.length - 4));
  return shown.join(' · ');
}
function fieldVisible(field) {
  if (!fieldQuery) return true;
  return String(field.label || '').toLocaleLowerCase('it').includes(fieldQuery);
}
function renderFields() {
  const body = el('field-rows');
  body.replaceChildren();
  const visible = modelFields.filter(fieldVisible);
  const labelCount = count => count === 1 ? '1 campo' : count + ' campi';
  el('field-count').textContent = fieldQuery
    ? labelCount(visible.length) + ' su ' + labelCount(modelFields.length)
    : labelCount(modelFields.length);
  if (!visible.length) {
    const tr = document.createElement('tr');
    const td = node('td', modelFields.length ? 'Nessun campo con questo nome.' : 'Nessun parametro in archivio.');
    td.colSpan = 7;
    tr.append(td);
    body.append(tr);
    renderGroups();
    return;
  }
  modelFields.forEach((field, index) => {
    if (!fieldVisible(field)) return;
    const tr = document.createElement('tr');
    if (index === editingIndex) tr.className = 'selected';
    const condition = field.whenFieldId ? 'se ' + field.whenFieldId : 'sempre';
    const values = [String(index + 1), field.label, field.group, CONTROL[field.type] || field.type, answerPreview(field), condition];
    values.forEach((value, cell) => {
      const td = node('td', value);
      if (cell === 4) td.className = 'answers';
      tr.append(td);
    });
    const actions = document.createElement('td');
    actions.className = 'row-actions';
    const edit = node('button', 'Modifica');
    edit.type = 'button';
    edit.className = 'outline';
    edit.onclick = () => openEditor(index);
    const up = node('button', 'Su');
    up.type = 'button';
    up.className = 'outline';
    up.disabled = index === 0 || Boolean(fieldQuery);
    up.onclick = () => { const [item] = modelFields.splice(index, 1); modelFields.splice(index - 1, 0, item); if (editingIndex === index) editingIndex = index - 1; else if (editingIndex === index - 1) editingIndex = index; renderFields(); };
    const down = node('button', 'Giù');
    down.type = 'button';
    down.className = 'outline';
    down.disabled = index === modelFields.length - 1 || Boolean(fieldQuery);
    down.onclick = () => { const [item] = modelFields.splice(index, 1); modelFields.splice(index + 1, 0, item); if (editingIndex === index) editingIndex = index + 1; else if (editingIndex === index + 1) editingIndex = index; renderFields(); };
    const remove = node('button', 'Elimina');
    remove.type = 'button';
    remove.className = 'outline danger';
    remove.onclick = () => {
      if (!confirm('Eliminare il campo «' + field.label + '» dal modello locale? Ricorda di salvare.')) return;
      modelFields.splice(index, 1);
      if (editingIndex === index) { editingIndex = -1; el('field-editor').hidden = true; }
      else if (editingIndex > index) editingIndex--;
      renderFields();
    };
    actions.append(edit, up, down, remove);
    tr.append(actions);
    body.append(tr);
  });
  renderGroups();
}
function optionRow(optionData = {}) {
  const tr = document.createElement('tr');
  const value = document.createElement('input');
  value.name = 'opt-value';
  value.required = true;
  value.maxLength = 180;
  value.value = optionData.value || '';
  const label = document.createElement('input');
  label.name = 'opt-label';
  label.maxLength = 180;
  label.value = optionData.label || optionData.value || '';
  const coefficient = document.createElement('input');
  coefficient.name = 'opt-coefficient';
  coefficient.inputMode = 'decimal';
  coefficient.value = optionData.coefficient ?? 0;
  const scored = document.createElement('input');
  scored.type = 'checkbox';
  scored.name = 'opt-scored';
  scored.checked = optionData.scored !== false;
  const visible = document.createElement('input');
  visible.type = 'checkbox';
  visible.name = 'opt-public';
  visible.checked = optionData.public !== false;
  const aliases = document.createElement('input');
  aliases.name = 'opt-aliases';
  aliases.placeholder = 'alias, separati da virgola';
  aliases.value = (optionData.aliases || []).join(', ');
  const remove = node('button', '×');
  remove.type = 'button';
  remove.className = 'outline';
  remove.onclick = () => tr.remove();
  for (const control of [value, label, coefficient, scored, visible, aliases, remove]) {
    const td = document.createElement('td');
    td.append(control);
    tr.append(td);
  }
  return tr;
}
function readOptions() {
  return [...el('option-rows').rows].map(row => {
    const value = row.querySelector('[name=opt-value]').value.trim();
    const label = row.querySelector('[name=opt-label]').value.trim() || value;
    return {
      value, label,
      coefficient: Number(String(row.querySelector('[name=opt-coefficient]').value).replace(',', '.')) || 0,
      scored: row.querySelector('[name=opt-scored]').checked,
      public: row.querySelector('[name=opt-public]').checked,
      aliases: row.querySelector('[name=opt-aliases]').value.split(',').map(item => item.trim()).filter(Boolean)
    };
  }).filter(option => option.value);
}
function fillWhenFields(selected) {
  const select = el('field-form').elements.whenFieldId;
  const current = modelFields[editingIndex];
  select.replaceChildren(option('', 'Sempre visibile', !selected));
  for (const field of modelFields) {
    if (field.id === current?.id) continue;
    select.append(option(field.id, field.label + ' (' + field.id + ')', field.id === selected));
  }
}
function openEditor(index) {
  editingIndex = index;
  const field = modelFields[index];
  const form = el('field-form');
  el('field-editor-title').textContent = 'Modifica: ' + field.label;
  form.elements.id.value = field.id;
  form.elements.id.readOnly = !field._new;
  form.label.value = field.label || '';
  form.group.value = field.group || '';
  form.type.value = field.type || 'select';
  form.required.checked = Boolean(field.required);
  form.active.checked = field.active !== false;
  form.partial.checked = Boolean(field.partial);
  form.min.value = field.min ?? '';
  form.max.value = field.max ?? '';
  form.step.value = field.step ?? '';
  form.fallback.value = field.fallback ?? '';
  form.whenValues.value = (field.whenValues || []).join('\n');
  fillWhenFields(field.whenFieldId);
  el('option-rows').replaceChildren(...(field.options || []).map(optionRow));
  el('field-editor').hidden = false;
  renderFields();
  form.label.focus();
}
function collectField() {
  const form = el('field-form');
  const min = form.min.value.trim();
  const max = form.max.value.trim();
  const step = form.step.value.trim();
  const fallback = form.fallback.value.trim();
  return {
    id: form.elements.id.value.trim(),
    label: form.label.value.trim(),
    group: form.group.value.trim(),
    type: form.type.value,
    required: form.required.checked,
    active: form.active.checked,
    partial: form.partial.checked,
    min: min === '' ? null : Number(min.replace(',', '.')),
    max: max === '' ? null : Number(max.replace(',', '.')),
    step: step === '' ? null : Number(step.replace(',', '.')),
    fallback: fallback === '' ? null : Number(fallback.replace(',', '.')),
    whenFieldId: form.whenFieldId.value || null,
    whenValues: form.whenValues.value.split(/\n/).map(item => item.trim()).filter(Boolean),
    options: readOptions(),
    _new: modelFields[editingIndex]?._new
  };
}
async function loadFields() {
  const session = token;
  const data = await request('fields');
  if (token !== session) return;
  modelFields = Array.isArray(data.fields) ? data.fields : [];
  editingIndex = -1;
  el('field-editor').hidden = true;
  renderFields();
}
el('field-add').onclick = () => {
  const field = blankField();
  field.id = uniqueId('campo');
  modelFields.push(field);
  openEditor(modelFields.length - 1);
};
el('option-add').onclick = () => el('option-rows').append(optionRow());
el('field-cancel').onclick = () => { editingIndex = -1; el('field-editor').hidden = true; renderFields(); };
el('field-form').onsubmit = event => {
  event.preventDefault();
  if (editingIndex < 0) return;
  const field = collectField();
  if (modelFields.some((item, index) => item.id === field.id && index !== editingIndex)) {
    return notify('Identificativo già usato da un altro campo.');
  }
  modelFields[editingIndex] = field;
  notify('Campo aggiornato nel modello locale. Ricorda di salvare i parametri.');
  openEditor(editingIndex);
};
el('field-form').elements.type.addEventListener('change', () => {
  if (el('field-form').elements.type.value !== 'yesno' || el('option-rows').rows.length) return;
  el('option-rows').replaceChildren(optionRow({ value: 'Sì', label: 'Sì', coefficient: 0, scored: true, public: true }),
    optionRow({ value: 'No', label: 'No', coefficient: 0, scored: true, public: true }));
});
el('field-save').onclick = async () => {
  if (!el('field-editor').hidden && editingIndex >= 0) modelFields[editingIndex] = collectField();
  el('field-save').disabled = true;
  notify('Salvataggio dei parametri in corso…');
  try {
    const data = await request('fields', { fields: modelFields.map(({_new, ...field}) => field) });
    modelFields = data.fields;
    editingIndex = -1;
    el('field-editor').hidden = true;
    renderFields();
    notify('Parametri pubblicati. Il questionario pubblico usa subito i nuovi coefficienti.');
  } catch (error) { notify(error.message); }
  finally { el('field-save').disabled = false; }
};
el('field-reset').onclick = async () => {
  if (!confirm('Ripristinare i coefficienti del foglio Excel CALCOLI? Le modifiche non salvate andranno perse.')) return;
  el('field-reset').disabled = true;
  notify('Ripristino dei coefficienti Excel…');
  try {
    const data = await request('fields/reset', {});
    modelFields = data.fields;
    editingIndex = -1;
    el('field-editor').hidden = true;
    renderFields();
    notify('Modello ripristinato dai coefficienti Excel e pubblicato.');
  } catch (error) { notify(error.message); }
  finally { el('field-reset').disabled = false; }
};
function showPanel(name) {
  for (const id of PANELS) {
    el('panel-' + id).hidden = id !== name;
    const button = el('nav-' + id);
    if (id === name) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
  if (name === 'omi') loadComuni().catch(() => {});
}
async function loadComuni() {
  if (comuniLoaded) return;
  const response = await apiFetch('/api/zones');
  const data = await response.json().catch(() => ({}));
  const names = Array.isArray(data.comuni) ? data.comuni : [];
  el('omi-comuni').replaceChildren(...names.map(name => option(name, name)));
  if (names.length) comuniLoaded = true;
}
function omiQuery(offset) {
  const form = el('omi-search');
  const params = new URLSearchParams({
    comune: form.elements.comune.value.trim(),
    zona: form.elements.zona.value.trim(),
    semester: form.elements.semester.value,
    offset: String(offset)
  });
  return 'omi/quotes?' + params.toString();
}
function renderOmiRows(rows, append) {
  const body = el('omi-rows');
  if (!append) body.replaceChildren();
  for (const row of rows) {
    const tr = document.createElement('tr');
    tr.append(node('td', row.comune), node('td', row.zona), node('td', row.tipologia));
    const price = node('td', euroFormat.format(Number(row.euro_mq)));
    price.className = 'num';
    tr.append(price);
    body.append(tr);
  }
}
async function loadOmiQuotes(offset, append) {
  const session = token;
  const data = await request(omiQuery(offset));
  if (token !== session) return;
  const rows = Array.isArray(data.rows) ? data.rows : [];
  renderOmiRows(rows, append);
  omiOffset = offset + rows.length;
  el('omi-more').hidden = !data.hasMore;
  const shown = el('omi-rows').rows.length;
  const fonte = data.fonte || 'Agenzia delle Entrate – OMI';
  const quota = shown === 1 ? '1 quotazione' : shown + ' quotazioni';
  el('omi-summary').textContent = shown
    ? quota + (data.hasMore ? ' mostrate, ce ne sono altre' : '') + '. Semestre ' + (data.semester || '') + '. Fonte: «' + fonte + '».'
    : 'Nessuna quotazione per questo comune nel semestre selezionato. Fonte: «' + fonte + '».';
}
for (const id of PANELS) el('nav-' + id).onclick = () => showPanel(id);
el('field-search').oninput = () => {
  fieldQuery = el('field-search').value.trim().toLocaleLowerCase('it');
  renderFields();
};
el('omi-search').onsubmit = async event => {
  event.preventDefault();
  const button = event.currentTarget.querySelector('button');
  button.disabled = true;
  notify('Ricerca delle quotazioni OMI…');
  try {
    await loadOmiQuotes(0, false);
    notify('');
  } catch (error) { notify(error.message); }
  finally { button.disabled = false; }
};
el('omi-more').onclick = async () => {
  el('omi-more').disabled = true;
  try {
    await loadOmiQuotes(omiOffset, true);
    notify('');
  } catch (error) { notify(error.message); }
  finally { el('omi-more').disabled = false; }
};
el('publish').onclick = async () => {
  if (!reviewed) return;
  el('publish').disabled = true;
  const version = reviewVersion;
  try {
    const {published} = await request('publish', {csv:reviewed});
    if (version !== reviewVersion) return;
    clearPreview();
    el('load').reset();
    notify('Listino pubblicato. Quotazioni attive: ' + published + '.');
  } catch (error) { if (version === reviewVersion) { notify(error.message); el('publish').disabled = !reviewed; } }
};

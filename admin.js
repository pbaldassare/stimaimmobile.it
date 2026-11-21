import { apiFetch } from './api-client.js';
const el = (id) => document.getElementById(id);
const KIND = { contact: 'Contatto', coverage: 'Copertura', estimate: 'Stima' };
const STATUS = { new: 'Nuova', contacted: 'Contattata', closed: 'Chiusa' };
let token = '';
let reviewed = '';
let reviewVersion = 0;
let contacts = [];

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
  el('login').reset();
  el('load').reset();
  clearPreview();
  el('contacts').replaceChildren();
  el('issues').replaceChildren();
  el('rows').replaceChildren();
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
    notify('');
    await loadContacts();
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

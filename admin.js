import { apiFetch } from './api-client.js';
const el = (id) => document.getElementById(id);
let token = '';
let reviewed = '';
let reviewVersion = 0;

function notify(message) { el('status').textContent = message; }
function clearPreview() {
  reviewed = '';
  reviewVersion++;
  el('review').hidden = true;
  el('publish').disabled = true;
}
function signOut() {
  token = '';
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
  const response = await apiFetch('/api/admin/' + path, {method: payload === undefined ? 'GET' : 'POST', headers, body: JSON.stringify(payload)});
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && token) signOut();
    throw new Error(typeof data.error === 'string' ? data.error : 'Operazione non riuscita. Verifica l’accesso e riprova.');
  }
  return data;
}
function node(tag, value) {
  const item = document.createElement(tag);
  item.textContent = value ?? '';
  return item;
}
async function loadContacts() {
  const session = token;
  const {contacts} = await request('contacts');
  if (token !== session) return;
  const target = el('contacts');
  target.replaceChildren();
  if (!contacts.length) target.append(node('p', 'Nessuna richiesta ricevuta.'));
  for (const contact of contacts) {
    const card = document.createElement('div');
    card.className = 'request';
    const when = new Date(contact.created_at).toLocaleString('it-IT');
    card.append(node('strong', contact.name), node('p', contact.email + ' · ' + when),
      node('p', [contact.comune, contact.zona, contact.destinazione].filter(Boolean).join(' · ')), node('p', contact.message));
    target.append(card);
  }
}
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


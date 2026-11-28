import { apiFetch } from './api-client.js';
const el = (id) => document.getElementById(id);
const KIND = { contact: 'Contatto', coverage: 'Copertura', estimate: 'Stima' };
const STATUS = { new: 'Nuova', contacted: 'Contattata', closed: 'Chiusa' };
const ORDER_STATUS = { pending: 'In attesa', paid: 'Pagato', refunded: 'Rimborsato', cancelled: 'Annullato' };
const euro = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
let token = '';
let reviewed = '';
let reviewVersion = 0;
let contacts = [];
let orders = [];
let referrers = [];
let requests = [];
let modelFields = [];
let editingIndex = -1;
let fieldQuery = '';
let omiOffset = 0;
let comuniLoaded = false;
const OMI_PAGE = 80;
const PANELS = ['dashboard', 'richieste', 'contatti', 'ordini', 'segnalatori', 'parametri', 'omi'];
const REQUEST_STATUS = { none: 'Non acquistata', pending: 'Ordine in attesa', paid: 'Pagata', refunded: 'Rimborsata', cancelled: 'Ordine annullato' };
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
  orders = [];
  el('orders').replaceChildren();
  referrers = [];
  el('referrers').replaceChildren();
  requests = [];
  el('requests').replaceChildren();
  el('dashboard-stats').replaceChildren();
  el('dashboard-cities').replaceChildren();
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
  showPanel('dashboard');
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
function renderOrders() {
  const target = el('orders');
  target.replaceChildren();
  const filter = el('filter-order').value;
  const rows = orders.filter(item => !filter || item.status === filter);
  if (!rows.length) {
    target.append(node('p', orders.length ? 'Nessun ordine in questo stato.' : 'Nessun ordine ricevuto.'));
    return;
  }
  for (const order of rows) {
    const form = document.createElement('form');
    form.className = 'request';
    const head = document.createElement('div');
    head.className = 'request-head';
    head.append(node('span', ORDER_STATUS[order.status] || order.status, 'badge'), node('strong', order.email));
    const place = [order.address, [order.comune, order.zona, order.destinazione].filter(Boolean).join(' · ')].filter(Boolean).join(' — ');
    const value = (order.result ? ' · valore ' + euro.format(order.result.value) : '') + (order.coupon ? ' · codice ' + order.coupon + ' (−' + euro.format(order.discount) + ')' : '');
    form.append(head,
      node('p', new Date(order.createdAt).toLocaleString('it-IT') + ' · ' + euro.format(order.amount) + (order.stripe ? ' · Stripe' : '') + value),
      node('p', place));
    const statusLabel = node('label', 'Stato');
    const status = document.createElement('select');
    for (const [key, label] of Object.entries(ORDER_STATUS)) status.append(option(key, label, order.status === key));
    statusLabel.append(status);
    const notesLabel = node('label', 'Note interne');
    const notes = document.createElement('textarea');
    notes.maxLength = 4000;
    notes.rows = 2;
    notes.value = order.notes || '';
    notesLabel.append(notes);
    const save = node('button', 'Salva');
    save.type = 'submit';
    form.append(statusLabel, notesLabel, save);
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (status.value === 'paid' && order.status !== 'paid' && !confirm('Segnare l’ordine come pagato? Il cliente vedrà la valutazione e riceverà la mail.')) return;
      save.disabled = true;
      notify('Salvataggio in corso…');
      try {
        const { order: updated } = await request('order', { id: order.id, status: status.value, notes: notes.value });
        orders[orders.findIndex(item => item.id === order.id)] = updated;
        notify('Ordine aggiornato.');
        renderOrders();
      } catch (error) { notify(error.message); save.disabled = false; }
    });
    target.append(form);
  }
}
async function loadOrders() {
  const session = token;
  const data = await request('orders');
  if (token !== session) return;
  orders = Array.isArray(data.orders) ? data.orders : [];
  renderOrders();
}
el('filter-order').onchange = renderOrders;
el('refresh-orders').onclick = () => loadOrders().catch(error => notify(error.message));
function input(name, value, attrs = {}) {
  const item = document.createElement('input');
  item.name = name;
  if (attrs.type === 'checkbox') item.checked = Boolean(value); else item.value = value ?? '';
  for (const [key, val] of Object.entries(attrs)) item.setAttribute(key, val);
  return item;
}
function labelled(text, control, className) {
  const label = node('label', text, className);
  label.append(control);
  return label;
}
function couponRow(referrer, coupon = {}) {
  const tr = document.createElement('tr');
  const cells = {
    code: input('code', coupon.code, { maxlength: '32', placeholder: coupon.id ? '' : 'automatico', 'aria-label': 'Codice' }),
    discount: input('discount', coupon.discount ?? '', { inputmode: 'decimal', required: '', 'aria-label': 'Sconto in euro' }),
    validUntil: input('validUntil', coupon.validUntil ? String(coupon.validUntil).slice(0, 10) : '', { type: 'date', 'aria-label': 'Scadenza' }),
    maxUses: input('maxUses', coupon.maxUses ?? '', { inputmode: 'numeric', placeholder: 'illimitati', 'aria-label': 'Utilizzi massimi' }),
    active: input('active', coupon.id ? coupon.active : true, { type: 'checkbox', 'aria-label': 'Attivo' }),
  };
  for (const key of ['code', 'discount', 'validUntil', 'maxUses']) { const td = document.createElement('td'); td.append(cells[key]); tr.append(td); }
  tr.append(node('td', coupon.id ? String(coupon.uses ?? 0) : '–', 'num'));
  const activeCell = document.createElement('td'); activeCell.append(cells.active); tr.append(activeCell);
  const save = node('button', coupon.id ? 'Salva' : 'Aggiungi');
  save.type = 'button';
  const actions = document.createElement('td'); actions.append(save); tr.append(actions);
  save.onclick = async () => {
    save.disabled = true;
    notify('Salvataggio del coupon…');
    try {
      await request('coupon', { id: coupon.id, referrerId: referrer.id, code: cells.code.value, discount: cells.discount.value,
        validUntil: cells.validUntil.value, maxUses: cells.maxUses.value, active: cells.active.checked });
      notify('Coupon salvato.');
      await loadReferrers();
    } catch (error) { notify(error.message); save.disabled = false; }
  };
  return tr;
}
function renderReferrers() {
  const target = el('referrers');
  target.replaceChildren();
  if (!referrers.length) { target.append(node('p', 'Nessun segnalatore. Creane uno con il modulo qui sopra.')); return; }
  for (const referrer of referrers) {
    const box = document.createElement('section');
    box.className = 'request';
    const head = document.createElement('div');
    head.className = 'request-head';
    head.append(node('span', referrer.active ? 'Attivo' : 'Disattivato', 'badge'), node('strong', referrer.name));
    box.append(head, node('p', referrer.email + ' · creato il ' + new Date(referrer.created_at).toLocaleDateString('it-IT')));
    const form = document.createElement('form');
    form.className = 'editor';
    const name = input('name', referrer.name, { required: '', maxlength: '120' });
    const notes = input('notes', referrer.notes, { maxlength: '4000' });
    const password = input('password', '', { minlength: '8', placeholder: 'lascia vuoto per non cambiarla', autocomplete: 'new-password' });
    const active = input('active', referrer.active, { type: 'checkbox' });
    const save = node('button', 'Salva segnalatore');
    save.type = 'submit';
    const actions = document.createElement('div');
    actions.className = 'form-actions';
    actions.append(save);
    form.append(labelled('Nome', name), labelled('Note', notes), labelled('Nuova password', password), labelled(' Attivo', active, 'check'), actions);
    form.onsubmit = async event => {
      event.preventDefault();
      save.disabled = true;
      notify('Salvataggio del segnalatore…');
      try {
        await request('referrer', { id: referrer.id, name: name.value, notes: notes.value, password: password.value, active: active.checked });
        notify(password.value ? 'Segnalatore salvato e password aggiornata.' : 'Segnalatore salvato.');
        await loadReferrers();
      } catch (error) { notify(error.message); save.disabled = false; }
    };
    const table = document.createElement('table');
    table.className = 'coupons';
    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    for (const label of ['Codice', 'Sconto €', 'Scadenza', 'Utilizzi max', 'Usato', 'Attivo', '']) headRow.append(node('th', label));
    thead.append(headRow);
    const tbody = document.createElement('tbody');
    for (const coupon of referrer.coupons || []) tbody.append(couponRow(referrer, coupon));
    tbody.append(couponRow(referrer));
    table.append(thead, tbody);
    const scroll = document.createElement('div');
    scroll.className = 'scroll';
    scroll.append(table);
    box.append(form, node('h4', 'Codici sconto'), scroll);
    target.append(box);
  }
}
async function loadReferrers() {
  const session = token;
  const data = await request('referrers');
  if (token !== session) return;
  referrers = Array.isArray(data.referrers) ? data.referrers : [];
  renderReferrers();
}
el('refresh-referrers').onclick = () => loadReferrers().catch(error => notify(error.message));
el('referrer-new').onsubmit = async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button');
  const values = Object.fromEntries(new FormData(form));
  button.disabled = true;
  notify('Creazione del segnalatore…');
  try {
    await request('referrer', values);
    form.reset();
    notify('Segnalatore creato. Comunicagli email e password: accede da /segnalatore/.');
    await loadReferrers();
  } catch (error) { notify(error.message); }
  finally { button.disabled = false; }
};
function stat(label, value) {
  const box = document.createElement('div');
  box.className = 'stat';
  box.append(node('span', label), node('strong', value));
  return box;
}
async function loadDashboard() {
  const session = token;
  const data = await request('dashboard');
  if (token !== session) return;
  const rate = data.total ? Math.round(data.purchased / data.total * 100) : 0;
  el('dashboard-stats').replaceChildren(
    stat('Richieste totali', String(data.total)),
    stat('Ultimi 30 giorni', String(data.last30)),
    stat('Acquistate', data.purchased + ' (' + rate + '%)'),
    stat('Incassato', euro.format(data.revenue)));
  const cities = Array.isArray(data.cities) ? data.cities : [];
  const max = Math.max(1, ...cities.map(city => city.n));
  if (!cities.length) { el('dashboard-cities').replaceChildren(node('p', 'Nessuna richiesta ancora.')); return; }
  el('dashboard-cities').replaceChildren(...cities.map(city => {
    const row = document.createElement('div');
    row.className = 'city-row';
    const bar = document.createElement('span');
    bar.className = 'city-bar';
    bar.style.width = Math.max(2, city.n / max * 100) + '%';
    const track = document.createElement('span');
    track.className = 'city-track';
    track.append(bar);
    row.append(node('span', city.comune || '—', 'city-name'), track, node('strong', String(city.n)));
    return row;
  }));
}
function requestState(item) { return item.orderStatus || 'none'; }
function renderRequests() {
  const target = el('requests');
  target.replaceChildren();
  const filter = el('filter-request').value;
  const query = el('search-request').value.trim().toLocaleLowerCase('it');
  const rows = requests.filter(item => (!filter || requestState(item) === filter) &&
    (!query || [item.firstName, item.lastName, item.email, item.comune].join(' ').toLocaleLowerCase('it').includes(query)));
  el('request-count').textContent = rows.length + (rows.length === 1 ? ' richiesta' : ' richieste') + (rows.length !== requests.length ? ' su ' + requests.length : '') + '.';
  if (!rows.length) { target.append(node('p', requests.length ? 'Nessuna richiesta con questi filtri.' : 'Nessuna richiesta ricevuta.')); return; }
  for (const item of rows) {
    const card = document.createElement('section');
    card.className = 'request';
    const head = document.createElement('div');
    head.className = 'request-head';
    head.append(node('span', REQUEST_STATUS[requestState(item)] || requestState(item), 'badge'), node('strong', item.firstName + ' ' + item.lastName));
    const place = [item.address, [item.comune, item.zona, item.destinazione].filter(Boolean).join(' · ')].filter(Boolean).join(' — ');
    const facts = [item.email, new Date(item.createdAt).toLocaleString('it-IT'),
      'ricontatto: ' + (item.recontact ? 'sì' : 'no')];
    const money = ['stima ' + (item.value != null ? euro.format(item.value) : '—') + (item.minimum != null ? ' (minimo ' + euro.format(item.minimum) + ')' : ''),
      item.surface ? item.surface + ' m²' : ''];
    if (item.amount != null) money.push('ordine ' + euro.format(item.amount) + (item.coupon ? ' con codice ' + item.coupon : ''));
    card.append(head, node('p', facts.join(' · ')), node('p', place), node('p', money.filter(Boolean).join(' · ')),
      node('p', 'Privacy accettata il ' + new Date(item.privacyAcceptedAt).toLocaleString('it-IT'), 'hint'));
    const details = document.createElement('details');
    details.append(node('summary', 'Risposte del questionario (' + item.answers.length + ')'));
    const list = document.createElement('dl');
    list.className = 'qa';
    for (const answer of item.answers) list.append(node('dt', answer.label), node('dd', String(answer.value)));
    details.append(list);
    card.append(details);
    target.append(card);
  }
}
async function loadRequests() {
  const session = token;
  const data = await request('requests');
  if (token !== session) return;
  requests = Array.isArray(data.requests) ? data.requests : [];
  renderRequests();
}
el('filter-request').onchange = renderRequests;
el('search-request').oninput = renderRequests;
el('refresh-requests').onclick = () => loadRequests().catch(error => notify(error.message));
el('refresh-dashboard').onclick = () => loadDashboard().catch(error => notify(error.message));
async function loadOmi() {
  const session = token;
  const data = await request('omi').catch(() => null);
  if (token !== session || !data) return;
  const stats = el('omi-stats');
  if (!stats) return;
  stats.textContent = 'Fonte: «' + (data.fonte || 'Agenzia delle Entrate – OMI') + '».';
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
    showPanel('dashboard');
    notify('');
    await Promise.all([loadDashboard(), loadRequests(), loadContacts(), loadOrders(), loadReferrers(), loadOmi(), loadFields()]);
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
    ? quota + (data.hasMore ? ' mostrate, ce ne sono altre' : '') + '. Fonte: «' + fonte + '».'
    : 'Nessuna quotazione per questo comune. Fonte: «' + fonte + '».';
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

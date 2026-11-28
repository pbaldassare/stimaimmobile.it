import { apiFetch, apiJson, getSession, setSession, clearSession } from '/api-client.js';

const box = document.querySelector('#account');
const money = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
const number = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 2 });
const date = new Intl.DateTimeFormat('it-IT', { dateStyle: 'medium', timeStyle: 'short' });
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const field = (id, label, control) => '<div class="field"><label for="' + id + '">' + esc(label) + '</label>' + control + '</div>';
const STATUS = { pending: 'In attesa di pagamento', paid: 'Pagata', refunded: 'Rimborsata', cancelled: 'Annullata' };
const justPaid = new URLSearchParams(location.search).get('ordine');
let recovering = false;

// Links from Supabase emails (confirmation, password reset) land here with the session in the hash.
const hash = new URLSearchParams(location.hash.slice(1));
if (hash.get('access_token')) {
  setSession({ access_token: hash.get('access_token'), expires_in: hash.get('expires_in'), email: '' });
  recovering = hash.get('type') === 'recovery';
  history.replaceState(null, '', location.pathname + location.search);
}

function bindForm(form, action) {
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const error = form.querySelector('.error'), button = form.querySelector('button[type="submit"]');
    error.textContent = ''; button.disabled = true;
    try { await action(Object.fromEntries(new FormData(form))); }
    catch (err) { error.textContent = err.message; button.disabled = false; }
  });
}

function loginView(mode = 'login', message = '') {
  const signup = mode === 'signup', recover = mode === 'recover';
  box.innerHTML = '<form id="auth" class="panel"><h2>' + (signup ? 'Crea il tuo account' : recover ? 'Recupera la password' : 'Accedi') + '</h2>' +
    (message ? '<p class="notice">' + esc(message) + '</p>' : '') +
    '<div class="form-grid">' + field('a-mail', 'Email', '<input id="a-mail" class="input" name="email" type="email" required maxlength="254" autocomplete="email">') +
    (recover ? '' : field('a-pass', 'Password', '<input id="a-pass" class="input" name="password" type="password" required ' + (signup ? 'minlength="8" autocomplete="new-password"' : 'autocomplete="current-password"') + '>')) +
    '</div>' + (signup ? '<label class="choice"><input type="checkbox" name="privacy" required> <span>Ho letto l’<a class="text-link" href="/privacy/" target="_blank" rel="noopener">informativa privacy</a> e acconsento al trattamento dei dati per la valutazione.</span></label>' : '') + '<p class="error" role="alert"></p><div class="form-actions"><button class="btn" type="submit">' + (signup ? 'Crea account' : recover ? 'Invia il link' : 'Accedi') + '</button></div>' +
    '<p class="muted small">' + (signup ? '<a href="#" data-mode="login">Hai già un account? Accedi</a>'
      : recover ? '<a href="#" data-mode="login">Torna all’accesso</a>'
      : '<a href="#" data-mode="signup">Non hai un account? Registrati</a> · <a href="#" data-mode="recover">Password dimenticata?</a>') + '</p></form>';
  box.querySelectorAll('[data-mode]').forEach(link => link.addEventListener('click', event => { event.preventDefault(); loginView(link.dataset.mode); }));
  bindForm(box.querySelector('#auth'), async data => {
    if (recover) { await apiJson('/api/account/recover', { email: data.email }); loginView('login', 'Se l’indirizzo è registrato, ti abbiamo inviato un link per scegliere una nuova password.'); return; }
    const session = await apiJson('/api/account/' + mode, { email: data.email, password: data.password });
    if (session.confirm) { loginView('login', 'Ti abbiamo inviato una email di conferma. Apri il link e poi accedi.'); return; }
    setSession(session);
    await ordersView();
  });
}

function newPasswordView() {
  box.innerHTML = '<form id="newpass" class="panel"><h2>Scegli una nuova password</h2><div class="form-grid">' +
    field('n-pass', 'Nuova password', '<input id="n-pass" class="input" name="password" type="password" required minlength="8" autocomplete="new-password">') +
    '</div><p class="error" role="alert"></p><div class="form-actions"><button class="btn" type="submit">Salva la password</button></div></form>';
  bindForm(box.querySelector('#newpass'), async data => {
    await apiJson('/api/account/password', data, { auth: true });
    recovering = false;
    await ordersView('Password aggiornata.');
  });
}

function orderCard(order) {
  const where = [order.address, [order.comune, order.zona, order.destinazione].filter(Boolean).join(' · ')].filter(Boolean).join(' — ');
  const head = '<p class="field-label">' + esc(date.format(new Date(order.createdAt))) + ' · ' + esc(STATUS[order.status] || order.status) + '</p><h2>' + esc(where) + '</h2>';
  if (order.status === 'paid' && order.result) {
    const r = order.result;
    return '<article class="panel">' + head +
      '<p class="field-label">' + (r.warnings?.length ? 'Valore stimato parziale' : 'Valore stimato') + '</p><p class="result-value">' + money.format(r.value) + '</p>' +
      (r.warnings?.length ? '<div class="notice"><strong>Limiti della stima</strong><ul>' + r.warnings.map(w => '<li>' + esc(w) + '</li>').join('') + '</ul></div>' : '') +
      '<dl class="metrics"><div><dt>Minimo indicativo</dt><dd>' + money.format(r.minimum) + '</dd></div><div><dt>Prezzo al m²</dt><dd>' + money.format(r.rate) + '</dd></div><div><dt>Superficie commerciale</dt><dd>' + number.format(r.surface) + ' m²</dd></div>' +
      (r.fonte ? '<div><dt>Fonte</dt><dd>' + esc(r.fonte) + '</dd></div>' : '') + '</dl>' +
      '<p class="error" role="alert"></p><div class="form-actions"><button class="btn" type="button" data-pdf="' + esc(order.id) + '"><svg class="ico" aria-hidden="true"><use href="#download"/></svg>Scarica il PDF</button></div></article>';
  }
  return '<article class="panel">' + head +
    (order.status === 'pending' ? '<p class="muted">La valutazione è pronta e si sblocca con il pagamento di ' + money.format(order.amount) + '.</p><p class="error" role="alert"></p><div class="form-actions"><button class="btn" type="button" data-pay="' + esc(order.id) + '">Completa il pagamento</button></div>' : '') +
    '</article>';
}

async function downloadPdf(button) {
  const error = button.closest('article').querySelector('.error');
  error.textContent = ''; button.disabled = true;
  try {
    const response = await apiFetch('/api/me/orders/' + button.dataset.pdf + '/pdf', { headers: { Authorization: 'Bearer ' + getSession()?.token } });
    if (!response.ok) throw new Error((await response.json().catch(() => null))?.error || 'Download non riuscito. Riprova.');
    const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(await response.blob()), download: 'Relazione-StimaImmobile.pdf' });
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 10000);
  } catch (err) { error.textContent = err.message; }
  finally { button.disabled = false; }
}

async function pay(button) {
  const error = button.closest('article').querySelector('.error');
  error.textContent = ''; button.disabled = true;
  try {
    const { checkoutUrl } = await apiJson('/api/me/orders/' + button.dataset.pay + '/checkout', {}, { auth: true });
    if (checkoutUrl) { location.href = checkoutUrl; return; }
    error.textContent = 'Il pagamento online non è ancora attivo: ti contatteremo per completare l’ordine.';
  } catch (err) { error.textContent = err.message; }
  button.disabled = false;
}

async function ordersView(message = '') {
  if (!getSession()) { loginView(); return; }
  if (recovering) { newPasswordView(); return; }
  box.innerHTML = '<p role="status">Caricamento delle valutazioni…</p>';
  let data;
  try { data = await apiJson('/api/me/orders', undefined, { auth: true }); }
  catch (err) { if (err.status === 401) { loginView('login', err.message); return; } box.innerHTML = '<p class="error" role="alert">' + esc(err.message) + '</p>'; return; }
  const paidNow = justPaid && data.orders.find(o => o.id === justPaid);
  box.innerHTML = '<div class="section-intro"><p class="muted">Accesso come <strong>' + esc(data.email) + '</strong></p><p><button class="btn secondary" type="button" id="logout">Esci</button></p></div>' +
    (message ? '<p class="notice">' + esc(message) + '</p>' : '') +
    (paidNow && paidNow.status === 'pending' ? '<p class="notice">Stiamo ricevendo la conferma del pagamento. <a href="" id="reload">Aggiorna</a> tra qualche secondo.</p>' : '') +
    (paidNow && paidNow.status === 'paid' ? '<p class="notice">Pagamento ricevuto: la tua valutazione è pronta.</p>' : '') +
    (data.orders.length ? data.orders.map(orderCard).join('') : '<article class="panel"><h2>Nessuna valutazione</h2><p class="muted">Qui troverai le valutazioni acquistate.</p><p><a class="btn" href="/#valutazione">Valuta un immobile</a></p></article>') +
    '<details class="panel"><summary>Cambia password</summary><form id="password"><div class="form-grid">' +
    field('c-pass', 'Nuova password', '<input id="c-pass" class="input" name="password" type="password" required minlength="8" autocomplete="new-password">') +
    '</div><p class="error" role="alert"></p><div class="form-actions"><button class="btn" type="submit">Aggiorna password</button></div></form></details>';
  box.querySelector('#logout').addEventListener('click', () => { clearSession(); loginView(); });
  box.querySelectorAll('[data-pdf]').forEach(button => button.addEventListener('click', () => downloadPdf(button)));
  box.querySelectorAll('[data-pay]').forEach(button => button.addEventListener('click', () => pay(button)));
  bindForm(box.querySelector('#password'), async data => { await apiJson('/api/account/password', data, { auth: true }); await ordersView('Password aggiornata.'); });
}

ordersView();

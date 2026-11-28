import { apiJson, getSession, setSession, clearSession } from '/api-client.js';

const box = document.querySelector('#referrer');
const money = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
const day = new Intl.DateTimeFormat('it-IT', { dateStyle: 'medium' });
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const field = (id, label, control) => '<div class="field"><label for="' + id + '">' + esc(label) + '</label>' + control + '</div>';
const STATUS = { pending: 'In attesa di pagamento', paid: 'Pagato', refunded: 'Rimborsato' };

function bindForm(form, action) {
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const error = form.querySelector('.error'), button = form.querySelector('button[type="submit"]');
    error.textContent = ''; button.disabled = true;
    try { await action(Object.fromEntries(new FormData(form))); }
    catch (err) { error.textContent = err.message; button.disabled = false; }
  });
}

function loginView(message = '') {
  box.innerHTML = '<form id="login" class="panel"><h2>Accedi</h2>' + (message ? '<p class="notice">' + esc(message) + '</p>' : '') +
    '<div class="form-grid">' + field('r-mail', 'Email', '<input id="r-mail" class="input" name="email" type="email" required autocomplete="username">') +
    field('r-pass', 'Password', '<input id="r-pass" class="input" name="password" type="password" required autocomplete="current-password">') +
    '</div><p class="error" role="alert"></p><div class="form-actions"><button class="btn" type="submit">Accedi</button></div>' +
    '<p class="muted small">Le credenziali te le fornisce StimaImmobile.it. Password dimenticata? <a href="/account/">Recuperala da qui</a>.</p></form>';
  bindForm(box.querySelector('#login'), async data => { setSession(await apiJson('/api/referrer/login', data)); await mainView(); });
}

async function mainView(message = '') {
  if (!getSession()) { loginView(); return; }
  box.innerHTML = '<p role="status">Caricamento…</p>';
  let data;
  try { data = await apiJson('/api/referrer/me', undefined, { auth: true }); }
  catch (err) {
    if (err.status === 401 || err.status === 403) { clearSession(); loginView(err.message); return; }
    box.innerHTML = '<p class="error" role="alert">' + esc(err.message) + '</p>'; return;
  }
  const paid = data.orders.filter(o => o.status === 'paid');
  box.innerHTML = '<div class="section-intro"><p class="muted">Ciao <strong>' + esc(data.name) + '</strong></p><p><button class="btn secondary" type="button" id="logout">Esci</button></p></div>' +
    (message ? '<p class="notice">' + esc(message) + '</p>' : '') +
    '<article class="panel"><h2>I tuoi codici</h2>' + (data.coupons.length
      ? '<div class="table-scroll"><table class="data-table"><thead><tr><th>Codice</th><th>Sconto</th><th>Scadenza</th><th>Utilizzi</th><th>Stato</th></tr></thead><tbody>' +
        data.coupons.map(c => '<tr><td><strong>' + esc(c.code) + '</strong></td><td>' + money.format(c.discount) + '</td><td>' + (c.validUntil ? esc(day.format(new Date(c.validUntil))) : 'nessuna') +
          '</td><td>' + c.uses + (c.maxUses ? ' / ' + c.maxUses : '') + '</td><td>' + (c.active ? 'Attivo' : 'Disattivato') + '</td></tr>').join('') + '</tbody></table></div>'
      : '<p class="muted">Non hai ancora codici sconto.</p>') + '</article>' +
    '<article class="panel"><h2>Chi ha usato i tuoi codici</h2><p class="muted">' + paid.length + ' ordini pagati · ' + money.format(paid.reduce((sum, o) => sum + o.amount, 0)) + ' incassati</p>' +
    (data.orders.length
      ? '<div class="table-scroll"><table class="data-table"><thead><tr><th>Data</th><th>Codice</th><th>Cliente</th><th>Importo</th><th>Stato</th></tr></thead><tbody>' +
        data.orders.map(o => '<tr><td>' + esc(day.format(new Date(o.createdAt))) + '</td><td>' + esc(o.code) + '</td><td>' + esc(o.email) + '</td><td>' + money.format(o.amount) + '</td><td>' + esc(STATUS[o.status] || o.status) + '</td></tr>').join('') + '</tbody></table></div>'
      : '<p class="muted">Nessun utilizzo per ora.</p>') + '</article>' +
    '<details class="panel"><summary>Cambia password</summary><form id="password"><div class="form-grid">' +
    field('c-pass', 'Nuova password', '<input id="c-pass" class="input" name="password" type="password" required minlength="8" autocomplete="new-password">') +
    '</div><p class="error" role="alert"></p><div class="form-actions"><button class="btn" type="submit">Aggiorna password</button></div></form></details>';
  box.querySelector('#logout').addEventListener('click', () => { clearSession(); loginView(); });
  bindForm(box.querySelector('#password'), async form => { await apiJson('/api/account/password', form, { auth: true }); await mainView('Password aggiornata.'); });
}

mainView();

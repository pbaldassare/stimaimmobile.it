const endpoint = 'https://dukuozoqinycdetxqsvr.supabase.co/functions/v1/stimaimmobile-api/';
export function publicUrl(path) {
  if (typeof path !== 'string') throw new Error('Percorso API mancante.');
  const url = new URL(path.replace(/^\/api\//, ''), endpoint);
  if (!url.href.startsWith(endpoint)) throw new Error('Percorso API non valido.');
  return url.href;
}
export function apiFetch(path, options = {}) {
  return fetch(publicUrl(path), { ...options, credentials: 'omit', referrerPolicy: 'no-referrer' });
}

// Customer session, shared by the questionnaire and /account/ in the same tab.
// shortcut: access token only (≈1h), no refresh token; add refresh if customers complain about re-login.
const SESSION_KEY = 'stimaimmobile.session';
export function getSession() {
  try {
    const session = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
    return session && session.token && session.expiresAt > Date.now() ? session : null;
  } catch { return null; }
}
export function setSession({ access_token, expires_in, email }) {
  const session = { token: access_token, email, expiresAt: Date.now() + (Number(expires_in) || 3600) * 1000 - 60000 };
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch {}
  return session;
}
export function clearSession() {
  try { sessionStorage.removeItem(SESSION_KEY); } catch {}
}
export async function apiJson(path, body, { auth = false, method } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const session = auth ? getSession() : null;
  if (session) headers.Authorization = 'Bearer ' + session.token;
  const response = await apiFetch(path, { method: method || (body === undefined ? 'GET' : 'POST'), headers,
    body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json().catch(() => null);
  if (response.status === 401 && auth) clearSession();
  if (!response.ok || !data) {
    const error = new Error(typeof data?.error === 'string' ? data.error : 'Il servizio è temporaneamente indisponibile. Riprova tra poco.');
    error.status = response.status;
    throw error;
  }
  return data;
}

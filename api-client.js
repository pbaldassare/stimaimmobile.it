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

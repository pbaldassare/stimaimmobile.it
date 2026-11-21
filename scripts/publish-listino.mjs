import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { previewCatalog } from '../supabase/functions/stimaimmobile-api/catalog.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const csvPath = path.resolve(process.argv[2] || path.join(root, 'data/listino-esempio-excel.csv'));
const endpoint = 'https://dukuozoqinycdetxqsvr.supabase.co/functions/v1/stimaimmobile-api/';
const email = process.env.STIMAIMMOBILE_ADMIN_EMAIL;
const password = process.env.STIMAIMMOBILE_ADMIN_PASSWORD;

if (!email || !password) {
  console.error('Imposta STIMAIMMOBILE_ADMIN_EMAIL e STIMAIMMOBILE_ADMIN_PASSWORD, poi esegui:');
  console.error('  npm run publish:listino');
  process.exit(1);
}

const csv = await readFile(csvPath, 'utf8');
const preview = previewCatalog(csv);
if (preview.errors.length) {
  console.error(preview.errors.join('\n'));
  process.exit(1);
}

async function post(path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const response = await fetch(new URL(path, endpoint), { method: 'POST', headers, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof data.error === 'string' ? data.error : 'Pubblicazione non riuscita (' + response.status + ').');
  }
  return data;
}

const session = await post('admin/login', { email, password });
const { published } = await post('admin/publish', { csv }, session.access_token);
console.log('Listino pubblicato da ' + csvPath + '. Quotazioni attive: ' + published + '.');

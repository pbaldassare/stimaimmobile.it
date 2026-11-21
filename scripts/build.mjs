import { cp, mkdir, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const destination = path.join(root, 'dist');
await mkdir(destination, { recursive: true });
for (const name of ['index.html', 'style.css', 'app.js', 'api-client.js', 'nav.js', 'admin.html', 'admin.css', 'admin.js', 'assets', 'faq', 'blog']) {
  await cp(path.join(root, name), path.join(destination, name), { recursive: true });
}
await copyFile(path.join(root, 'data/modello-listino.csv'), path.join(destination, 'modello-listino.csv'));
await copyFile(path.join(root, 'data/listino-esempio-excel.csv'), path.join(destination, 'listino-esempio-excel.csv'));
console.log('Sito statico pronto in dist/');


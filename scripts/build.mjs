import { cp, mkdir, copyFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { calculate, questions, ENGINE_VERSION } from '../engine/valuation.mjs';
import { makePdf } from '../engine/pdf.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const destination = path.join(root, 'dist');
await mkdir(destination, { recursive: true });
for (const name of ['index.html', 'style.css', 'app.js', 'api-client.js', 'nav.js', 'admin.html', 'admin.css', 'admin.js', 'assets', 'faq', 'blog', 'account', 'privacy']) {
  await cp(path.join(root, name), path.join(destination, name), { recursive: true });
}
await copyFile(path.join(root, 'data/modello-listino.csv'), path.join(destination, 'modello-listino.csv'));
await copyFile(path.join(root, 'data/listino-esempio-excel.csv'), path.join(destination, 'listino-esempio-excel.csv'));

// Public sample report: the Excel example (Brescia, 65 m², 1450 €/m²), clearly marked as a demo.
const inputs = { surface: 65, floor: 'rialzato', year: 1900 };
await writeFile(path.join(destination, 'assets/esempio-relazione.pdf'), await makePdf({
  inputs, result: calculate(inputs, 1450), address: 'ESEMPIO DIMOSTRATIVO – dati non reali',
  comune: 'Brescia', zona: 'Centro storico', destinazione: 'Direzionale',
  fonte: 'esempio Excel CALCOLI B80', data_riferimento: '2014-04-04', questions,
  createdAt: '2026-11-28T09:00:00.000Z', engineVersion: ENGINE_VERSION,
}));
console.log('Sito statico pronto in dist/');

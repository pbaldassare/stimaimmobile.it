import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  OMI_BASE, OMI_FILES, parseOmiQuotes, parseOmiZones, quoteTuple, zoneTuple
} from '../engine/omi.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = new Map();
for (let i = 2; i < process.argv.length; i++) {
  const token = process.argv[i];
  if (token.startsWith('--')) args.set(token.slice(2), process.argv[i + 1]?.startsWith('--') ? 'true' : (process.argv[++i] ?? 'true'));
}

const cacheDir = path.resolve(args.get('dir') || path.join(root, 'data/omi'));
const batchBytes = Number(args.get('batch-bytes') || 1_200_000);
const downloadOnly = args.has('download-only');

async function exists(file) {
  try { await access(file); return true; } catch { return false; }
}

async function download(name) {
  const target = path.join(cacheDir, name);
  if (await exists(target) && !args.has('force')) return target;
  const url = OMI_BASE + name;
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) throw new Error('Download OMI non riuscito: ' + url + ' (' + response.status + ')');
  await writeFile(target, Buffer.from(await response.arrayBuffer()));
  return target;
}

function batches(rows, tuple) {
  const out = [];
  let current = [], size = 2;
  for (const row of rows) {
    const item = tuple(row);
    const extra = Buffer.byteLength(JSON.stringify(item)) + 1;
    if (current.length && size + extra > batchBytes) {
      out.push(current);
      current = [];
      size = 2;
    }
    current.push(item);
    size += extra;
  }
  if (current.length) out.push(current);
  return out;
}

await mkdir(cacheDir, { recursive: true });
const zoneRows = [];
const quoteRows = [];
for (const name of OMI_FILES) {
  process.stderr.write('OMI ' + name + '\n');
  const file = await download(name);
  if (downloadOnly) continue;
  const csv = await readFile(file, 'utf8');
  const parsed = name.includes('_ZONE_') ? parseOmiZones(csv, name) : parseOmiQuotes(csv, name);
  const target = name.includes('_ZONE_') ? zoneRows : quoteRows;
  for (const row of parsed) target.push(row);
}

if (downloadOnly) {
  console.log(JSON.stringify({ downloaded: OMI_FILES.length, dir: cacheDir }));
  process.exit(0);
}

const payload = {
  zones: zoneRows.length,
  quotes: quoteRows.length,
  semesters: [...new Set([...zoneRows, ...quoteRows].map(row => row.semester))].sort(),
  zoneBatches: batches(zoneRows, zoneTuple),
  quoteBatches: batches(quoteRows, quoteTuple)
};

if (args.has('emit-json')) {
  const target = path.resolve(args.get('emit-json'));
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, JSON.stringify({
    zones: payload.zones,
    quotes: payload.quotes,
    semesters: payload.semesters,
    zoneBatches: payload.zoneBatches.length,
    quoteBatches: payload.quoteBatches.length
  }));
}

const batchDir = args.get('batch-dir');
if (batchDir) {
  const dest = path.resolve(batchDir);
  await mkdir(dest, { recursive: true });
  let index = 0;
  for (const batch of payload.zoneBatches) {
    await writeFile(path.join(dest, `zones-${String(++index).padStart(3, '0')}.json`), JSON.stringify(batch));
  }
  const zoneCount = index;
  for (const batch of payload.quoteBatches) {
    await writeFile(path.join(dest, `quotes-${String(++index).padStart(3, '0')}.json`), JSON.stringify(batch));
  }
  console.log(JSON.stringify({
    zones: payload.zones,
    quotes: payload.quotes,
    semesters: payload.semesters,
    zoneBatches: zoneCount,
    quoteBatches: index - zoneCount,
    dir: dest
  }));
} else {
  console.log(JSON.stringify({
    zones: payload.zones,
    quotes: payload.quotes,
    semesters: payload.semesters,
    zoneBatches: payload.zoneBatches.length,
    quoteBatches: payload.quoteBatches.length
  }));
}

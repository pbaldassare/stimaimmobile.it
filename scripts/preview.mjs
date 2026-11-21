import http from 'node:http';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../dist/', import.meta.url));
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.css':'text/css', '.csv':'text/csv; charset=utf-8', '.svg':'image/svg+xml', '.jpg':'image/jpeg', '.webp':'image/webp', '.png':'image/png', '.woff2':'font/woff2' };
const port = Number(process.env.PORT || 4186);
const server = http.createServer(async (req, res) => {
  try {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const candidate = path.resolve(root, '.' + (urlPath === '/' ? '/index.html' : urlPath));
    if (path.relative(root, candidate).startsWith('..')) throw new Error();
    const body = await readFile(candidate);
    res.writeHead(200, {'Content-Type': types[path.extname(candidate)] || 'application/octet-stream'});
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
server.listen(port, '127.0.0.1', () => console.log('http://127.0.0.1:' + port));


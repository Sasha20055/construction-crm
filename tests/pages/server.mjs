// Static host with a repository prefix and real 404s; deliberately no SPA fallback.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
const root = resolve('frontend/dist');
const prefix = '/construction-crm/';
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
};
createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (!pathname.startsWith(prefix)) {
      res.writeHead(404).end();
      return;
    }
    const file = resolve(root, pathname.slice(prefix.length) || 'index.html');
    if (!file.startsWith(root + sep)) {
      res.writeHead(404).end();
      return;
    }
    const data = await readFile(file);
    res
      .writeHead(200, {
        'content-type': types[extname(file)] ?? 'application/octet-stream',
        'cache-control': 'no-store',
      })
      .end(data);
  } catch {
    res.writeHead(404).end();
  }
}).listen(4173, '127.0.0.1');

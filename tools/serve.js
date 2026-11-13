/* Kleine lokale server om de app te testen (service workers werken op localhost).
   Draaien: node tools/serve.js [poort]   daarna open http://localhost:8080 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.json': 'application/json' };
const port = Number(process.argv[2]) || 8080;
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.normalize(path.join(root, p));
  if (!file.startsWith(root) || /[\\/](tools|node_modules|\.git)[\\/]/.test(file) || file.endsWith('tests.js')) { res.writeHead(404); return res.end('niet gevonden'); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('niet gevonden'); }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}).listen(port, () => console.log('http://localhost:' + port));

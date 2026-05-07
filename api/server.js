// Tiny counter service for finished-games tally.
// GET  /count → { count: N }
// POST /count → increments + returns { count: N }
// Persists to a JSON file on a docker volume so rebuilds don't lose the tally.

import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const FILE = process.env.COUNTER_FILE || '/data/count.json';
mkdirSync(dirname(FILE), { recursive: true });

let count = 0;
if (existsSync(FILE)) {
  try { count = JSON.parse(readFileSync(FILE, 'utf8')).count ?? 0; } catch { /* corrupt → reset */ }
}

function save() {
  writeFileSync(FILE, JSON.stringify({ count }));
}

const server = createServer((req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json');

  if (req.url === '/count' && req.method === 'GET') {
    res.writeHead(200);
    res.end(JSON.stringify({ count }));
    return;
  }
  if (req.url === '/count' && req.method === 'POST') {
    count++;
    save();
    res.writeHead(200);
    res.end(JSON.stringify({ count }));
    return;
  }
  res.writeHead(404);
  res.end(JSON.stringify({ error: 'not found' }));
});

const PORT = Number(process.env.PORT || 80);
server.listen(PORT, () => console.log(`counter api listening on :${PORT}, file=${FILE}, count=${count}`));

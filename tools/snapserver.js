// dev-only: receives canvas dataURL snapshots from the page for visual verification
const http = require('http');
const fs = require('fs');
const path = require('path');

const OUT = process.argv[2] || '/tmp';

http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') { res.end(); return; }
  if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; }
  const name = (new URL(req.url, 'http://x').searchParams.get('name') || 'snap')
    .replace(/[^a-z0-9_-]/gi, '');
  let body = '';
  req.on('data', d => (body += d));
  req.on('end', () => {
    const b64 = body.replace(/^data:image\/\w+;base64,/, '');
    const file = path.join(OUT, name + '.jpg');
    fs.writeFileSync(file, Buffer.from(b64, 'base64'));
    res.end('saved ' + file);
  });
}).listen(4174, () => console.log('snapserver on 4174 ->', OUT));

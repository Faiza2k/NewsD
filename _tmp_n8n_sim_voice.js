const https = require('https');
const http = require('http');

const KEY = process.env.WAHA_API_KEY || '';
const MEDIA =
  'http://waha:3000/api/files/default/false_193277873631353@lid_AC611BF43C8A437041EBC5F8E89F54DF.oga';

function request(url, { method = 'GET', headers = {}, body } = {}, redirects = 0) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        method,
        headers,
      },
      (res) => {
        if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location && redirects < 5) {
          const next = new URL(res.headers.location, url).toString();
          res.resume();
          resolve(request(next, { method, headers, body }, redirects + 1));
          return;
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () =>
          resolve({ status: res.statusCode, buf: Buffer.concat(chunks), headers: res.headers }),
        );
      },
    );
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

(async () => {
  const dl = await request(MEDIA, { headers: KEY ? { 'X-Api-Key': KEY } : {} });
  console.log('downloaded', dl.status, dl.buf.length);
  const payload = Buffer.from(
    JSON.stringify({
      audioBase64: dl.buf.toString('base64'),
      mimeType: 'audio/ogg',
      filename: 'voice.ogg',
    }),
  );
  const tr = await request('https://news-d.vercel.app/api/transcribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': payload.length },
    body: payload,
  });
  const trJson = JSON.parse(tr.buf.toString('utf8'));
  console.log('transcribe', tr.status, trJson);
  const q = trJson.text;
  const qBody = Buffer.from(JSON.stringify({ q, limit: 2 }));
  const ans = await request('https://news-d.vercel.app/api/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': qBody.length },
    body: qBody,
  });
  const ansJson = JSON.parse(ans.buf.toString('utf8'));
  console.log('query', ans.status);
  console.log(ansJson.whatsappText);
})().catch((e) => {
  console.error('FAIL', e);
  process.exit(1);
});

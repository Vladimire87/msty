const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const ROOT = process.cwd();

function log(...args) { console.log(new Date().toISOString(), ...args); }

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(body);
}

function sendJSON(res, status, obj) {
  send(res, status, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8' });
}

function notFound(res) { send(res, 404, 'Not Found', { 'Content-Type': 'text/plain; charset=utf-8' }); }

function guessType(fp) {
  const ext = path.extname(fp).toLowerCase();
  switch (ext) {
    case '.html': return 'text/html; charset=utf-8';
    case '.js': return 'application/javascript; charset=utf-8';
    case '.css': return 'text/css; charset=utf-8';
    case '.json': return 'application/json; charset=utf-8';
    case '.svg': return 'image/svg+xml';
    case '.png': return 'image/png';
    case '.jpg': case '.jpeg': return 'image/jpeg';
    case '.gif': return 'image/gif';
    default: return 'text/plain; charset=utf-8';
  }
}

function serveStatic(req, res, url) {
  let p = url.pathname;
  if (p === '/') p = '/index.html';
  // prevent path traversal
  const filePath = path.join(ROOT, p.replace(/^\/+/, ''));
  if (!filePath.startsWith(ROOT)) return notFound(res);
  fs.readFile(filePath, (err, data) => {
    if (err) return notFound(res);
    send(res, 200, data, { 'Content-Type': guessType(filePath), 'Cache-Control': 'no-cache' });
  });
}

function fetchWithTimeout(url, { timeout = 7000, as = 'text' } = {}) {
  return new Promise((resolve, reject) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeout);
    (global.fetch ? global.fetch(url, { signal: ctrl.signal }) : nodeFetch(url, ctrl.signal))
      .then(async (res) => {
        clearTimeout(t);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        resolve(as === 'json' ? res.json() : res.text());
      })
      .catch((e) => { clearTimeout(t); reject(e); });
  });
}

// Fallback fetch via https if global.fetch is unavailable
function nodeFetch(urlString, signal) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlString);
    const lib = url.protocol === 'http:' ? http : https;
    const req = lib.request(url, { method: 'GET' }, (res) => {
      const chunks = [];
      res.on('data', (d) => chunks.push(d));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, text: async () => body, json: async () => JSON.parse(body) });
      });
    });
    req.on('error', reject);
    if (signal) signal.addEventListener('abort', () => { try { req.destroy(new Error('Abort')); } catch {} });
    req.end();
  });
}

async function priceFromYahoo(symbol) {
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbol)}`;
  const data = await fetchWithTimeout(url, { timeout: 7000, as: 'json' });
  const q = data && data.quoteResponse && data.quoteResponse.result && data.quoteResponse.result[0];
  if (!q) throw new Error('Yahoo: no result');
  const price = Number(q.regularMarketPrice ?? q.postMarketPrice ?? q.preMarketPrice);
  const ts = Number(q.regularMarketTime ?? q.postMarketTime ?? q.preMarketTime ?? Math.floor(Date.now()/1000));
  if (!isFinite(price)) throw new Error('Yahoo: bad price');
  return { price, ts, source: 'Yahoo' };
}

function parseStooqCsvSingle(csv) {
  const lines = (csv || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const start = lines.findIndex(l => /^symbol\s*,\s*date\s*,\s*time/i.test(l));
  if (start === -1 || start + 1 >= lines.length) throw new Error('Stooq: header not found');
  const header = lines[start].split(',');
  const row = lines[start + 1].split(',');
  const idxClose = header.findIndex(h => /close/i.test(h));
  const idxOpen  = header.findIndex(h => /open/i.test(h));
  const idxDate  = header.findIndex(h => /^date$/i.test(h) || /d2/i.test(h));
  const idxTime  = header.findIndex(h => /^time$/i.test(h) || /t2/i.test(h));
  let priceStr = (idxClose >= 0 ? row[idxClose] : '') || '';
  if (/^N\/?D$/i.test(priceStr) && idxOpen >= 0) priceStr = row[idxOpen] || '';
  const price = parseFloat(priceStr);
  const day = (idxDate >= 0 ? row[idxDate] : '') || '';
  const tm  = (idxTime >= 0 ? row[idxTime] : '') || '';
  if (!isFinite(price)) throw new Error('Stooq: bad price');
  const ts = day ? (Date.parse(day + (tm ? 'T' + tm : '')) / 1000) : Math.floor(Date.now()/1000);
  return { price, ts };
}

async function priceFromStooq(symbol) {
  const url = `https://stooq.com/q/l/?s=${encodeURIComponent(symbol.toLowerCase())}.us&f=sd2t2ohlcv&h&e=csv`;
  const csv = await fetchWithTimeout(url, { timeout: 7000, as: 'text' });
  const { price, ts } = parseStooqCsvSingle(csv);
  return { price, ts, source: 'Stooq' };
}

async function historyFromYahoo(symbol, range = '30d') {
  // Map to Yahoo ranges/intervals
  const map = { '7d': ['7d', '1d'], '30d': ['1mo', '1d'], '90d': ['3mo', '1d'], '180d': ['6mo', '1d'], '1y': ['1y', '1d'] };
  const [yrange, interval] = map[range] || ['1mo', '1d'];
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${yrange}&interval=${interval}`;
  const data = await fetchWithTimeout(url, { timeout: 8000, as: 'json' });
  const r = data && data.chart && data.chart.result && data.chart.result[0];
  if (!r) throw new Error('Yahoo: no result');
  const ts = Array.isArray(r.timestamp) ? r.timestamp : [];
  const quote = r.indicators && r.indicators.quote && r.indicators.quote[0] || {};
  const closes = Array.isArray(quote.close) ? quote.close : [];
  const labels = []; const prices = [];
  for (let i = 0; i < ts.length; i++) {
    const t = ts[i]; const c = closes[i]; const num = Number(c);
    if (!isFinite(t) || !isFinite(num)) continue;
    labels.push(new Date(t * 1000).toISOString().slice(0, 10));
    prices.push(num);
  }
  if (!labels.length) throw new Error('Yahoo: empty series');
  return { labels, prices, source: 'Yahoo' };
}

function parseStooqHistoryCsv(csv) {
  const lines = (csv || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  let start = lines.findIndex(l => /^date\s*,\s*open\s*,\s*high\s*,\s*low\s*,\s*close\s*,\s*volume/i.test(l));
  if (start !== -1) start += 1; else start = lines.findIndex(l => /^\d{4}-\d{2}-\d{2}\s*,/.test(l));
  if (start === -1) throw new Error('Stooq: header not found');
  const labels = []; const prices = [];
  for (let i = start; i < lines.length; i++) {
    const parts = lines[i].split(',');
    if (parts.length < 5) continue;
    const date = parts[0]; const close = parseFloat(parts[4]);
    if (date && isFinite(close)) { labels.push(date); prices.push(close); }
  }
  if (!labels.length) throw new Error('Stooq: empty series');
  return { labels, prices };
}

async function historyFromStooq(symbol, range = '30d') {
  const c = /^\d+/.test(range) ? range.match(/\d+/)[0] : '30';
  const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(symbol)}.US&i=d&c=${c}`;
  const csv = await fetchWithTimeout(url, { timeout: 8000, as: 'text' });
  const { labels, prices } = parseStooqHistoryCsv(csv);
  return { labels, prices, source: 'Stooq' };
}

async function handleApiPrice(req, res, url) {
  const symbol = (url.searchParams.get('symbol') || 'MSTY').toUpperCase();
  const errors = [];
  for (const fn of [priceFromYahoo, priceFromStooq]) {
    try { const out = await fn(symbol); return sendJSON(res, 200, out); }
    catch (e) { errors.push(e.message); }
  }
  sendJSON(res, 502, { error: 'All sources failed', details: errors });
}

async function handleApiHistory(req, res, url) {
  const symbol = (url.searchParams.get('symbol') || 'MSTY').toUpperCase();
  const range = (url.searchParams.get('range') || '30d');
  const errors = [];
  for (const fn of [historyFromYahoo, historyFromStooq]) {
    try { const out = await fn(symbol, range); return sendJSON(res, 200, out); }
    catch (e) { errors.push(e.message); }
  }
  sendJSON(res, 502, { error: 'All sources failed', details: errors });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'OPTIONS') return send(res, 204, '');

    if (url.pathname === '/api/price') return handleApiPrice(req, res, url);
    if (url.pathname === '/api/history') return handleApiHistory(req, res, url);

    return serveStatic(req, res, url);
  } catch (e) {
    log('Server error:', e);
    send(res, 500, 'Internal Server Error', { 'Content-Type': 'text/plain; charset=utf-8' });
  }
});

server.listen(PORT, () => {
  log(`Server running at http://localhost:${PORT}`);
});


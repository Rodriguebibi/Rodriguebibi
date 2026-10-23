'use strict';
/* Console Lorick — bibliothèque serveur partagée (base Redis, sécurité, sessions). */
const crypto = require('crypto');

const TZ = 'Africa/Porto-Novo';
const SESSION_DAYS = 7;
const COOKIE = '__Host-lk_s';

/* ---------- Base de données (Upstash Redis, API REST) ---------- */
function dbConf() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ''), token } : null;
}

async function pipe(cmds) {
  const c = dbConf();
  if (!c) { const e = new Error('NO_DB'); e.code = 'NO_DB'; throw e; }
  if (!cmds.length) return [];
  const r = await fetch(c.url + '/pipeline', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + c.token, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmds)
  });
  if (!r.ok) throw new Error('DB ' + r.status);
  const out = await r.json();
  return out.map(x => (x && x.error ? null : x ? x.result : null));
}

function hashObj(arr) {
  const o = {};
  if (Array.isArray(arr)) for (let i = 0; i + 1 < arr.length; i += 2) o[arr[i]] = arr[i + 1];
  else if (arr && typeof arr === 'object') return arr;
  return o;
}

/* ---------- Dates (heure du Bénin) ---------- */
const fmtDay = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
function dayKey(ts) { return fmtDay.format(new Date(ts || Date.now())); }
function lastDays(n, offset) {
  const out = [];
  for (let i = n - 1 + (offset || 0); i >= (offset || 0); i--) out.push(dayKey(Date.now() - i * 86400000));
  return out;
}

/* ---------- Requête ---------- */
function clientIp(req) {
  const xf = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return (xf || req.headers['x-real-ip'] || (req.socket && req.socket.remoteAddress) || '0.0.0.0').slice(0, 64);
}
function geo(req) {
  let city = '';
  try { city = decodeURIComponent(req.headers['x-vercel-ip-city'] || ''); } catch (_) {}
  return { cc: String(req.headers['x-vercel-ip-country'] || '').slice(0, 2).toUpperCase(), city: city.slice(0, 60) };
}
async function readBody(req, max) {
  if (req.body !== undefined && req.body !== null && req.body !== '') {
    if (typeof req.body === 'string') return req.body.slice(0, max);
    if (Buffer.isBuffer(req.body)) return req.body.toString('utf8', 0, max);
    return req.body;
  }
  return await new Promise(resolve => {
    let data = ''; let done = false;
    req.on('data', ch => { if (done) return; data += ch; if (data.length > max) { done = true; resolve(null); } });
    req.on('end', () => { if (!done) resolve(data); });
    req.on('error', () => resolve(null));
  });
}
function parseForm(raw) {
  if (raw && typeof raw === 'object') return raw;
  const s = String(raw || '');
  if (s.trim().startsWith('{')) { try { return JSON.parse(s); } catch (_) { return {}; } }
  const o = {}; new URLSearchParams(s).forEach((v, k) => { o[k] = v; }); return o;
}

/* ---------- Mot de passe (scrypt) ---------- */
function verifyPassword(pw) {
  const stored = process.env.ADMIN_PASS_HASH || '';
  const parts = stored.split('$'); // scrypt$N$sel$empreinte
  if (parts.length !== 4 || parts[0] !== 'scrypt') {
    crypto.scryptSync('x', 'y', 64, { N: 16384 }); // temps constant même mal configuré
    return false;
  }
  const N = parseInt(parts[1], 10);
  const salt = Buffer.from(parts[2], 'base64');
  const want = Buffer.from(parts[3], 'base64');
  const got = crypto.scryptSync(String(pw).normalize('NFC'), salt, want.length, { N, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

/* ---------- Sessions signées ---------- */
function b64u(buf) { return Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_'); }
function sign(payload) {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error('NO_SECRET');
  const body = b64u(JSON.stringify(payload));
  const mac = b64u(crypto.createHmac('sha256', secret).update(body).digest());
  return body + '.' + mac;
}
function unsign(tok) {
  const secret = process.env.SESSION_SECRET;
  if (!secret || !tok || tok.indexOf('.') < 0) return null;
  const [body, mac] = tok.split('.');
  const want = b64u(crypto.createHmac('sha256', secret).update(body).digest());
  const a = Buffer.from(mac || ''), b = Buffer.from(want);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    if (!p.exp || p.exp < Date.now()) return null;
    return p;
  } catch (_) { return null; }
}
function cookies(req) {
  const o = {};
  String(req.headers.cookie || '').split(';').forEach(p => {
    const i = p.indexOf('='); if (i > 0) o[p.slice(0, i).trim()] = p.slice(i + 1).trim();
  });
  return o;
}
/* Vérifie la session ET sa génération (permet « déconnecter tous les appareils »). */
async function session(req) {
  const p = unsign(cookies(req)[COOKIE]);
  if (!p) return null;
  try {
    const [gen] = await pipe([['GET', 'auth:gen']]);
    if (String(gen || '0') !== String(p.g)) return null;
  } catch (_) { return null; }
  return p;
}
function sessionCookie(token) {
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_DAYS * 86400}`;
}
function clearCookie() { return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`; }

function sameOrigin(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const o = req.headers.origin;
  if (!o) return false;
  try { return new URL(o).host === host; } catch (_) { return false; }
}

function json(res, code, obj, extra) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  if (extra) Object.keys(extra).forEach(k => res.setHeader(k, extra[k]));
  res.end(JSON.stringify(obj));
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

module.exports = {
  TZ, SESSION_DAYS, pipe, dbConf, hashObj, dayKey, lastDays, clientIp, geo, readBody, parseForm,
  verifyPassword, sign, session, sessionCookie, clearCookie, sameOrigin, json, sleep
};

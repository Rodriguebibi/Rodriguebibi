'use strict';
/* Connexion protégée : blocage progressif par adresse IP, verrou global anti-attaque,
   piège à robots, délai constant et journal de sécurité. */
const L = require('./_lib');

const MAX_TRIES = 5;                 // essais avant blocage
const BASE_LOCK = 15 * 60;           // 1er blocage : 15 min, puis doublé à chaque nouvel échec
const MAX_LOCK = 24 * 3600;          // plafond : 24 h
const GLOBAL_LIMIT = 60;             // échecs/heure toutes IP confondues avant verrou général
const GLOBAL_LOCK = 30 * 60;

module.exports = async (req, res) => {
  const t0 = Date.now();
  if (req.method !== 'POST') return L.json(res, 405, { ok: false });
  if (!L.sameOrigin(req)) return L.json(res, 403, { ok: false, msg: 'Requête refusée.' });
  if (!L.dbConf()) return L.json(res, 503, { ok: false, msg: 'Base de données non connectée. Termine l’étape « Storage » dans Vercel.' });

  const ip = L.clientIp(req);
  const g = L.geo(req);
  const ua = String(req.headers['user-agent'] || '').slice(0, 160);
  const now = Date.now();
  const log = ok => ['LPUSH', 'sec:log', JSON.stringify({ t: now, ok, ip, cc: g.cc, city: g.city, ua })];

  // Déjà bloqué ?
  const [lockTtl, globalTtl] = await L.pipe([['TTL', 'lock:' + ip], ['TTL', 'lock:global']]);
  if (lockTtl > 0 || globalTtl > 0) {
    const wait = Math.max(lockTtl || 0, globalTtl || 0);
    await L.pipe([log('blocked'), ['LTRIM', 'sec:log', 0, 199]]);
    await pad(t0);
    return L.json(res, 429, { ok: false, locked: wait, msg: 'Trop de tentatives. Accès bloqué pendant ' + human(wait) + '.' });
  }

  const raw = await L.readBody(req, 2048);
  const f = L.parseForm(raw);
  const pw = typeof f.password === 'string' ? f.password.slice(0, 200) : '';
  const trap = typeof f.website === 'string' && f.website.length > 0; // champ invisible : seuls les robots le remplissent

  let ok = false;
  if (!trap && pw) { try { ok = L.verifyPassword(pw); } catch (_) { ok = false; } }

  if (ok) {
    const [gen] = await L.pipe([
      ['GET', 'auth:gen'], ['DEL', 'fails:' + ip], log('ok'), ['LTRIM', 'sec:log', 0, 199]
    ]);
    const token = L.sign({ g: String(gen || '0'), exp: now + L.SESSION_DAYS * 86400000, iat: now });
    await pad(t0);
    return L.json(res, 200, { ok: true }, { 'Set-Cookie': L.sessionCookie(token) });
  }

  // Échec : on compte, on bloque si besoin.
  const r = await L.pipe([
    ['INCR', 'fails:' + ip], ['EXPIRE', 'fails:' + ip, 86400],
    ['INCR', 'fails:global'],
    log(trap ? 'bot' : 'fail'), ['LTRIM', 'sec:log', 0, 199]
  ]);
  const n = trap ? MAX_TRIES : r[0];
  const cmds = [];
  let locked = 0;
  if (n >= MAX_TRIES) {
    locked = Math.min(MAX_LOCK, BASE_LOCK * Math.pow(2, n - MAX_TRIES));
    cmds.push(['SET', 'lock:' + ip, '1', 'EX', locked]);
  }
  if (r[2] === 1) cmds.push(['EXPIRE', 'fails:global', 3600]);
  if (r[2] >= GLOBAL_LIMIT) cmds.push(['SET', 'lock:global', '1', 'EX', GLOBAL_LOCK, 'NX']);
  if (cmds.length) await L.pipe(cmds);

  await pad(t0, 900);
  if (locked) return L.json(res, 429, { ok: false, locked, msg: 'Trop de tentatives. Accès bloqué pendant ' + human(locked) + '.' });
  const left = MAX_TRIES - n;
  return L.json(res, 401, { ok: false, msg: 'Mot de passe incorrect. ' + left + ' essai' + (left > 1 ? 's' : '') + ' restant' + (left > 1 ? 's' : '') + ' avant blocage.' });
};

// Durée minimale constante (+ hasard) : rend les attaques lentes et ne révèle rien par le temps de réponse.
async function pad(t0, min) {
  const target = (min || 700) + Math.floor(Math.random() * 300);
  const left = target - (Date.now() - t0);
  if (left > 0) await L.sleep(left);
}
function human(s) {
  if (s >= 3600) { const h = Math.round(s / 3600); return h + ' h'; }
  const m = Math.ceil(s / 60); return m + ' min';
}

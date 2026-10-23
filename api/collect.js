'use strict';
/* Lorick Innovation — collecte des statistiques de visite.
   Reçoit les signaux du traceur de la page et les range dans la base du back-office.
   Aucune donnée personnelle : identifiants aléatoires, pas d'IP conservée. */

const TZ = 'Africa/Porto-Novo';
const KEEP = 400 * 86400;                         // les compteurs du jour sont gardés ~13 mois
const ALLOWED = /^(www\.)?lorick-innovation\.com$|^lorick-innovation[a-z0-9-]*\.vercel\.app$/;
const BOTS = /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|facebookexternalhit|whatsapp\/|telegram|discord|curl|wget|python|axios|node-fetch|go-http/i;
const SECTIONS = new Set(['accueil', 'probleme', 'partenaire', 'psychologie', 'leviers', 'comparatif', 'methode', 'projets',
  'resultats', 'avis', 'apropos', 'services', 'secteurs', 'process', 'faq', 'final']);
const fmtDay = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const fmtHour = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' });

async function pipe(cmds) {
  const url = (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '').replace(/\/$/, '');
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const r = await fetch(url + '/pipeline', {
    method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(cmds)
  });
  if (!r.ok) return null;
  return (await r.json()).map(x => (x && !x.error ? x.result : null));
}

const id = v => (typeof v === 'string' && /^[a-zA-Z0-9]{8,32}$/.test(v) ? v : null);
const str = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
const sec = v => (typeof v === 'string' && SECTIONS.has(v) ? v : null);

function source(ref, utm) {
  const u = (utm || '').toLowerCase();
  if (u) {
    if (/google/.test(u)) return 'Google'; if (/face|fb|meta/.test(u)) return 'Facebook'; if (/insta|ig/.test(u)) return 'Instagram';
    if (/whats|wa/.test(u)) return 'WhatsApp'; if (/tiktok/.test(u)) return 'TikTok'; if (/linkedin/.test(u)) return 'LinkedIn';
    if (/youtube|yt/.test(u)) return 'YouTube'; if (/mail|newsletter/.test(u)) return 'E-mail';
    return u.charAt(0).toUpperCase() + u.slice(1, 20);
  }
  let h = '';
  try { h = new URL(ref).hostname.replace(/^www\./, ''); } catch (_) { return 'Direct'; }
  if (!h || ALLOWED.test(h) || ALLOWED.test('www.' + h)) return 'Direct';
  if (/(^|\.)google\./.test(h)) return 'Google';
  if (/bing\.com|duckduckgo|yahoo|qwant|ecosia|yandex|brave/.test(h)) return 'Autres moteurs';
  if (/facebook\.com|fb\.com|fb\.me/.test(h)) return 'Facebook';
  if (/instagram\.com/.test(h)) return 'Instagram';
  if (/whatsapp|wa\.me/.test(h)) return 'WhatsApp';
  if (/tiktok/.test(h)) return 'TikTok';
  if (/linkedin|lnkd\.in/.test(h)) return 'LinkedIn';
  if (/youtube|youtu\.be/.test(h)) return 'YouTube';
  if (/t\.co$|twitter|x\.com/.test(h)) return 'X (Twitter)';
  if (/chatgpt|openai|perplexity|claude\.ai|gemini|copilot/.test(h)) return 'Assistants IA';
  return 'Autres sites';
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const done = () => { res.statusCode = 204; res.end(); };
  if (req.method !== 'POST') { res.statusCode = 405; return res.end(); }

  // Uniquement depuis ton site.
  let okOrigin = false;
  try { okOrigin = ALLOWED.test(new URL(req.headers.origin || req.headers.referer || '').hostname); } catch (_) {}
  const ua = String(req.headers['user-agent'] || '');
  if (!okOrigin || BOTS.test(ua)) return done();

  let b = req.body;
  if (Buffer.isBuffer(b)) b = b.toString('utf8');
  if (typeof b === 'string') { if (b.length > 4096) return done(); try { b = JSON.parse(b); } catch (_) { return done(); } }
  if (!b || typeof b !== 'object') return done();

  const sid = id(b.s);
  if (!sid) return done();
  const now = Date.now();

  // Limite anti-abus : 40 signaux par minute et par connexion.
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'x';
  const rl = await pipe([['INCR', 'rl:' + ip + ':' + Math.floor(now / 60000)], ['EXPIRE', 'rl:' + ip + ':' + Math.floor(now / 60000), 90]]);
  if (!rl) return done();
  if (rl[0] > 40) return done();

  try {
    if (b.e === 'v') await view(b, sid, req, now);
    else if (b.e === 't') await time(b, sid, now);
    else if (b.e === 'c') await contact(b, sid, now);
  } catch (_) { /* une statistique perdue ne doit jamais gêner le visiteur */ }
  return done();
};

async function view(b, sid, req, now) {
  const vid = id(b.u);
  if (!vid) return;
  const d = fmtDay.format(now), h = String(Number(fmtHour.format(now)));
  const w = Number(b.w) || 0;
  const dev = w && w < 768 ? 'Mobile' : w && w < 1100 ? 'Tablette' : 'Ordinateur';
  const src = source(str(b.r, 300), str(b.m, 40));
  let refHost = '';
  try { refHost = new URL(str(b.r, 300)).hostname.replace(/^www\./, '').slice(0, 60); } catch (_) {}
  const cc = String(req.headers['x-vercel-ip-country'] || '').slice(0, 2).toUpperCase() || '??';
  let city = '';
  try { city = decodeURIComponent(req.headers['x-vercel-ip-city'] || '').slice(0, 50); } catch (_) {}
  const path = str(b.p, 80) || '/';

  const [exists] = await pipe([['EXISTS', 's:' + sid]]);
  if (exists) return; // déjà comptée (rechargement de la même visite)

  const k = x => x + ':' + d;
  const cmds = [
    ['HSET', 's:' + sid, 'd', d, 'src', src, 'cc', cc, 'dev', dev, 't', String(now), 'dur', '0'],
    ['EXPIRE', 's:' + sid, 3 * 86400],
    ['INCR', k('v')], ['PFADD', k('u'), vid],
    ['HINCRBY', k('src'), src, 1], ['HINCRBY', k('dev'), dev, 1], ['HINCRBY', k('cty'), cc, 1],
    ['HINCRBY', k('hr'), h, 1], ['HINCRBY', k('nv'), b.n ? 'Nouveaux' : 'Récurrents', 1],
    ['ZADD', 'live', String(now), sid],
    ['LPUSH', 'recent', JSON.stringify({ sid, t: now, cc, city, src, dev, p: path, n: !!b.n })], ['LTRIM', 'recent', 0, 49]
  ];
  if (refHost && src !== 'Direct') cmds.push(['HINCRBY', k('ref'), refHost, 1]);
  ['v', 'u', 'src', 'dev', 'cty', 'hr', 'nv', 'ref'].forEach(x => cmds.push(['EXPIRE', k(x), KEEP]));
  await pipe(cmds);
}

async function time(b, sid, now) {
  const reached = Array.isArray(b.r) ? b.r.map(sec).filter(Boolean).slice(0, 16) : [];
  const first = [['HGET', 's:' + sid, 'd']].concat(reached.map(x => ['HSETNX', 's:' + sid, 'r_' + x, '1']));
  const r1 = await pipe(first);
  const d = r1 && r1[0];
  if (!d) return; // visite inconnue : on ignore (protège contre les faux signaux)

  const k = x => x + ':' + d;
  const cmds = [['ZADD', 'live', String(now), sid]];
  let total = 0;
  const times = b.t && typeof b.t === 'object' ? b.t : {};
  Object.keys(times).slice(0, 16).forEach(key => {
    const s = sec(key); const n = Math.min(60, Math.max(0, Math.round(Number(times[key]) || 0)));
    if (s && n) { cmds.push(['HINCRBY', k('sec'), s, n]); total += n; }
  });
  total = Math.min(total, 60);
  if (total) cmds.push(['HINCRBY', k('st'), sid, total], ['HINCRBY', 's:' + sid, 'dur', total]);
  reached.forEach((x, i) => { if (r1[i + 1] === 1) cmds.push(['HINCRBY', k('reach'), x, 1]); });
  const sc = Math.min(100, Math.max(0, Math.round(Number(b.sc) || 0)));
  if (sc) cmds.push(['HSET', k('scr'), sid, sc]);
  const ls = sec(b.ls);
  if (ls) cmds.push(['HSET', 's:' + sid, 'ls', ls]);
  ['sec', 'st', 'reach', 'scr'].forEach(x => cmds.push(['EXPIRE', k(x), KEEP]));
  await pipe(cmds);
}

async function contact(b, sid, now) {
  const r1 = await pipe([['HMGET', 's:' + sid, 'd', 'src', 'cc', 'dev']]);
  const v = (r1 && r1[0]) || [];
  if (!v[0]) return;
  const d = v[0];
  const where = sec(b.z) || 'autre';
  const k = x => x + ':' + d;
  const [isNew] = await pipe([['HSETNX', k('cs'), sid, '1']]);
  const cmds = [
    ['INCR', k('c')], ['HINCRBY', k('csec'), where, 1], ['HSET', 's:' + sid, 'c', '1'],
    ['LPUSH', 'recentc', JSON.stringify({ sid, t: now, src: v[1], cc: v[2], dev: v[3], z: where })], ['LTRIM', 'recentc', 0, 29]
  ];
  if (isNew === 1) cmds.push(['HINCRBY', k('csrc'), v[1] || 'Direct', 1]);
  ['c', 'cs', 'csec', 'csrc'].forEach(x => cmds.push(['EXPIRE', k(x), KEEP]));
  await pipe(cmds);
}

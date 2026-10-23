'use strict';
/* Statistiques agrégées pour le tableau de bord (session obligatoire). */
const L = require('./_lib');

const DAY_KEYS = ['v', 'src', 'dev', 'cty', 'hr', 'nv', 'ref', 'st', 'sec', 'reach', 'scr', 'c', 'cs', 'csec', 'csrc'];
const HASHES = new Set(['src', 'dev', 'cty', 'hr', 'nv', 'ref', 'st', 'sec', 'reach', 'scr', 'cs', 'csec', 'csrc']);

module.exports = async (req, res) => {
  if (req.method !== 'GET') return L.json(res, 405, {});
  if (!L.dbConf()) return L.json(res, 503, { error: 'NO_DB' });
  const s = await L.session(req);
  if (!s) return L.json(res, 401, { error: 'AUTH' });

  const q = new URL(req.url, 'http://x').searchParams;
  const n = Math.min(365, Math.max(1, parseInt(q.get('days') || '7', 10) || 7));
  const cur = L.lastDays(n, 0);
  const prev = L.lastDays(n, n);
  const now = Date.now();

  const cmds = [];
  const plan = [];
  function day(d, tag) {
    // Période précédente : seulement ce qu'il faut pour les comparaisons (économise la base).
    (tag === 'cur' ? DAY_KEYS : ['v', 'st', 'cs']).forEach(k => {
      cmds.push([HASHES.has(k) ? 'HGETALL' : 'GET', k + ':' + d]);
      plan.push([tag, d, k]);
    });
  }
  cur.forEach(d => day(d, 'cur'));
  prev.forEach(d => day(d, 'prev'));
  const base = cmds.length;
  cmds.push(['PFCOUNT', ...cur.map(d => 'u:' + d)]);
  cmds.push(['PFCOUNT', ...prev.map(d => 'u:' + d)]);
  cmds.push(['ZREMRANGEBYSCORE', 'live', '-inf', String(now - 120000)]);
  cmds.push(['ZCARD', 'live']);
  cmds.push(['LRANGE', 'recent', 0, 24]);
  cmds.push(['LRANGE', 'recentc', 0, 14]);
  cmds.push(['LRANGE', 'sec:log', 0, 29]);
  cmds.push(['TTL', 'lock:global']);

  let r;
  try { r = await L.pipe(cmds); } catch (e) { return L.json(res, 500, { error: 'DB' }); }

  const raw = { cur: {}, prev: {} };
  plan.forEach(([tag, d, k], i) => {
    raw[tag][d] = raw[tag][d] || {};
    raw[tag][d][k] = HASHES.has(k) ? L.hashObj(r[i]) : Number(r[i] || 0);
  });

  const recent = (r[base + 4] || []).map(safeJson).filter(Boolean);
  const recentC = (r[base + 5] || []).map(safeJson).filter(Boolean);
  // Enrichit les dernières visites avec leur durée et un éventuel contact.
  if (recent.length) {
    const ex = await L.pipe(recent.map(x => ['HMGET', 's:' + x.sid, 'dur', 'c', 'ls']));
    recent.forEach((x, i) => { const v = ex[i] || []; x.dur = Number(v[0] || 0); x.c = v[1] === '1'; x.ls = v[2] || ''; delete x.sid; });
  }
  recentC.forEach(x => { delete x.sid; });

  const out = {
    days: n,
    generatedAt: now,
    series: cur.map(d => ({
      d,
      v: raw.cur[d].v,
      c: Object.keys(raw.cur[d].cs).length,
      t: sumVals(raw.cur[d].st)
    })),
    cur: aggregate(cur.map(d => raw.cur[d]), r[base]),
    prev: aggregate(prev.map(d => raw.prev[d]), r[base + 1]),
    live: Number(r[base + 3] || 0),
    recent,
    recentContacts: recentC,
    security: (r[base + 6] || []).map(safeJson).filter(Boolean),
    globalLock: Math.max(0, Number(r[base + 7] || 0))
  };
  return L.json(res, 200, out);
};

function aggregate(days, uniques) {
  days = days.map(x => { const o = Object.assign({}, x); DAY_KEYS.forEach(k => { if (o[k] === undefined) o[k] = HASHES.has(k) ? {} : 0; }); return o; });
  const a = { views: 0, uniques: Number(uniques || 0), contacts: 0, clicks: 0, src: {}, dev: {}, cty: {}, hr: {}, nv: {}, ref: {},
    sec: {}, reach: {}, csec: {}, csrc: {}, durations: [], scrolls: [], timeTotal: 0, sessionsTimed: 0 };
  days.forEach(x => {
    a.views += x.v; a.clicks += x.c;
    a.contacts += Object.keys(x.cs).length;
    ['src', 'dev', 'cty', 'hr', 'nv', 'ref', 'sec', 'reach', 'csec', 'csrc'].forEach(k => add(a[k], x[k]));
    Object.values(x.st).forEach(v => { const n = Number(v) || 0; a.durations.push(n); a.timeTotal += n; a.sessionsTimed++; });
    Object.values(x.scr).forEach(v => a.scrolls.push(Number(v) || 0));
  });
  // Répartition des durées (pour l'histogramme), sans renvoyer chaque valeur.
  const buckets = [[0, 10], [10, 30], [30, 60], [60, 180], [180, 600], [600, 1e9]];
  a.durBuckets = buckets.map(([lo, hi]) => a.durations.filter(v => v >= lo && v < hi).length);
  // Les visites sans aucun temps mesuré (fermées en < 1 s) comptent dans la première tranche.
  a.durBuckets[0] += Math.max(0, a.views - a.durations.length);
  a.avgTime = a.views ? Math.round(a.timeTotal / a.views) : 0;
  a.engaged = a.durations.filter(v => v >= 30).length;
  a.bounce = a.views ? Math.max(0, a.views - a.durations.filter(v => v >= 10).length) : 0;
  a.scroll50 = a.scrolls.filter(v => v >= 50).length;
  a.scroll90 = a.scrolls.filter(v => v >= 90).length;
  a.avgScroll = a.scrolls.length ? Math.round(a.scrolls.reduce((s, v) => s + v, 0) / a.scrolls.length) : 0;
  delete a.durations; delete a.scrolls;
  return a;
}
function add(t, o) { Object.keys(o || {}).forEach(k => { t[k] = (t[k] || 0) + (Number(o[k]) || 0); }); }
function sumVals(o) { return Object.values(o || {}).reduce((s, v) => s + (Number(v) || 0), 0); }
function safeJson(s) { try { return JSON.parse(s); } catch (_) { return null; } }

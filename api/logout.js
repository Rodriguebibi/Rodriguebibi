'use strict';
const L = require('./_lib');

module.exports = async (req, res) => {
  if (req.method !== 'POST' || !L.sameOrigin(req)) return L.json(res, 403, { ok: false });
  const s = await L.session(req);
  const raw = await L.readBody(req, 512);
  const f = L.parseForm(raw);
  if (s && (f.all === '1' || f.all === true)) {
    // Invalide toutes les sessions ouvertes, sur tous les appareils.
    try { await L.pipe([['INCR', 'auth:gen']]); } catch (_) {}
  }
  return L.json(res, 200, { ok: true }, { 'Set-Cookie': L.clearCookie() });
};

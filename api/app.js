'use strict';
/* Sert le tableau de bord uniquement aux sessions valides ; sinon renvoie vers la connexion. */
const L = require('./_lib');
const PAGE = require('./_dashboard');  // { html, csp } généré par build.js

module.exports = async (req, res) => {
  const s = await L.session(req);
  res.setHeader('Cache-Control', 'no-store');
  if (!s) {
    res.statusCode = 302;
    res.setHeader('Location', '/login');
    return res.end();
  }
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Security-Policy', PAGE.csp);
  res.end(PAGE.html);
};

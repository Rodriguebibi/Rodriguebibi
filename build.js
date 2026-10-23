// Génère api/_dashboard.js (page servie seulement après connexion) avec sa politique de sécurité.
const fs = require('fs'), crypto = require('crypto');
const html = fs.readFileSync(__dirname + '/src/dashboard.html', 'utf8');
const im = html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1];
const hash = crypto.createHash('sha256').update(im, 'utf8').digest('base64');
const csp = ["default-src 'self'", `script-src 'self' 'sha256-${hash}'`, "style-src 'self' 'unsafe-inline'", "img-src 'self' data:",
  "font-src 'self'", "connect-src 'self'", "frame-ancestors 'none'", "base-uri 'none'", "form-action 'self'", "object-src 'none'"].join('; ');
fs.writeFileSync(__dirname + '/api/_dashboard.js', '// Fichier généré par build.js — ne pas modifier.\nmodule.exports = ' + JSON.stringify({ html, csp }) + ';\n');
console.log('ok', html.length, csp);

# Console Lorick

Back-office privé des statistiques de lorick-innovation.com.

- `api/` : connexion protégée (blocage progressif), statistiques, déconnexion.
- `assets/` : interface, scènes 3D (Three.js), polices.
- `src/dashboard.html` : page du tableau de bord → `node build.js` génère `api/_dashboard.js`.
- `src/tracker.js` : traceur inséré dans la page du site (version minifiée dans `tracker.min.js`).

Variables d'environnement : `ADMIN_PASS_HASH`, `SESSION_SECRET`, et la base Upstash Redis
(`KV_REST_API_URL` / `KV_REST_API_TOKEN`), partagée avec le projet `lorick-innovation`.

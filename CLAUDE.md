# Écho — notes pour Claude

Jeu : un réseau social façon X où le joueur est le seul humain ; tous les autres comptes sont des personnages joués par une IA (Google Gemini). Interface et contenu en **français**. Le joueur l'utilise surtout **sur téléphone**, installé en PWA plein écran.

## Architecture
- **100 % statique, sans build, sans dépendances** : tout le jeu est dans `docs/` (vanilla JS en modules ES, servi tel quel). Ne pas ajouter de bundler/framework sans demande explicite.
- `docs/js/app.js` : interface, routage par hash (`#/home`, `#/post/:id`, `#/u/:handle`, `#/messages/:id`, `#/explore`, `#/notifications`, `#/settings`). Rendu par `innerHTML` ; `render()` préserve la saisie des champs `[data-key]`, le focus et le défilement. Les clics passent par une délégation globale (`data-act`, `data-go`, `data-follow`…).
- `docs/js/game.js` : déroulé de la partie. File d'attente IA (une génération à la fois), actions du joueur, fil automatique (seulement quand l'onglet est visible ; ralenti après une erreur). Notifie l'UI via `onChange`.
- `docs/js/ai.js` : prompts et appels REST à Gemini (`generateContent`, header `x-goog-api-key`), sortie JSON via `responseJsonSchema`, `thinkingConfig.thinkingLevel: "low"`, repli automatique entre modèles sur 429/5xx/404. Mode mature → `safetySettings` à `BLOCK_NONE`. Sans clé → `mock.js` (mode démo).
- `docs/js/engine.js` : règles pures. `buildWorld`, `applyActions` (l'IA renvoie des **actions** JSON : posts avec `reply_to`/`quote_of` = id existant ou `"new:N"`, likes, reposts, follows_user, storylines, trends), résumés textuels pour les prompts.
- `docs/js/store.js` : persistance `localStorage` (`echo.world.v1`, `echo.config.v1` qui contient la clé API et le modèle).
- PWA : `docs/manifest.webmanifest` (display fullscreen), `docs/sw.js` (réseau d'abord, cache en secours ; **incrémenter `CACHE` quand on ajoute/renomme des fichiers du shell**), `docs/icons/`.
- `serve.js` : mini serveur local (`npm start`, port 3000, accessible en Wi-Fi).

## Règles
- **Ne jamais committer de clé API** : la clé Gemini est saisie dans l'appli et reste dans le navigateur. Vérifier `git grep` avant de pousser si une clé a circulé.
- Chemins relatifs (`./…`) partout : le site est servi sous un sous-chemin (`/Social/` sur GitHub Pages).
- Mobile d'abord : tester en émulation téléphone (Playwright `devices['Pixel 7']`), pas de débordement horizontal, zones sûres (`env(safe-area-inset-*)`), inputs ≥ 16px.
- Contenu mature : personnages fictifs, pas de contenu sexuel impliquant des mineurs, pas de ciblage de personnes réelles privées (règles inscrites dans le prompt `rules()` de `ai.js`).

## Déploiement
- GitHub Pages : *Deploy from a branch* → `main` → `/docs`. Netlify : `netlify.toml` (publie `docs/`). Chaque push sur `main` met le site à jour.
- Développement sur une branche de travail, puis push sur `main` pour publier.

## Tester
- `npm start` puis ouvrir http://localhost:3000 (mode démo sans clé).
- Test réel : saisir une clé Gemini dans l'écran d'accueil ou ⚙️ Paramètres. Modèle par défaut `gemini-3.5-flash`.

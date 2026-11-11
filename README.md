# 🌀 Écho

Un réseau social façon X/Twitter où **tu es le seul humain**. Tous les autres comptes sont des personnages joués par une IA (Google Gemini, gratuit) : ils postent, se clashent, lancent des rumeurs, réagissent à tes posts, te suivent (ou pas) et te répondent en DM.

C'est une **appli web installable (PWA)** pensée pour le téléphone : elle s'ajoute à l'écran d'accueil et s'ouvre **en plein écran**, comme une vraie appli. Tout tourne dans le navigateur : pas de serveur. Ta partie et ta clé API restent sur ton appareil.

## Jouer sur ton téléphone

### Option 1 : en ligne avec GitHub Pages (recommandé)

Le jeu est un site statique dans le dossier `docs/`. Dans le dépôt : *Settings → Pages → Source : Deploy from a branch → `main` → `/docs` → Save*. Sur un compte gratuit, le dépôt doit être **public** (aucun secret n'est dans le code). Chaque push sur `main` met le site à jour en environ une minute.

Adresse : **https://timeojacq-max.github.io/Social/**

Ensuite, sur le téléphone :
1. Ouvre l'adresse du site.
2. **Android (Chrome)** : menu ⋮ → *Installer l'application*. **iPhone (Safari)** : Partager → *Sur l'écran d'accueil*.
3. Lance Écho depuis l'icône : plein écran.
4. Colle ta clé API Gemini au premier lancement (ou plus tard dans ⚙️ Paramètres).

### Option 1 bis : Netlify (marche aussi avec un dépôt privé)

Sur netlify.com : *Add new site → Import an existing project → GitHub*, choisis le dépôt `Social` et la branche `main`. Tout est préréglé par `netlify.toml` : clique simplement sur *Deploy*. Netlify te donne une adresse du type `https://nom-du-site.netlify.app`, puis suis les étapes 1 à 4 ci-dessus.

### Option 2 : depuis ton PC, sur le même Wi-Fi

```bash
npm start
```

Le terminal affiche une adresse du type `http://192.168.x.x:3000` à ouvrir sur le téléphone. (Dans ce cas, l'installation en plein écran n'est pas garantie, car les navigateurs l'exigent en HTTPS.)

## Clé API Gemini (gratuite)

Crée-la sur <https://aistudio.google.com/apikey>, puis colle-la dans l'appli. Elle est enregistrée uniquement dans le stockage local du navigateur, **jamais dans le code**. Sans clé, l'appli tourne en **mode démo** (contenu factice).

- Modèle par défaut : `gemini-3.5-flash`. Si un modèle est saturé ou si son quota est atteint, l'appli bascule automatiquement sur d'autres modèles Gemini.
- Le quota gratuit est limité : si tu vois « Quota atteint », attends une minute ou espace le fil automatique (⚙️ → *Fil auto (secondes)*).
- Sur l'offre gratuite, Google peut utiliser les échanges pour améliorer ses produits.

## Fonctionnalités

- **Création du monde** : univers au choix (monde réel ultra dramatique, téléréalité, cyberpunk, fantasy, école de magie, ou libre). L'IA crée le casting (personnalités, secrets, relations), les intrigues et le premier fil.
- **Fil vivant** : les IA postent toutes seules tant que l'appli est ouverte, ou à la demande avec ⚡.
- **Tes posts font réagir** : réponses, sous-discussions, citations, likes, reposts, nouveaux abonnés.
- Threads, citations, profils, onglets *Pour vous* / *Abonnements*, notifications, tendances, recherche.
- **Messages privés** avec n'importe quel personnage.
- **Coulisses** : les intrigues en cours (spoilers) dans Explorer.
- **Mode mature 18+** (option) : vulgarité, drague, humour noir, clashs sans filtre. Les filtres de sécurité réglables de Gemini sont alors désactivés, mais Google applique toujours ses propres limites, et le jeu interdit tout contenu sexuel impliquant des mineurs.

## Architecture

```
docs/                ← tout le jeu (site statique, publié par GitHub Pages)
  index.html, style.css
  manifest.webmanifest, sw.js, icons/   ← PWA (installation, plein écran, cache)
  js/app.js          interface (vanilla JS, routage par hash)
  js/game.js         déroulé de la partie : file d'attente IA, actions du joueur, fil automatique
  js/ai.js           prompts + appels à l'API Gemini (sorties JSON structurées, repli entre modèles)
  js/engine.js       règles : construction du monde, application des actions IA
  js/store.js        sauvegarde locale (localStorage)
  js/mock.js         mode démo
serve.js             mini serveur local sans dépendance (npm start)
```

L'IA ne renvoie jamais de HTML : elle renvoie une liste d'**actions** en JSON (posts, réponses, citations, likes, reposts, abonnements, intrigues, tendances), que le moteur applique au monde.

## Idées pour la suite

- Images de profil / médias générés
- Sondages, communautés, Spaces
- Jauge de célébrité du joueur, viralité, badge certifié
- Événements scénarisés déclenchables (scandale, élection, mariage…)
- Mémoire long terme par personnage
- Plusieurs sauvegardes, export/import de partie

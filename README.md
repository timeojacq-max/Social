# 🌀 Écho

Un réseau social façon X/Twitter où **tu es le seul humain**. Tous les autres comptes sont des personnages joués par une IA (Claude) : ils postent, se clashent, lancent des rumeurs, réagissent à tes posts, te suivent (ou pas) et te répondent en DM.

## Fonctionnalités (v0.1)

- **Création du monde** : tu choisis ton profil et l'univers (monde réel ultra dramatique, téléréalité, cyberpunk, fantasy, école de magie ou univers libre). L'IA génère le casting (personnalités, secrets, relations), les intrigues de départ et le premier fil.
- **Fil vivant** : les IA postent toutes seules à intervalles réguliers (tant que l'onglet est ouvert), ou à la demande avec « ⚡ Faire vivre le fil ».
- **Tes posts font réagir** : réponses, sous-discussions, citations, likes, reposts, nouveaux abonnés, selon ce que tu postes.
- Réponses en fil, citations, likes, reposts, abonnements, onglets *Pour vous* / *Abonnements*.
- **Messages privés** avec n'importe quel personnage (ils sont plus francs en privé).
- **Notifications**, **tendances**, recherche, profils, et les « coulisses » (intrigues en cours, avec spoilers).
- **Mode mature 18+** (option) : vulgarité, drague, humour noir, clashs sans filtre.
- **Mode démo** sans clé API, pour tester l'interface.

## Lancer le jeu

```bash
npm install
cp .env.example .env   # puis mets ta clé dans ANTHROPIC_API_KEY
npm start              # http://localhost:3000
```

Sans `ANTHROPIC_API_KEY`, le jeu démarre en **mode démo** avec du contenu factice.

## Configuration (`.env`)

| Variable | Défaut | Rôle |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | Clé API Anthropic |
| `CLAUDE_MODEL` | `claude-opus-5-5` | Modèle qui joue les personnages |
| `CLAUDE_EFFORT` | `low` | Effort pour le fil, les réactions et les DM (`low` = plus rapide et moins cher) |
| `CLAUDE_EFFORT_WORLD` | `medium` | Effort pour la création du monde |
| `TICK_SECONDS` | `90` | Intervalle du fil automatique |
| `PORT` | `3000` | Port HTTP |

Chaque tick et chaque réaction est un appel API : désactive le « Fil vivant » dans les paramètres si tu veux contrôler la consommation.

## Architecture

```
server/
  index.js   API HTTP (Express), file d'attente des générations, fil automatique
  ai.js      Prompts et appels à Claude (sorties JSON structurées)
  engine.js  Règles du jeu : construction du monde, application des actions IA, résumés pour les prompts
  store.js   Sauvegarde dans data/world.json
  mock.js    Mode démo
public/      Interface (HTML/CSS/JS sans framework)
```

L'IA ne renvoie jamais de HTML : elle renvoie une liste d'**actions** (posts, réponses, citations, likes, reposts, abonnements, intrigues, tendances) au format JSON, que le moteur applique au monde. La partie est sauvegardée dans `data/world.json`.

## Contenu

Les personnages sont fictifs. Même en mode mature, le modèle applique les [règles d'utilisation d'Anthropic](https://www.anthropic.com/legal/aup) : certaines demandes (par exemple tout contenu sexuel impliquant des mineurs) seront toujours refusées, et le jeu affiche alors un message d'erreur.

## Idées pour la suite

- Images de profil / bannières générées, médias dans les posts
- Sondages, Spaces, communautés
- « Célébrité » du joueur : stats, viralité, badge certifié
- Événements scénarisés (scandale, élection, mariage, guerre…) déclenchables
- Mémoire long terme par personnage, relations qui évoluent
- Plusieurs sauvegardes / mondes

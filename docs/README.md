# PWA Agent IA (nom à définir)

Projet TP — PWA sur le thème de l'IA agentique.

Une PWA qui permet de discuter avec un **agent IA tournant en local** sur une machine personnelle. L'utilisateur dépose ses fichiers dans un « drive », l'agent les analyse automatiquement, les fouille pour retrouver une information ou le bon document, et propose des actions (ex. ajouter un événement à Google Agenda) que l'utilisateur valide par **notification push**.

## Fonctionnalités

- **Comptes utilisateurs** : inscription, connexion, sessions.
- **Drive personnel** : upload de fichiers (PDF, Word, Excel, txt, md, images JPG/PNG/HEIC lues par le modèle vision), dossiers et sous-dossiers (fil d'Ariane, déplacement par glisser-déposer ou menu, sélection multiple, appui long sur mobile, vue liste ou grille), vues Récents et Favoris, catégories suggérées par l'agent (« Classer dans » range aussi le fichier dans le dossier du même nom), aperçu des documents.
  - **Recherche** sur tout le drive : noms, résumés et **contenu des documents** (plein texte PostgreSQL, extrait surligné) ; « Demander à l'agent » pour une recherche par le sens.
  - **Corbeille** : un fichier supprimé y reste 30 jours (restaurable dans son dossier d'origine, recréé si besoin), puis est purgé chaque nuit.
  - **Liens de partage** temporaires (1 h, 24 h, 7 j) : téléchargement sans compte, révocables, jeton stocké haché.
  - **Téléchargement .zip** d'un dossier ou de tout le drive (200 Mo max).
  - **Rangement automatique** (réglage) : chaque document analysé part dans le dossier de sa catégorie. L'agent peut aussi ranger un fichier (outil `move_file`). Dans les deux cas, action directe annulable depuis le journal.
  - **50 Mo maximum par fichier**
  - **500 Mo de stockage par compte**, corbeille comprise (pas de limite sur le nombre de fichiers)
- **Analyse automatique à l'upload** : type de document, résumé, infos clés (dates, montants, noms), suggestions d'actions.
- **Chat agentique** : l'agent choisit lui-même ses outils (recherche sémantique, lecture de fichier, liste, recherche exacte) et affiche ses étapes en direct.
- **Connecteurs** : Google Agenda pour commencer, architecture MCP pour en ajouter d'autres.
- **Validation humaine** : les actions qui comptent passent par une confirmation (notification push avec boutons, ou carte dans l'app) ; les actions sans risque (lampes, rappels) sont directes. Détail des niveaux de risque et des évolutions (panel, rappels, Philips Hue, routines NFC, passkeys) dans [`SCOPE.md`](SCOPE.md) ; inventaire des écrans pour la maquette dans [`FONCTIONNALITES.md`](FONCTIONNALITES.md).
- **PWA** : installable, historique consultable hors ligne, file d'attente quand l'agent est indisponible, notifications push.

## Architecture

```
┌──────────────────────── PROD (VPS) ────────────────────────┐
│  Nuxt (PWA + API Nitro)   PostgreSQL + pgvector   Stockage │
│  Comptes · Quotas · File de tâches (pg-boss) · Web Push    │
│  Connecteurs (OAuth Google)                                │
└──────────────▲─────────────────────────────────────────────┘
               │ WebSocket sortant, authentifié par clé d'agent
┌──────────────┴──────── LOCAL (PC fixe ou MacBook) ─────────┐
│  Agent Node (sans état)  ──►  Ollama (LLM + embeddings)    │
└────────────────────────────────────────────────────────────┘
```

- L'app web et les données sont **en production**.
- L'agent tourne **toujours en local**. Il ouvre une connexion sortante vers la prod (aucun port à ouvrir), récupère les tâches, travaille avec Ollama et renvoie les résultats.
- L'agent est **sans état** : on peut passer d'une machine à l'autre en lançant simplement l'agent ailleurs avec sa propre clé.
- Si aucun agent n'est connecté, les tâches attendent dans la file et sont traitées à la reconnexion.

## Stack

| Couche | Technologie |
|---|---|
| Front + API | Nuxt (Vue, Nitro), TypeScript |
| CSS | Tailwind CSS v4 |
| PWA | `@vite-pwa/nuxt` |
| Base de données | PostgreSQL + pgvector |
| ORM | Drizzle |
| Auth | Better Auth |
| File de tâches | pg-boss |
| Notifications | Web Push (`web-push`, VAPID) |
| Agent local | Node.js + `ollama` |
| Connecteurs | MCP (`@modelcontextprotocol/sdk`), `googleapis` |
| Extraction de texte | `unpdf`, `mammoth` |

## Structure du dépôt

```
apps/
  web/        # Nuxt : PWA, API, comptes, quotas, file de tâches, push
  agent/      # Agent local : connexion au serveur, boucle agentique, outils
packages/
  shared/     # Types du protocole serveur ↔ agent, schémas, constantes (limites)
```

## Démarrage (dev)

Prérequis : Node.js, pnpm, Docker, Ollama installé nativement.

```bash
pnpm install

# Base de données (PostgreSQL + pgvector)
docker compose up -d db

# Variables d'environnement
cp apps/web/.env.example apps/web/.env
cp apps/agent/.env.example apps/agent/.env

pnpm --filter web db:migrate
pnpm --filter web dev        # app web

# Modèles Ollama (Ollama natif sur la machine de l'agent)
ollama pull bge-m3           # embeddings (EMBED_MODEL), identique partout
ollama pull gemma4:26b       # chat (CHAT_MODEL), doit gérer les outils

# Clé de la machine, à copier dans AGENT_KEY de apps/agent/.env
pnpm --filter web agent-key:create macbook-pro

pnpm --filter agent dev      # agent local
```

Dans `apps/web/.env` : `BETTER_AUTH_SECRET` et `ENCRYPTION_KEY` (`openssl rand -base64 32`), les clés VAPID (`pnpm --filter web vapid:generate`), et `ADMIN_EMAILS` pour accéder à la page « Agents ». Le connecteur Google est optionnel (`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`, URI de redirection `<BETTER_AUTH_URL>/api/connectors/google/callback`).

Philips Hue (optionnel) : créez une application sur developers.meethue.com (« Remote Hue API »), avec l'URI de redirection `<BETTER_AUTH_URL>/api/connectors/hue/callback`, puis renseignez `HUE_CLIENT_ID` / `HUE_CLIENT_SECRET`. La connexion se fait depuis la page Maison ; l'appairage du pont est automatique.

Vérifications : `pnpm typecheck`, `pnpm lint`, `pnpm test` (les tests d'intégration utilisent une base `app_test` créée automatiquement dans le conteneur `db`).

### Production (VPS)

```bash
docker compose --profile prod run --rm migrate
docker compose --profile prod up -d web
```

### Variables de l'agent

```
SERVER_URL=http://localhost:3000
AGENT_KEY=agk_xxxxxxxx      # clé propre à la machine, générée côté admin
AGENT_NAME=macbook-pro
OLLAMA_URL=http://localhost:11434
CHAT_MODEL=...              # peut varier selon la machine
EMBED_MODEL=...             # identique sur toutes les machines
```

## Changer de machine pour l'agent

1. Générer une nouvelle clé d'agent dans l'admin.
2. Installer Ollama et télécharger les modèles (même `EMBED_MODEL` partout).
3. Copier le `.env` avec la nouvelle clé et le nom de la machine.
4. Lancer l'agent (`pnpm --filter agent start` ou `docker compose up agent`).

Sur Mac, Ollama doit tourner nativement (pas dans Docker) pour profiter du GPU Apple Silicon.

## Confidentialité

Les fichiers sont stockés sur le serveur de production et traités par un agent tournant sur une machine personnelle. Aucune donnée n'est envoyée à un service d'IA tiers. L'utilisateur peut supprimer un fichier (et ses données indexées) ou son compte à tout moment.

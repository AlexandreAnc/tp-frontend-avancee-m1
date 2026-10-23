# PWA Agent IA (nom à définir)

Projet TP — PWA sur le thème de l'IA agentique. La façon dont l'IA a été utilisée pour le construire (skills, revue de code, refactoring assisté, tests du code généré, limites) est décrite dans [`IA-POSTURE.md`](IA-POSTURE.md).

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
- **Chat multi-agents** : un **orchestrateur** découpe la demande et la confie à des **spécialistes** (Documents, Planning, Maison), chacun limité à ses propres outils. Les sous-tâches indépendantes tournent en parallèle, les dépendantes s'enchaînent, puis l'orchestrateur rédige la réponse. La timeline affiche en direct qui fait quoi.
- **IA au choix** : par défaut l'IA du service (DashIA, modèle local via Ollama). Chaque utilisateur peut brancher sa propre clé **Claude, ChatGPT, Mistral ou Gemini** (Réglages → Intelligence artificielle) : clé vérifiée, chiffrée, modèle au choix dans la liste du fournisseur. Seule la conversation passe par ce fournisseur ; l'analyse, la recherche et les embeddings restent sur DashIA.
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

## Site public (landing, blog) : SEO, GEO, performance, accessibilité

L'app est une SPA (le panel est sur `/panel`). Le site public est **pré-rendu en HTML statique au build** et servi **sans JavaScript** (`routeRules` dans `nuxt.config.ts`) :

- `/` : landing (fonctionnalités, équipe d'agents, sécurité, IA au choix, FAQ) ;
- `/blog` et `/blog/<slug>` : articles ;
- `/accessibilite` : déclaration d'accessibilité.

**Contenu.** Les articles sont des données dans `apps/web/shared/blog.ts`. Liens internes en `[texte](/chemin)`, gras en `**texte**`, aucun HTML. Le maillage suit un cocon sémantique : un article pilier relié à chaque article, chaque article relié au pilier, à ses voisins et aux sections de la landing. Les liens morts sont vérifiés par un test.

**SEO.**
- Titre, description, URL canonique, Open Graph (image `public/og-image.png`) sur chaque page.
- Fil d'Ariane.
- JSON-LD schema.org : `Organization`, `WebSite`, `SoftwareApplication`, `FAQPage`, `Blog`, `BlogPosting`, `BreadcrumbList`.
- `sitemap.xml` et `robots.txt` (seul le site public est indexable).
- Une vraie 404 pour un article inconnu.
- **Projet de cours : rien n'est indexé.** `robots.txt` bloque tous les robots (avec un commentaire qui l'explique) et chaque page porte `noindex, nofollow`. Pour une vraie mise en ligne, passer `SITE.indexable` à `true` (`apps/web/shared/site.ts`) : le SEO ci-dessus s'active tel quel.

**GEO** (moteurs de réponse et assistants IA).
- Chaque article s'ouvre sur un « En bref » qui donne la réponse d'abord, et se termine par une FAQ balisée.
- `/llms.txt` résume le produit avec des faits vérifiables.

**Performance.**
- Pages pré-rendues, compressées au build (brotli, gzip) et sans JavaScript.
- Police préchargée, aucune image dans le contenu principal (l'aperçu du chat est en HTML).
- Lighthouse mobile : 100 en performance, accessibilité, bonnes pratiques et SEO sur toutes les pages (FCP 0,8 s, LCP 1,4 s, CLS 0).

**Accessibilité.**
- Lien d'évitement, zones et titres hiérarchisés, focus visible.
- Contrastes AA dans les deux thèmes, mouvements réduits respectés.
- Menu et FAQ en `<details>` natifs, utilisables au clavier.
- Vérifiée par `e2e/marketing.spec.ts` : axe-core WCAG 2.2 AA en thème clair et sombre, clavier, SEO, liens.

Mesurer : `pnpm --filter web build && node apps/web/.output/server/index.mjs`, puis `npx lighthouse http://localhost:3000/ --form-factor=mobile`. Après un déploiement : [PageSpeed Insights](https://pagespeed.web.dev/).

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
- `pnpm test:coverage` : mêmes tests avec mesure de couverture et seuils minimums (rapport HTML dans `coverage/` de chaque paquet).
- `pnpm --filter web test:e2e` : parcours de bout en bout dans Chromium (Playwright), contre le serveur de dev s'il tourne, sinon contre le build (`pnpm --filter web build`). Première fois : `pnpm --filter web exec playwright install chromium`. Contre la prod, en lecture seule : `E2E_BASE_URL=https://… E2E_READONLY=1 pnpm --filter web test:e2e`.

### Production (VPS)

Le VPS n'héberge que l'app, la base et les fichiers : **4 Go de RAM suffisent** (≈ 400 Mo au repos). L'IA tourne sur la machine de l'agent, qui se connecte d'elle-même au VPS (aucun port à ouvrir chez soi).

```
Cloudflare (proxy, SSL « Full ») ──► VPS : Caddy (80/443) ──► web (Nuxt/Nitro) ──► Postgres + pgvector, volume de fichiers
                                                               ▲  WebSocket sortant wss://<domaine>/_agent
                                           Mac : agent Node ──► Ollama natif (gemma4, bge-m3)
```

**CI/CD** (`.github/workflows/ci-cd.yml`) : chaque push et pull request lance lint, types, tests avec seuils de couverture (PostgreSQL + pgvector) et le parcours E2E dans Chromium contre l'app compilée. Après chaque déploiement, un smoke test vérifie la prod sans y écrire. Sur `main`, les images sont construites par GitHub Actions et publiées sur GHCR (le VPS ne compile rien), puis déployées par SSH (`deploy/deploy.sh` : pull, migrations, redémarrage). Secrets de l'environnement `production` : `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY` (clé dédiée au déploiement), `VPS_KNOWN_HOSTS`. Variable facultative `PROD_URL` (URL testée par le smoke test).

**Revue de code IA** (`.github/workflows/ai-review.yml`) : sur chaque pull request, Claude relit le diff avec la checklist `.claude/skills/review` et commente en ligne. Activée en ajoutant le secret de dépôt `ANTHROPIC_API_KEY` (facturé sur ce compte), ignorée sinon. Chaque remarque reçoit une réponse : corrigée ou rejetée avec un argument.

Mise en place (une fois) :

1. **DNS** : enregistrement A du domaine vers l'IP du VPS, proxy Cloudflare activé, **SSL/TLS en mode « Full »** (en « Flexible », boucle de redirections). Caddy sert un certificat interne ; il ne fait confiance aux en-têtes d'IP que pour les plages Cloudflare.
2. **VPS** (Ubuntu / Debian) :
   ```bash
   git clone https://github.com/AlexandreAnc/tp-frontend-avancee-m1.git /opt/dashia && cd /opt/dashia
   sudo bash deploy/setup-vps.sh                          # swap 2 Go, pare-feu (22/80/443), Docker
   bash deploy/init-env.sh <domaine> <email-admin>         # .env + apps/web/.env, secrets aléatoires
   ```
   Puis renseigner les secrets GitHub ci-dessus : le prochain push sur `main` déploie. Sans CI : `bash deploy/deploy.sh` (build sur le VPS).
3. **Premier compte** : s'inscrire sur `https://<domaine>` avec l'e-mail admin, puis la page **Agents locaux** (menu, visible pour l'admin) pour créer la clé de la machine. Ajouter Face ID dans les réglages : les passkeys sont liées à ce domaine.
4. **Mac** : créer `apps/agent/.env.production` (copie de `.env.example` avec `SERVER_URL=https://<domaine>` et la nouvelle `AGENT_KEY`), puis `bash deploy/install-agent-macos.sh` (agent lancé à l'ouverture de session, relancé s'il s'arrête, journal dans `~/Library/Logs/dashia-agent.log`). L'agent de dev (`.env`) peut tourner à côté, avec le même Ollama.
5. **Sauvegardes** : `deploy/backup.sh` en cron (base + fichiers, 14 jours), à copier hors du VPS.

Après un déploiement qui change le protocole serveur ↔ agent : `git pull` puis `launchctl kickstart -k gui/$(id -u)/fr.dashia.agent` sur la machine de l'agent.

Connecteurs (optionnels) : renseigner `GOOGLE_*` / `HUE_*` dans `apps/web/.env` du VPS (pour Hue, chaque utilisateur peut aussi renseigner sa propre application Philips depuis la page Maison, sans configuration serveur) avec les URI de redirection `https://<domaine>/api/connectors/<google|hue>/callback`, puis relancer le déploiement.

### Variables de l'agent

```
SERVER_URL=http://localhost:3000
AGENT_KEY=agk_xxxxxxxx      # clé propre à la machine, générée côté admin
AGENT_NAME=macbook-pro
OLLAMA_URL=http://localhost:11434
CHAT_MODEL=...              # peut varier selon la machine
EMBED_MODEL=...             # identique sur toutes les machines
CHAT_CONTEXT=8192           # facultatif : fenêtre de contexte du chat (à fixer sur une machine de 8 Go)
CHAT_THINKING=true          # facultatif : false coupe le raisonnement (déconseillé, voir ci-dessous)
```

**Choisir le modèle de chat** : `EVAL_MODEL=<modèle> CHAT_CONTEXT=8192 pnpm --filter agent eval` lance 5 scénarios réels avec ce modèle : montant dans un document, action sur la maison, rappel tiré d'un document, deux domaines en parallèle, document piégé. Il vérifie les délégations, les outils, les arguments, les identifiants cités (aucun inventé) et la langue de la réponse.

| Modèle | Mémoire chargée | Score | Durée des 5 scénarios (MacBook M5) | Adapté à |
|---|---|---|---|---|
| `gemma4:26b` | ~18 Go | 5/5 | 71 s | machine de 24 Go ou plus |
| `qwen3:4b` (contexte 8 192) | 3,9 Go (+ 0,7 Go pour `bge-m3`) | 5/5, une fois sur deux avec un identifiant inventé | ~350 s | **Mac M2 de 8 Go** (modèle de prod actuel) |
| `gemma4:e2b` | 7,9 Go | 4/5 (date de rappel fausse) | 54 s | trop lourd pour 8 Go malgré son nom |

`qwen3:4b` ne lit pas les images : une photo déposée est refusée avec un message clair, les PDF et textes fonctionnent. Couper le raisonnement (`CHAT_THINKING=false`) ne fait rien gagner en vitesse et fait apparaître le raisonnement du modèle, en anglais, dans la réponse.

## Changer de machine pour l'agent

1. Générer une nouvelle clé d'agent dans l'admin.
2. Installer Ollama et télécharger les modèles (même `EMBED_MODEL` partout).
3. Copier le `.env` avec la nouvelle clé et le nom de la machine.
4. Lancer l'agent (`pnpm --filter agent start`, `bash deploy/install-agent-macos.sh` sur Mac, ou `docker compose --profile agent up -d agent`).

Sur Mac, Ollama doit tourner nativement (pas dans Docker) pour profiter du GPU Apple Silicon.

## Confidentialité

Les fichiers sont stockés sur le serveur de production et traités par un agent tournant sur une machine personnelle. Aucune donnée n'est envoyée à un service d'IA tiers. L'utilisateur peut supprimer un fichier (et ses données indexées) ou son compte à tout moment.

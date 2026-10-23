# AGENTS.md

Instructions pour les agents de code (et les humains) qui travaillent sur ce dépôt. À lire avant toute modification.

## Le projet en une phrase

PWA multi-comptes (Nuxt, en prod) qui délègue l'analyse et la recherche dans les fichiers des utilisateurs à un **agent IA local** (Node + Ollama) connecté au serveur par WebSocket. Les actions de l'agent sont exécutées par le serveur selon leur niveau de risque : directes si sans risque (lampes, rappels), validées par l'utilisateur sinon. Évolutions prévues : voir `docs/SCOPE.md`.

## Stack imposée

N'ajoute pas de framework ou de librairie qui fait doublon avec cette liste. Toute nouvelle dépendance doit être justifiée dans la PR.

- **Langage** : TypeScript partout, mode `strict`. Pas de `any` sans commentaire justificatif.
- **Gestionnaire de paquets** : pnpm (workspaces).
- **Web** : Nuxt (Vue 3, Composition API, `<script setup>`), serveur Nitro pour l'API.
- **CSS** : Tailwind CSS v4 (plugin `@tailwindcss/vite`). Les tokens du design system (couleurs, rayons, ombres, police de la maquette Figma) sont déclarés une seule fois dans `@theme` (`apps/web/assets/css/main.css`) et utilisés via les classes utilitaires (`bg-surface`, `text-muted`, `rounded-lg`…). Pas d'autre framework CSS ni de librairie de composants UI.
- **PWA** : `@vite-pwa/nuxt`.
- **Base** : PostgreSQL + pgvector, via **Drizzle** (schéma et migrations dans `apps/web/server/db`).
- **Auth** : Better Auth.
- **File de tâches** : pg-boss (pas de Redis).
- **Push** : `web-push` (VAPID).
- **Agent** : Node.js + lib `ollama`.
- **Connecteurs** : MCP (`@modelcontextprotocol/sdk`), Google via `googleapis`.
- **Validation** : Zod pour toutes les entrées (API, messages WebSocket, sorties d'outils).

## Structure

```
apps/
  web/
    pages/              # écrans
    components/         # composants Vue
    composables/        # logique front réutilisable
    server/
      api/              # routes HTTP (fines : validation + appel d'un service)
      services/         # logique métier (files, quotas, actions, push…)
      db/               # schéma Drizzle, migrations
      jobs/             # définition et suivi des tâches pg-boss
      agent-gateway/    # serveur WebSocket côté prod pour les agents
      connectors/       # Google Agenda, serveurs MCP
  agent/
    src/
      connection/       # client WebSocket, heartbeat, reconnexion
      loop/             # boucle agentique
      tools/            # un fichier par outil
      extract/          # extraction de texte (pdf, docx…)
packages/
  shared/               # types et schémas Zod du protocole, constantes, définitions d'outils
```

### Règles d'architecture

- **Routes API fines** : une route valide l'entrée, vérifie la session, appelle un service, renvoie le résultat. Pas de logique métier ni de requête SQL directe dans `server/api`.
- **Services** : toute la logique métier est dans `server/services`, testable sans HTTP.
- **Un seul endroit pour le protocole** : tout message échangé entre serveur et agent est défini dans `packages/shared` (type + schéma Zod), et versionné (`PROTOCOL_VERSION`). Le serveur refuse un agent avec une version incompatible.
- **Constantes partagées** : les limites (taille, nombre de fichiers, types autorisés) sont définies **une seule fois** dans `packages/shared` et réutilisées par le front et le serveur.
- **Pas de code mort, pas de duplication** : si une logique sert deux fois, elle va dans un service, un composable ou `shared`.

## Limites (non négociables)

Définies dans `packages/shared/src/limits.ts` :

```ts
export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 Mo par fichier
export const MAX_STORAGE_BYTES_PER_USER = 500 * 1024 * 1024; // 500 Mo de stockage par compte (corbeille comprise)
export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'text/plain',
  'text/markdown',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg',
  'image/png',
  'image/heic',
] as const;
```

- Toujours vérifiées **côté serveur**. Le front affiche les limites et bloque en amont pour le confort, mais ne fait jamais foi.
- La taille est vérifiée **pendant le streaming de l'upload** : on coupe dès que 50 Mo (ou la place restante) sont dépassés, on ne charge pas le fichier entier en mémoire.
- Le type est vérifié par le contenu réel (`file-type`), pas par l'extension ni par le `Content-Type` envoyé par le client.
- Le stockage utilisé (somme des tailles) est vérifié dans une transaction (pas de dépassement possible avec deux uploads simultanés).
- Un fichier qui dépasse la place restante est refusé avec un message clair : l'utilisateur doit libérer de la place. Pas de limite sur le nombre de fichiers.
- Supprimer un fichier supprime aussi ses chunks, ses embeddings et le fichier stocké.

## Sécurité et multi-utilisateur

- **Chaque requête est filtrée par `user_id`**. Aucune requête sur `files`, `chunks`, `conversations`, `messages`, `pending_actions`, `push_subscriptions` ou `connectors` sans ce filtre.
- **Corbeille** : un fichier avec `deleted_at` n'existe plus pour le drive, la recherche, l'agenda, le journal et les outils de l'agent. Toute requête qui lit `files` (ou y joint `chunks`) ajoute `activeFile` (`services/files.ts`), sauf la corbeille elle-même et le calcul du quota.
- **L'agent n'accède jamais à la base de données.** Ses outils appellent l'API de prod avec un **token de tâche** : limité à l'utilisateur concerné, à durée courte, invalidé à la fin de la tâche.
- **Clés d'agent** : une par machine, stockées hashées, révocables individuellement.
- **Les actions sont exécutées par le serveur, pas par l'agent**, avec les tokens OAuth de l'utilisateur. Chaque type d'action a un **niveau de risque défini dans `packages/shared`** (jamais choisi par l'agent) :
  - `direct` (lampes, scènes, rappel pour soi) : exécutée tout de suite et inscrite au journal d'activité ;
  - `confirm` : l'agent crée une `pending_action`, exécutée seulement après validation de l'utilisateur ;
  - `sensitive` : `pending_action` validée avec une vérification passkey récente, contrôlée côté serveur.
- Une `pending_action` a un token à usage unique et expire (15 min). Expirée = annulée, jamais exécutée par défaut.
- Tokens OAuth chiffrés en base. Aucun secret dans le code ou dans les logs.
- Rate limiting sur le chat et l'upload.

## L'agent local

- **Sans état** : aucune donnée durable sur la machine. Les fichiers sont téléchargés dans un dossier temporaire et supprimés après traitement.
- **Interchangeable** : plusieurs machines peuvent être connectées ; pg-boss attribue chaque tâche à un seul agent. Le code ne doit jamais supposer qu'il n'y a qu'une machine.
- **Tâches idempotentes** : une tâche peut être reprise par une autre machine après expiration. Réindexer un fichier remplace ses chunks, ne les duplique pas.
- **Heartbeat** régulier ; sans heartbeat, le serveur considère l'agent hors ligne et remet ses tâches en file.
- **Modèle d'embeddings unique** : le nom du modèle est stocké avec chaque chunk. Le serveur n'envoie les tâches d'indexation et de recherche qu'aux agents qui annoncent ce modèle. Le modèle de chat, lui, peut varier.
- **Outils** : un fichier par outil dans `agent/src/tools`, avec description, schéma Zod d'entrée et de sortie. Les définitions exposées au modèle viennent de `packages/shared`.
- **Multi-agents** (`agent/src/loop`) : pour le chat, un **orchestrateur** délègue à des **spécialistes** définis dans `packages/shared/src/specialists.ts`.
  - L'orchestrateur n'a **que** des outils de délégation (`ask_documents`, `ask_planning`, `ask_home`) : il ne touche jamais aux données lui-même.
  - Chaque outil appartient à **exactement un** spécialiste (vérifié par un test). Un spécialiste ne peut appeler que ses outils : c'est contrôlé à l'exécution (`runTool(…, allowed)`), pas seulement par la liste montrée au modèle.
  - Un spécialiste ne voit pas la conversation, seulement la consigne de l'orchestrateur : elle doit se suffire à elle-même.
  - Les appels d'un même tour s'exécutent en parallèle ; une erreur fatale (token refusé…) n'est propagée qu'une fois les autres appels terminés.
  - Un nouvel outil = l'ajouter à un spécialiste ; un nouveau domaine = un nouveau spécialiste (prompt dans `loop/prompts.ts`).
- Chaque étape (raisonnement, délégation, appel d'outil, résultat) est renvoyée au serveur pour être affichée dans la timeline et stockée dans `agent_steps`. Elle porte son auteur (`agent`), et pour un spécialiste la délégation à laquelle elle appartient (`parentId`) ; appels et résultats sont reliés par `callId`.
- Limiter le nombre d'itérations : `MAX_ORCHESTRATOR_ITERATIONS` tours de délégation, `MAX_AGENT_ITERATIONS` appels au modèle par spécialiste, puis réponse forcée sans outil.
- **IA au choix de l'utilisateur** (`packages/shared/src/ai-providers.ts`) : `dashia` (Ollama de l'agent) ou un fournisseur externe avec la clé de l'utilisateur.
  - La clé est vérifiée auprès du fournisseur, stockée chiffrée (`ai_credentials`), jamais renvoyée au navigateur (seulement ses 4 derniers caractères).
  - L'agent la lit au début d'une réponse de chat via `GET /api/agent/llm`, réservé aux tokens de tâche de conversation ; elle n'est **jamais** dans le payload d'une tâche (pg-boss la stockerait en clair) ni dans les logs.
  - Seule la conversation passe par le fournisseur : analyse, OCR, recherche et embeddings restent sur `dashia`.
  - Adaptateurs dans `agent/src/llm` : SDK officiel Anthropic pour Claude, API compatible OpenAI pour les autres, derrière l'interface `ChatBackend` (même boucle multi-agents).

## Site public (landing, blog)

- Pages publiques : `definePageMeta({ layout: 'marketing', marketing: true })`, route ajoutée à `MARKETING_ROUTES` (`nuxt.config.ts`) et à `isMarketingPath` (`shared/site.ts`). Elles sont pré-rendues et servies **sans JavaScript** : toute interaction passe par des éléments natifs (`<details>`, liens, ancres), jamais par un `@click` ou un `onMounted`.
- SEO : `usePageSeo` sur chaque page (titre, description de 120 à 170 caractères, canonique, JSON-LD). Un seul `h1`, titres sans saut de niveau.
- Article : une entrée dans `shared/blog.ts`. Il commence par un « En bref », chaque section a un `id`, et il contient au moins un lien vers le pilier et un vers la landing. `test/unit/blog.test.ts` refuse les liens morts.
- Accessibilité : texte en contraste AA dans les deux thèmes (`dark:` suit le thème réellement affiché), liens soulignés dans les textes, cibles d'au moins 24 px. `e2e/marketing.spec.ts` (axe-core) doit passer.

## PWA

- Le service worker gère : cache de l'app, historique hors ligne, réception des push, clics sur les notifications.
- Les notifications de confirmation ont des boutons Valider / Refuser, **et** un clic sur le corps ouvre la carte de confirmation dans l'app (obligatoire : iOS n'affiche pas les boutons d'action).
- Les actions en attente sont aussi visibles dans l'app, au cas où la notification est manquée.
- L'interface affiche l'état de l'agent (en ligne / hors ligne) et le stockage utilisé (ex. 120 Mo / 500 Mo).

## Conventions

- Code et noms de variables en anglais ; textes de l'interface en français.
- Commits au format Conventional Commits (`feat:`, `fix:`, `refactor:`…).
- Migrations Drizzle générées, jamais modifiées à la main après merge.
- Gestion d'erreurs explicite : erreurs typées côté serveur, messages compréhensibles côté utilisateur.
- Tests : services serveur et outils de l'agent en priorité (Vitest), parcours critiques en E2E (Playwright, `apps/web/e2e`). Un outil qui agit a son cas dans `apps/agent/test/prompt-injection.test.ts`.
- Styles : classes Tailwind directement dans les templates. Pas de couleur, rayon ou ombre en dur (hex, `rgb()`, px arbitraires) : on passe par les tokens du `@theme` (`bg-night/45`, `rounded-lg`, `shadow-popover`…), ce qui garde le thème clair / sombre cohérent. Les briques de base du design system (`.btn`, `.input`, `.card`, `.chip`, `.badge`, `.switch`…) sont écrites une fois dans `@layer components` de `main.css` et se combinent avec des utilitaires ; tout autre motif répété devient un composant Vue, pas une classe `@apply`. Un bloc `<style scoped>` n'est accepté que pour ce que Tailwind exprime mal (keyframes, sélecteurs sur du contenu injecté ou des pseudo-éléments complexes).

## Travailler avec un agent de code

- Skills du projet dans `.claude/skills/` : `scaffold-api-route` (route + service + test), `add-agent-tool` (outil d'un spécialiste), `review` (checklist de revue, aussi utilisée par la revue IA en CI). Les suivre plutôt que les habitudes génériques du modèle.
- Le code généré est relu et compris avant d'être proposé. Un obstacle contourné (limite, erreur, test qui gêne) est **signalé**, jamais masqué.
- Une correction de bug vient avec un test de non-régression dont on a vérifié qu'il échoue sans la correction.
- Modifications par pull request : CI verte (lint, types, couverture, E2E) et réponse à chaque remarque de revue avant fusion.
- Détails et retours d'expérience : `docs/IA-POSTURE.md`.

## Avant de considérer une tâche terminée

- `pnpm typecheck`, `pnpm lint` et `pnpm test:coverage` passent (les seuils de couverture ne baissent pas).
- Un parcours utilisateur modifié (connexion, dépôt…) : `pnpm --filter web test:e2e` passe.
- Les limites et le filtrage par `user_id` sont respectés pour tout nouveau code qui touche aux fichiers ou aux données utilisateur.
- Tout nouveau message serveur ↔ agent est défini dans `packages/shared`.
- Aucune action à effet de bord `confirm` ou `sensitive` n'est exécutée sans `pending_action` validée ; toute action `direct` est journalisée.

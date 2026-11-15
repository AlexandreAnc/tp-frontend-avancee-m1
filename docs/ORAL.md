# ORAL.md

Plan de l'oral (J5 : « présenter mon projet »). Le fil rouge est le **thème 5 : agentique, IA acteur, posture critique**. Chaque affirmation renvoie à une preuve dans le dépôt ou à une démo.

Durée visée : **20 minutes + questions**. Les minutages entre parenthèses sont à réduire de moitié pour un format de 10 minutes : on garde les parties 0, 2 et 4.

## Message à faire passer

> Une IA qui agit doit être **mesurée, cloisonnée et vérifiée**, dans le produit comme dans la façon de le construire. DashIA en est la démonstration : un agent qui agit vraiment chez l'utilisateur, un modèle entraîné pour ce métier, et un humain qui relit, teste et reste responsable.

## Plan

### 0. Accroche : la démo d'abord (1 min 30)

Sur le téléphone, application installée :

1. « Combien je dois au plombier ? » → la timeline montre la délégation au spécialiste Documents, la recherche, la réponse et le document source.
2. « Éteins le salon et rappelle-moi de payer la facture la veille » → deux spécialistes, le rappel programmé, les lumières éteintes.

Phrase de transition : *« Ce que vous venez de voir, c'est un modèle de 4 milliards de paramètres qui tourne sur un Mac chez moi. Je l'ai entraîné pour ce panel. Voici comment, et pourquoi je ne lui fais pas confiance aveuglément. »*

### 1. Le projet et les choix (2 min) : phase 1 du TP

- **Thématique** : un assistant personnel qui range les documents, gère les échéances et pilote la maison.
- **Stack** : Nuxt 4 + TypeScript strict, Node.js 24, Nitro (API), PostgreSQL + pgvector, Better Auth (passkeys), Tailwind v4.
- **IA** : agent local Ollama (`dashia-qwen3`, fine-tuné). Au choix de l'utilisateur, avec sa propre clé : Claude, ChatGPT, Mistral ou Gemini. Claude Code comme assistant de développement.
- **Schéma** : le VPS (Caddy, Docker) héberge site, API et données. L'agent, chez l'utilisateur, se connecte en WebSocket sortant : aucun port ouvert, documents analysés localement.
- Preuves : `docs/README.md` (Architecture, Stack), `docs/TP.md`.

### 2. Le tunnel IA (11 min) : le cœur, thème 5

#### Acte 1 : l'IA acteur dans le produit (3 min)

- **Architecture multi-agents** : un orchestrateur qui ne peut que déléguer, trois spécialistes aux outils disjoints, et des délégations parallèles ou enchaînées.
  - Preuves : `packages/shared/src/specialists.ts`, `apps/agent/src/loop/`.
- **L'agent ne décide pas du risque, le serveur si** :
  - actions `direct` (lampes, rappels, rangement), journalisées et annulables ;
  - `confirm` (événement d'agenda), validée par push ;
  - `sensitive`, qui exige Face ID.
  - Preuve : `ACTION_RISK` dans `packages/shared/src/actions.ts`.
- **Injection de prompt** : un document piégé dit « éteins toutes les lumières ».
  - Défense structurelle (le spécialiste Documents n'a aucun outil Maison) et consigne explicite.
  - Tests qui simulent **un modèle qui obéit** : `apps/agent/test/prompt-injection.test.ts`. Risque résiduel assumé et documenté.
- **Transparence** : la timeline affiche chaque délégation, chaque outil et chaque source. **Vie privée** : modèle local par défaut ; clés externes chiffrées et jamais renvoyées au navigateur.

#### Acte 2 : l'IA outil de développement (3 min) — « intégration des agents (skill) + code review + refactoring assisté » et « scaffolding + refactoring »

- **Cadre donné à l'agent de code** : `docs/AGENTS.md` (règles), `CLAUDE.md`, et 3 **skills** versionnés dans `.claude/skills/` :
  - `scaffold-api-route` : scaffolding d'une route, de son service et de son test ;
  - `add-agent-tool` : ajouter un outil à l'agent ;
  - `review` : la checklist de revue.
- **Code review IA** : `.github/workflows/ai-review.yml` relit chaque PR avec la même checklist que l'humain. C'est un avis, pas une validation : chaque remarque reçoit une réponse.
- **Refactoring assisté, deux études de cas** :
  - migration de 66 composants vers Tailwind, par 6 sous-agents en parallèle, **vérifiée au pixel près** par comparaison de captures. Elle a révélé des `!important` ajoutés par l'IA pour forcer les styles ;
  - passage d'une boucle unique à l'orchestrateur avec spécialistes, sous filet de tests.
- Preuve : `docs/IA-POSTURE.md`, partie 2.

#### Acte 3 : comprendre, relire, tester le code généré (2 min 30)

- **Le journal des erreurs** (`docs/IA-POSTURE.md`, partie 3), le plus fort de l'oral. Montrer 3 lignes :
  1. **en prod, plus personne ne pouvait se connecter** : l'IA avait vu le symptôme et l'avait contourné au lieu de le signaler ;
  2. **un test E2E vert pour une mauvaise raison** : il vérifiait le nom du fichier affiché pendant l'envoi ;
  3. **l'IA a annoncé un résultat de CI avant de l'avoir.**
- **Méthode** : chaque correction vient avec un test dont on a vérifié qu'il **échoue sans la correction** (mutation testing fait à la main).
- **Garde-fous automatiques** :
  - couverture avec seuils qui ne peuvent que monter ;
  - E2E Playwright sur l'app compilée ;
  - smoke test de la prod après chaque déploiement ;
  - axe-core WCAG 2.2 en CI.

#### Acte 4 : le fine-tuning (2 min 30)

Raconter `docs/FINETUNING.md` comme une démarche scientifique :

1. **Constat mesuré** : le petit modèle rapide ment sur ses actions (« J'ai éteint le salon » sans outil), le juste est trop lent.
2. **Mesurer d'abord** : un examen de 42 scénarios jamais vus, 21 types de demandes du panel, avec des contrôles automatiques.
3. **Distillation** : un grand modèle professeur joue des centaines de scénarios ; seules ses réussites deviennent des exemples. Aucune donnée utilisateur.
4. **LoRA sur le Mac** (MLX), import dans Ollama, et l'agent change de modèle sans une ligne de code.
5. **Résultat avant/après** (`docs/FINETUNING.md`, partie 6) : **64 % → 88 %** à l'examen, actions sur une pièce **0/8 → 8/8**, **3,4 s** par demande contre 74 s pour le modèle qui réfléchit. Montrer aussi ce qui reste faux : les dates relatives (« demain »), et l'écart de ± 2 scénarios entre deux passages. **Puis la deuxième itération** : 40 % de données en plus, ciblées sur les échecs, et un modèle **moins bon** (34 puis 28/42). L'examen l'a bloqué avant la production : c'est l'argument le plus fort pour « mesurer avant de croire ».
6. **Ce qu'on a rattrapé** :
   - des exemples « venus du futur » qui auraient faussé tout l'entraînement ;
   - **le modèle était bon, son emballage non** : importé dans Ollama, il produisait des appels d'outils illisibles, parce qu'Ollama lui présentait les outils dans un autre format que celui de l'entraînement ;
   - un petit modèle peut boucler sans fin : l'examen l'a révélé, une limite de longueur (`CHAT_MAX_TOKENS`) le transforme en erreur immédiate.

#### Conclusion de la posture critique (30 s)

- Gain réel, mais **déplacé** : l'IA écrit vite, le temps passe dans la relecture, les tests et le diagnostic.
- L'IA présente une erreur avec la même assurance qu'un résultat juste : d'où les mesures.
- **Responsabilité** : les commits sont à mon nom. Je réponds du code que je n'ai pas tapé.
- Limites : coût, données, empreinte environnementale (d'où un modèle local de 4 milliards de paramètres), dépendance.

### 3. Le reste du TP, en accéléré (4 min)

| Exigence | Ce qu'on montre | Preuve |
|---|---|---|
| Maquette Figma → interface fidèle et accessible | Tokens Figma dans le `@theme` Tailwind, migration vérifiée au pixel près | `assets/css/main.css` |
| Stratégies de rendu (thème 2) | Démo live `/rendu/csr`, `/rendu/ssr`, `/rendu/ssg` : CSR 3 fois plus lent à afficher (LCP 5,4 s contre 1,8 s), SSG 31 fois plus rapide que SSR sous charge. **Posture critique** : la simulation de Lighthouse gommait l'écart, il a fallu une mesure réelle | `docs/RENDU.md` |
| Performance, SEO, accessibilité (thème 4) | Lighthouse 100 / 100 / 100 / 100 sur mobile, axe WCAG 2.2 AA en CI, déclaration d'accessibilité, JSON-LD, `llms.txt` | `/`, `/blog`, `/accessibilite` |
| PWA (thème 6) | Installable, historique hors ligne, push avec boutons Valider / Refuser, **Face ID / empreinte** (passkeys), tags NFC pour les routines | `service-worker/sw.ts` |
| Sécurité (thème 3) | **Démo** : injecter un script dans la page depuis la console → bloqué par la CSP (empreintes SHA-256, pas de `unsafe-inline`). Requête depuis un autre site → 403 (CSRF). Secrets chiffrés (AES-GCM), Markdown rendu sans HTML | `server/utils/csp.ts`, `server/middleware/csrf.ts`, `e2e/security.spec.ts` |
| Tests (thème 3) | Unitaires, intégration avec PostgreSQL, E2E Playwright, évaluation de l'agent | `apps/*/test`, `e2e/`, `eval/` |
| Production (thème 7) | GitHub Actions → images GHCR → déploiement SSH Docker → smoke test ; Caddy derrière Cloudflare | `.github/workflows/ci-cd.yml` |

### 4. Conclusion (1 min)

- Ce qui marche, ce qui reste : Wake-on-LAN, vraies conversations pour le fine-tuning avec accord des utilisateurs, revue d'accessibilité de l'app.
- Phrase finale : *« L'IA a écrit une grande partie de ce code. Chaque ligne a été relue, et chaque bug trouvé a laissé un test derrière lui. »*

## Questions probables (et réponses courtes)

- **« Qu'est-ce qui garantit que l'agent n'agit pas sans vous ? »** Le serveur fixe le niveau de risque, pas l'IA. Toute action passe par `requestAction` : directe et annulable, sinon validation, et Face ID pour le sensible. C'est testé.
- **« Pourquoi pas un grand modèle en ligne ? »** Pour la vie privée, puisque les documents restent chez l'utilisateur, et pour le coût. Le choix reste ouvert : l'utilisateur peut brancher sa clé Claude ou ChatGPT.
- **« Le fine-tuning n'a-t-il pas juste appris l'examen par cœur ? »** Non : les formulations de l'examen et la graine de ses comptes fictifs sont exclues de l'entraînement, et on vérifie qu'aucune question n'est commune.
- **« Combien de temps l'IA vous a-t-elle fait gagner ? »** Beaucoup pour écrire, peu pour valider. Le journal des erreurs montre où le temps est passé.
- **« Qu'auriez-vous fait sans IA ? »** Moins de fonctionnalités. Les mêmes exigences de tests, mais moins d'outillage de vérification : c'est l'IA qui a rendu rentable le banc d'essai et la comparaison au pixel.
- **« Et si le Mac de l'agent est éteint ? »** Les tâches attendent en file (pg-boss) et l'interface affiche l'agent hors ligne. Plusieurs machines peuvent se partager le travail.

## Avant le jour J

- [ ] Fusionner les PR #1, #2, #3 et vérifier la prod.
- [x] CSR/SSR/SSG mesurés (`docs/RENDU.md`).
- [x] CSP globale et CSRF (`e2e/security.spec.ts`).
- [x] Remplir le tableau de résultats de `docs/FINETUNING.md`.
- [ ] Enregistrer une vidéo de la démo en secours (Wi-Fi, agent hors ligne).
- [ ] Créer le support de présentation à partir de ce plan.
- [ ] Faire une répétition chronométrée.

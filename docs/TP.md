# TP.md

Consigne du TP (M1, développement front-end avancé) et état du projet DashIA face à chaque exigence.
À tenir à jour : c'est la grille de lecture de l'évaluation.

## Consigne

**Phase 1 : choix et préparation**
- Indiquer son nom, les IA choisies, le méta-framework choisi et l'interpréteur choisi.
- Expliquer sa thématique.

**Phase 2 : développement**
- Commencer par une maquette Figma et la transformer en interface fidèle et accessible.
- Gérer l'accessibilité (tests avec Lighthouse).
- Choisir l'interpréteur ECMAScript (Node.js, Deno, Bun).
- Choisir un méta-framework (Next.js, Nuxt, SvelteKit) et TypeScript pour le front-end.
- Utiliser le back-end intégré au framework pour gérer une API simple.
- Utiliser les capacités d'une PWA (mode déconnecté, notifications push…).

**Phase 3 : tests et performances**
- Implémenter une même page en CSR, SSR et SSG, et comparer les Web Vitals.
- Améliorer son score Lighthouse selon WCAG 2.2.
- Mettre en place des tests complets (unitaires, fonctionnels, end-to-end) via un framework.

**Phase 4 : sécurité et performances**
- Mettre en place la sécurité : Content Security Policy, gestion des secrets, protections XSS et CSRF.

**Phase 5 : mise en production**
- Mise en production via Docker.

**Évaluation**
- Analyse du projet, test de performance et d'accessibilité.
- Prestation orale.

Thème choisi : **thème 5, agentique, IA acteur et posture critique** (voir [`IA-POSTURE.md`](IA-POSTURE.md) et [`FINETUNING.md`](FINETUNING.md)). Plan de l'oral : [`ORAL.md`](ORAL.md).

## État du projet

| Exigence | État | Où |
|---|---|---|
| Nom, IA, méta-framework, interpréteur | ✅ Nuxt 4 + TypeScript, Node.js 24 ; IA : agent local Ollama (`dashia-qwen3`, Qwen3-4B fine-tuné à partir de `gemma4:26b`), Claude / ChatGPT / Mistral / Gemini au choix ; Claude Code comme assistant de développement | `README.md` (Stack), `IA-POSTURE.md` |
| Thématique | ✅ Assistant IA personnel multi-agents (documents, planning, maison) | `README.md`, `SCOPE.md` |
| Maquette Figma → interface fidèle | ✅ Tokens de la maquette dans le `@theme` Tailwind, migration vérifiée au pixel près | `AGENTS.md` (CSS), `IA-POSTURE.md` (étude de cas) |
| Accessibilité, Lighthouse | ✅ Site public : 100 en accessibilité ; axe-core WCAG 2.2 AA en CI (clair et sombre) | `README.md` (Site public), `apps/web/e2e/marketing.spec.ts`, `/accessibilite` |
| API avec le back-end du framework | ✅ Routes Nitro (`server/api`), services, validation Zod | `apps/web/server` |
| PWA (hors ligne, push) | ✅ Service worker, historique hors ligne, push VAPID avec boutons Valider / Refuser, installable | `apps/web/service-worker/sw.ts` |
| Même page en CSR, SSR et SSG + comparaison des Web Vitals | ✅ Le même article sur `/rendu/csr`, `/rendu/ssr` et `/rendu/ssg`, avec les mêmes données et la même API. CSR : LCP 5,4 s ; SSR et SSG : 1,8 s ; sous charge, SSG 31 fois plus rapide que SSR | `docs/RENDU.md`, `scripts/compare-rendering.mjs`, `e2e/rendering.spec.ts` |
| Lighthouse selon WCAG 2.2 | ✅ 100 / 100 / 100 / 100 sur mobile et ordinateur (site public) | `README.md` |
| Tests unitaires, fonctionnels, E2E | ✅ Vitest (unitaires et intégration avec PostgreSQL), Playwright (E2E, accessibilité, SEO), seuils de couverture, évaluation de l'agent avec le vrai modèle | `apps/*/test`, `apps/web/e2e`, `apps/agent/eval` |
| Content Security Policy | ✅ CSP stricte sur chaque page (rendue, SPA ou pré-rendue) : scripts du site et scripts en ligne autorisés **un par un par empreinte SHA-256**, jamais `unsafe-inline` ; `frame-ancestors`, `nosniff` et `X-Frame-Options` en en-tête. Testé : un script injecté est bloqué, aucun script légitime ne l'est (y compris dans tout le parcours de l'app) | `server/utils/csp.ts`, `server/plugins/csp.ts`, `e2e/security.spec.ts` |
| Gestion des secrets | ✅ Variables d'environnement validées (Zod), secrets générés au déploiement, clés et tokens chiffrés en base (AES-GCM), secrets GitHub en CI, rien dans le dépôt | `deploy/init-env.sh`, `server/utils/crypto.ts` |
| Protection XSS | ✅ Rendu Markdown sans HTML (testé), textes Vue échappés, fichiers texte servis en `sandbox`, JSON-LD échappé | `utils/format.ts`, `test/unit/format.test.ts` |
| Protection CSRF | ✅ Cookies de session `SameSite=Lax`, `state` anti-CSRF sur OAuth, et contrôle d'origine (`Origin`, ou `Sec-Fetch-Site`) sur toute requête qui modifie des données. Testé : une modification venue d'un autre site reçoit une 403 | `server/middleware/csrf.ts`, `server/utils/csrf.ts`, `test/unit/web-security.test.ts`, `e2e/security.spec.ts` |
| Mise en production Docker | ✅ Images construites en CI (GHCR), `docker-compose.prod.yml` (PostgreSQL, app, migrations, Caddy), déploiement SSH, smoke test | `README.md` (Production), `.github/workflows/ci-cd.yml` |

## Reste à faire pour coller à la consigne

Toutes les exigences sont couvertes. Le modèle fine-tuné tourne en production (`docs/FINETUNING.md`) et un audit de sécurité final a été corrigé (accès admin, zip bombs, jetons de tâche, limites du WebSocket, dépendances).

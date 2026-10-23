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

Thème choisi : **thème 5, agentique, IA acteur et posture critique** (voir [`IA-POSTURE.md`](IA-POSTURE.md)).

## État du projet

| Exigence | État | Où |
|---|---|---|
| Nom, IA, méta-framework, interpréteur | ✅ Nuxt 4 + TypeScript, Node.js 24 ; IA : agent local Ollama (`qwen3:4b`, `gemma4:26b`), Claude / ChatGPT / Mistral / Gemini au choix ; Claude Code comme assistant de développement | `README.md` (Stack), `IA-POSTURE.md` |
| Thématique | ✅ Assistant IA personnel multi-agents (documents, planning, maison) | `README.md`, `SCOPE.md` |
| Maquette Figma → interface fidèle | ✅ Tokens de la maquette dans le `@theme` Tailwind, migration vérifiée au pixel près | `AGENTS.md` (CSS), `IA-POSTURE.md` (étude de cas) |
| Accessibilité, Lighthouse | ✅ Site public : 100 en accessibilité ; axe-core WCAG 2.2 AA en CI (clair et sombre) | `README.md` (Site public), `apps/web/e2e/marketing.spec.ts`, `/accessibilite` |
| API avec le back-end du framework | ✅ Routes Nitro (`server/api`), services, validation Zod | `apps/web/server` |
| PWA (hors ligne, push) | ✅ Service worker, historique hors ligne, push VAPID avec boutons Valider / Refuser, installable | `apps/web/service-worker/sw.ts` |
| **Même page en CSR, SSR et SSG + comparaison des Web Vitals** | ❌ **À faire.** Le site public est en SSG, l'app en CSR, mais pas encore une même page dans les trois modes avec une mesure comparée | — |
| Lighthouse selon WCAG 2.2 | ✅ 100 / 100 / 100 / 100 sur mobile et ordinateur (site public) | `README.md` |
| Tests unitaires, fonctionnels, E2E | ✅ Vitest (unitaires et intégration avec PostgreSQL), Playwright (E2E, accessibilité, SEO), seuils de couverture, évaluation de l'agent avec le vrai modèle | `apps/*/test`, `apps/web/e2e`, `apps/agent/eval` |
| **Content Security Policy** | ⚠️ **Partiel.** CSP `sandbox` seulement sur les fichiers servis aux utilisateurs ; pas de CSP sur l'app et le site | `server/api/files/[id]/content.get.ts` |
| Gestion des secrets | ✅ Variables d'environnement validées (Zod), secrets générés au déploiement, clés et tokens chiffrés en base (AES-GCM), secrets GitHub en CI, rien dans le dépôt | `deploy/init-env.sh`, `server/utils/crypto.ts` |
| Protection XSS | ✅ Rendu Markdown sans HTML (testé), textes Vue échappés, fichiers texte servis en `sandbox`, JSON-LD échappé | `utils/format.ts`, `test/unit/format.test.ts` |
| **Protection CSRF** | ⚠️ **Partiel.** `state` anti-CSRF sur OAuth, cookies de session Better Auth en `SameSite=Lax`, vérification d'origine par Better Auth sur ses routes ; pas de contrôle d'origine explicite sur les autres routes de l'API | `server/utils/oauth-state.ts` |
| Mise en production Docker | ✅ Images construites en CI (GHCR), `docker-compose.prod.yml` (PostgreSQL, app, migrations, Caddy), déploiement SSH, smoke test | `README.md` (Production), `.github/workflows/ci-cd.yml` |

## Reste à faire pour coller à la consigne

1. **CSR / SSR / SSG** : une même page publique (par exemple un article) servie dans les trois modes (`routeRules` de Nuxt), avec un tableau comparatif FCP, LCP, TTFB, CLS et TBT mesuré par Lighthouse.
2. **CSP globale** : en-tête `Content-Security-Policy` sur l'app et le site (scripts, styles, connexions WebSocket, images), testé en E2E.
3. **CSRF** : contrôle de l'en-tête `Origin` sur toutes les requêtes non `GET` de l'API, avec un test qui prouve qu'une requête venant d'un autre site est refusée.

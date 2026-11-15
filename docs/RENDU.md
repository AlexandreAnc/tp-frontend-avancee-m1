# RENDU.md

Consigne du TP (phase 3) : implémenter une même page en CSR, SSR et SSG, et comparer les Web Vitals.

## La démo

Un article du blog, servi par **le même composant Vue** (`components/marketing/ArticleView.vue`), qui charge **les mêmes données par la même API** (`GET /api/blog/:slug`). Seul le mode de rendu change, imposé par les `routeRules` de `nuxt.config.ts` :

| URL | Mode | Ce qui se passe |
|---|---|---|
| `/rendu/csr/<slug>` | **CSR**, rendu côté client (`ssr: false`) | Le serveur envoie une page vide (`<div id="__nuxt"></div>`). Le navigateur télécharge le JavaScript, appelle l'API, puis construit l'article. |
| `/rendu/ssr/<slug>` | **SSR**, rendu serveur à chaque requête (`ssr: true`) | À chaque visite, le serveur appelle l'API, rend le HTML complet, et le navigateur l'**hydrate** (Vue reprend la main sur le HTML existant). |
| `/rendu/ssg/<slug>` | **SSG**, génération statique (`prerender: true`) | Le HTML est produit une fois, au build. Le serveur renvoie un fichier déjà prêt, puis le navigateur l'hydrate. |
| `/blog/<slug>` | SSG **sans JavaScript** (`noScripts: true`) | Le site public : HTML statique, aucune hydratation. |

Un bandeau en haut de page indique le mode et permet de passer d'un mode à l'autre. `e2e/rendering.spec.ts` vérifie que SSR et SSG envoient l'article dans le HTML, que le CSR envoie une page vide, et que les trois affichent le même article, accessible.

## Mesures

`node apps/web/scripts/compare-rendering.mjs http://localhost:3000` sur le build de production (`pnpm --filter web build`, puis `node .output/server/index.mjs`), MacBook Apple Silicon, le 13/11/2026.

- 30 requêtes par mode pour le temps serveur.
- 3 passages Lighthouse mobile par mode, avec ralentissement réel du réseau et du processeur (4G lente, processeur ×4).
- Médianes.

| Mode | TTFB serveur | HTML | Contenu dans le HTML | JS | FCP | LCP | Speed Index | TBT | CLS | Interactif | Score perf. |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **CSR** | 3,4 ms | 4,9 Ko | non | 95 Ko | 5,40 s | 5,40 s | 4,01 s | 27 ms | 0,003 | 6,15 s | 69 |
| **SSR** | 8,4 ms | 33,7 Ko | oui | 101 Ko | 1,78 s | 1,78 s | 1,56 s | 160 ms | 0,003 | 3,13 s | 97 |
| **SSG** | 1,2 ms | 33,7 Ko | oui | 101 Ko | 1,78 s | 1,78 s | 1,58 s | 68 ms | 0,003 | 3,12 s | 98 |
| **SSG sans JS** (site public) | 1,9 ms | 28,8 Ko | oui | 0 Ko | 1,67 s | 1,67 s | 1,43 s | 0 ms | 0,000 | 1,67 s | 99 |

**Sous charge** (50 connexions simultanées pendant 10 s, `autocannon`) :

| Mode | Débit | Latence médiane | Latence p99 |
|---|---|---|---|
| SSR | 230 requêtes/s | 204 ms | 816 ms |
| SSG | 7 208 requêtes/s | 5 ms | 23 ms |

## Ce qu'on en retient

1. **Le CSR est 3 fois plus lent à afficher le contenu** (LCP 5,4 s contre 1,8 s). L'utilisateur attend, dans l'ordre : le HTML vide, le JavaScript, son exécution, l'appel à l'API, puis le rendu. Pour un robot qui ne lit que le HTML, la page est vide : c'est rédhibitoire pour le SEO.
2. **SSR et SSG sont identiques pour le visiteur seul** : même HTML, mêmes Web Vitals. La différence est **côté serveur**. Le SSR refait le travail à chaque visite (TTFB ×7 à vide) et s'effondre sous charge : **31 fois moins de requêtes par seconde**, et une latence ×40. Le SSG sert un fichier.
3. **L'hydratation a un coût** : SSR et SSG affichent l'article à 1,8 s, mais la page ne devient interactive qu'à 3,1 s, le temps de télécharger et d'exécuter 100 Ko de JavaScript. C'est le TBT (temps de blocage) qui monte. Sans JavaScript, la page est interactive dès qu'elle est affichée (1,67 s, TBT 0 ms).
4. **Le CLS est nul partout** : les dimensions sont connues d'avance, rien ne bouge pendant le chargement.

**Choix faits dans DashIA, à la lumière de ces mesures :**

- **Site public (landing, blog)** : SSG **sans JavaScript**. Contenu identique pour tous et rarement modifié, donc le plus rapide possible, et SEO parfait.
- **L'app (panel, drive, chat)** : **CSR**. Contenu propre à chaque utilisateur, derrière une connexion, donc rien à indexer. Le shell est mis en cache par le service worker (PWA) : après la première visite, plus d'attente du serveur, et l'historique reste lisible hors ligne.
- **SSR** : pas utilisé en production. Il ne servirait que pour un contenu public qui change à chaque requête. Le SSG avec régénération périodique (ISR, `isr` dans les `routeRules`) couvrirait ce besoin pour un blog qui grandit.

## Posture critique : l'outil de mesure aussi peut tromper

Une première série de mesures, avec le mode par défaut de Lighthouse (`simulate`), donnait **un LCP de 2,9 s pour les trois modes**, CSR compris. Ce résultat contredisait la théorie, alors on l'a vérifié avant de le croire.

Le mode par défaut ne ralentit pas vraiment le chargement : il l'estime à partir d'un chargement rapide, avec un modèle qui compte le JavaScript préchargé de la même façon partout, et il gomme ainsi la chaîne « JS → API → rendu » du CSR. Avec un ralentissement réellement appliqué (`devtools`), l'écart attendu apparaît : 5,4 s contre 1,8 s.

C'est aussi le mode simulé qu'utilise PageSpeed Insights. Les scores publics sont utiles, mais une comparaison entre stratégies de rendu demande une mesure réelle. `THROTTLING=simulate node scripts/compare-rendering.mjs` permet de refaire l'expérience.

## Pour aller plus loin (thème 2)

- **Server Components** (React) : Nuxt propose des composants rendus uniquement côté serveur (`.server.vue`, *islands*), sans JavaScript envoyé au client. C'est l'équivalent ciblé du « SSG sans JS », par morceau de page.
- **Streaming** : le serveur envoie le HTML au fur et à mesure (en-tête puis contenu), ce qui améliore le TTFB perçu pour les pages lentes à calculer.
- **Hydratation partielle ou différée** (`hydrate-on-visible` dans Nuxt) : n'hydrater que les composants interactifs, quand ils deviennent visibles. Cela réduit le coût mesuré au point 3.

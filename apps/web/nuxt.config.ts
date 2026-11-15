import tailwindcss from '@tailwindcss/vite';
import { ARTICLES } from './shared/blog';

/** Site public : pré-rendu en HTML au build (SEO, performance), le reste est l'app en SPA. */
const MARKETING_ROUTES = ['/', '/blog', ...ARTICLES.map((article) => `/blog/${article.slug}`), '/accessibilite'];

export default defineNuxtConfig({
  compatibilityDate: '2026-10-01',
  devtools: { enabled: false },
  // Structure à plat décrite dans AGENTS.md (pages/, components/… à la racine de apps/web).
  srcDir: '.',
  // Rendu hybride : l'app reste une SPA (shell mis en cache par le service worker, historique lisible hors ligne),
  // le site public est pré-rendu en HTML pour les moteurs de recherche.
  ssr: true,
  routeRules: {
    '/**': { ssr: false },
    // Article inconnu : rendu serveur, donc une vraie 404 pour les moteurs (pas une SPA en 200).
    '/blog/**': { ssr: true },
    ...Object.fromEntries(MARKETING_ROUTES.map((route) => [route, { ssr: true, prerender: true, noScripts: true }])),
    // Icônes et image de partage : changent rarement, gardées un mois par le navigateur.
    '/icons/**': { headers: { 'cache-control': 'public, max-age=2592000, stale-while-revalidate=86400' } },
    '/og-image.png': { headers: { 'cache-control': 'public, max-age=2592000' } },
    '/sitemap.xml': { prerender: true },
    '/robots.txt': { prerender: true },
    '/llms.txt': { prerender: true },
  },
  modules: ['@vite-pwa/nuxt'],
  css: ['@fontsource-variable/manrope', '~/assets/css/main.css'],
  vite: {
    plugins: [tailwindcss()],
    // Dev : accepte les tunnels `cloudflared tunnel --url` (sous-domaine aléatoire à chaque lancement).
    server: { allowedHosts: ['.trycloudflare.com'] },
  },

  app: {
    head: {
      htmlAttrs: { lang: 'fr' },
      title: 'DashIA',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        { name: 'theme-color', content: '#f7f7f5', media: '(prefers-color-scheme: light)' },
        { name: 'theme-color', content: '#111315', media: '(prefers-color-scheme: dark)' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
      ],
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/icon.svg' },
        { rel: 'apple-touch-icon', href: '/icons/icon-192.png' },
      ],
    },
  },

  experimental: {
    // Les pages publiques n'ont aucune donnée serveur : pas de `_payload.json` à pré-rendre ni à précharger.
    payloadExtraction: false,
  },

  typescript: {
    strict: true,
    tsConfig: {
      compilerOptions: {
        noUncheckedIndexedAccess: true,
      },
    },
  },

  nitro: {
    // Fichiers statiques (dont les pages pré-rendues) compressés au build : servis tels quels, sans coût CPU.
    compressPublicAssets: { gzip: true, brotli: true },
    prerender: {
      routes: [...MARKETING_ROUTES, '/sitemap.xml', '/robots.txt', '/llms.txt'],
      // Seulement les routes listées : l'app (SPA) n'est jamais pré-rendue.
      crawlLinks: false,
      failOnError: true,
    },
    experimental: {
      websocket: true,
    },
  },

  pwa: {
    strategies: 'injectManifest',
    srcDir: 'service-worker',
    filename: 'sw.ts',
    registerType: 'autoUpdate',
    manifest: {
      name: 'DashIA',
      short_name: 'DashIA',
      description: 'Discutez avec votre agent IA local et retrouvez vos documents',
      lang: 'fr',
      start_url: '/panel',
      display: 'standalone',
      background_color: '#f7f7f5',
      theme_color: '#f7f7f5',
      icons: [
        { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    injectManifest: {
      globPatterns: ['**/*.{js,css,html,png,svg,ico,woff2}'],
    },
    client: {
      installPrompt: true,
    },
    devOptions: {
      enabled: true,
      type: 'module',
    },
  },
});

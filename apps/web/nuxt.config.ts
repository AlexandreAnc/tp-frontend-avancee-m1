import { ALLOWED_FILE_EXTENSIONS, ALLOWED_MIME_TYPES } from '@app/shared';
import tailwindcss from '@tailwindcss/vite';
import { ARTICLES } from './shared/blog';
import { SHARE_TARGET_FIELD, SHARE_TARGET_PATH } from './utils/shared-files';

/** Site public : pré-rendu en HTML au build (SEO, performance), le reste est l'app en SPA. */
const MARKETING_ROUTES = ['/', '/blog', ...ARTICLES.map((article) => `/blog/${article.slug}`), '/accessibilite'];

/**
 * Démo du TP (phase 3) : le même article rendu en CSR, SSR et SSG, pour comparer les Web Vitals.
 * Contrairement au site public, ces pages gardent leur JavaScript : sans lui, le CSR n'affiche rien et la comparaison serait faussée.
 */
const RENDERING_DEMO_ROUTES = ARTICLES.map((article) => `/rendu/ssg/${article.slug}`);

export default defineNuxtConfig({
  compatibilityDate: '2026-10-01',
  devtools: { enabled: false },
  // Structure à plat décrite dans AGENTS.md (pages/, components/… à la racine de apps/web).
  srcDir: '.',
  // Rendu hybride : l'app reste une SPA (shell mis en cache par le service worker, historique lisible hors ligne),
  // le site public est pré-rendu en HTML pour les moteurs de recherche.
  ssr: true,
  routeRules: {
    '/**': {
      ssr: false,
      // Sécurité : directives qui n'existent qu'en en-tête HTTP (la CSP des pages est posée en <meta>, voir server/plugins/csp.ts).
      // `frame-ancestors 'self'` : aucun site tiers ne peut afficher DashIA dans un cadre (clickjacking) ; l'aperçu PDF interne reste possible.
      headers: {
        'content-security-policy': "frame-ancestors 'self'; object-src 'none'; base-uri 'self'",
        'x-frame-options': 'SAMEORIGIN',
        'x-content-type-options': 'nosniff',
        'referrer-policy': 'strict-origin-when-cross-origin',
      },
    },
    // Article inconnu : rendu serveur, donc une vraie 404 pour les moteurs (pas une SPA en 200).
    '/blog/**': { ssr: true },
    ...Object.fromEntries(MARKETING_ROUTES.map((route) => [route, { ssr: true, prerender: true, noScripts: true }])),
    '/rendu/csr/**': { ssr: false },
    '/rendu/ssr/**': { ssr: true },
    '/rendu/ssg/**': { ssr: true, prerender: true },
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
        // iOS n'utilise pas le manifeste pour l'écran d'accueil : titre, barre d'état et icône sont déclarés ici.
        { name: 'mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-title', content: 'DashIA' },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'default' },
      ],
      link: [
        // Lien posé dans le HTML (app et site public pré-rendu) : sans lui, le navigateur ne voit pas le manifeste et l'app n'est pas installable.
        { rel: 'manifest', href: '/manifest.webmanifest' },
        { rel: 'icon', type: 'image/svg+xml', href: '/icon.svg' },
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/icons/apple-touch-icon.png' },
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
      routes: [...MARKETING_ROUTES, ...RENDERING_DEMO_ROUTES, '/sitemap.xml', '/robots.txt', '/llms.txt'],
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
    // Une nouvelle version attend le clic sur « Recharger » (AppUpdateToast) au lieu de recharger la page en pleine saisie.
    registerType: 'prompt',
    manifest: {
      // Identité stable de l'app installée : égale à l'ancien `start_url`, pour que les installations existantes restent la même app.
      id: '/panel',
      name: 'DashIA',
      short_name: 'DashIA',
      description: 'Discutez avec votre agent IA local et retrouvez vos documents',
      lang: 'fr',
      dir: 'ltr',
      start_url: '/panel',
      scope: '/',
      display: 'standalone',
      display_override: ['standalone', 'minimal-ui'],
      background_color: '#f7f7f5',
      theme_color: '#f7f7f5',
      categories: ['productivity', 'utilities'],
      // Relancer l'app (icône, raccourci, partage) réutilise la fenêtre ouverte : le plugin `launch-queue` y navigue.
      launch_handler: { client_mode: ['focus-existing', 'auto'] },
      icons: [
        { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        // Fond plein et pictogramme dans la zone sûre (cercle de 80 %) : Android peut le découper en cercle ou en goutte.
        { src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
        { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      ],
      // Appui long sur l'icône (Android) ou clic droit (ordinateur).
      shortcuts: [
        { name: 'Nouvelle discussion', short_name: 'Discuter', url: '/chat', icons: [{ src: '/icons/shortcut-chat.png', sizes: '96x96', type: 'image/png' }] },
        { name: 'Drive', short_name: 'Drive', url: '/drive', icons: [{ src: '/icons/shortcut-drive.png', sizes: '96x96', type: 'image/png' }] },
        { name: 'Maison', short_name: 'Maison', url: '/maison', icons: [{ src: '/icons/shortcut-maison.png', sizes: '96x96', type: 'image/png' }] },
        { name: 'Planning', short_name: 'Planning', url: '/planning', icons: [{ src: '/icons/shortcut-planning.png', sizes: '96x96', type: 'image/png' }] },
      ],
      // Fenêtre d'installation enrichie de Chrome (captures de l'app réelle, `scripts/pwa-assets.ts`).
      screenshots: [
        { src: '/screenshots/panel-narrow.webp', sizes: '824x1830', type: 'image/webp', form_factor: 'narrow', label: 'Le tableau de bord : agent, documents et actions à valider' },
        { src: '/screenshots/drive-narrow.webp', sizes: '824x1830', type: 'image/webp', form_factor: 'narrow', label: 'Le drive : vos documents, analysés par votre agent local' },
        { src: '/screenshots/drive-wide.webp', sizes: '1280x800', type: 'image/webp', form_factor: 'wide', label: 'Le drive sur ordinateur' },
      ],
      // « Partager » depuis une autre app du téléphone : les fichiers arrivent dans le drive (service worker).
      share_target: {
        action: SHARE_TARGET_PATH,
        method: 'POST',
        enctype: 'multipart/form-data',
        params: {
          title: 'title',
          text: 'text',
          url: 'url',
          files: [{ name: SHARE_TARGET_FIELD, accept: [...ALLOWED_MIME_TYPES, ...ALLOWED_FILE_EXTENSIONS] }],
        },
      },
      // Ordinateur (Chrome, Edge) : « Ouvrir avec DashIA » sur un document l'ajoute au drive (plugin `launch-queue`).
      // Documents seulement : DashIA ne doit pas se proposer comme visionneuse d'images par défaut.
      file_handlers: [{
        action: '/drive',
        accept: {
          'application/pdf': ['.pdf'],
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
          'text/plain': ['.txt'],
          'text/markdown': ['.md'],
        },
      }],
    },
    injectManifest: {
      globPatterns: ['**/*.{js,css,html,png,svg,ico,woff2}'],
    },
    client: {
      installPrompt: true,
      // Une app installée reste ouverte des jours : on cherche une nouvelle version toutes les heures.
      periodicSyncForUpdates: 3600,
    },
    devOptions: {
      enabled: true,
      type: 'module',
    },
  },
});

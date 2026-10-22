export default defineNuxtConfig({
  compatibilityDate: '2026-10-01',
  devtools: { enabled: false },
  // Structure à plat décrite dans AGENTS.md (pages/, components/… à la racine de apps/web).
  srcDir: '.',
  // SPA : le shell de l'app est mis en cache par le service worker, l'historique reste lisible hors ligne.
  ssr: false,
  modules: ['@vite-pwa/nuxt'],
  css: ['@fontsource-variable/manrope', '~/assets/css/main.css'],

  app: {
    head: {
      htmlAttrs: { lang: 'fr' },
      title: 'DashIA',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        { name: 'theme-color', content: '#f7f7f5' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
      ],
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/icon.svg' },
        { rel: 'apple-touch-icon', href: '/icons/icon-192.png' },
      ],
    },
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
      start_url: '/',
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

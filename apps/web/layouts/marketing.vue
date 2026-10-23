<script setup lang="ts">
import manropeLatin from '@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2?url';

// Police du titre chargée dès le HTML : le premier affichage n'attend pas la feuille de style.
useHead({ link: [{ rel: 'preload', as: 'font', type: 'font/woff2', href: manropeLatin, crossorigin: '' }] });
</script>

<template>
  <div class="flex min-h-dvh flex-col text-base leading-normal">
    <a href="#contenu" class="sr-only z-50 rounded-sm bg-ink px-4 py-3 font-bold text-on-ink focus:not-sr-only focus:fixed focus:top-3 focus:left-3">Aller au contenu</a>
    <MarketingSiteHeader />
    <main id="contenu" tabindex="-1" class="flex-1 focus:outline-none">
      <slot />
    </main>
    <MarketingSiteFooter />
  </div>
</template>

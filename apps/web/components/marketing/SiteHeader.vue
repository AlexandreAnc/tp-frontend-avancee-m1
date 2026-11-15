<script setup lang="ts">
// Site public servi sans JavaScript : le menu mobile repose sur <details>, ouvrable au clavier et lu par les lecteurs d'écran.
const LINKS = [
  { to: '/#fonctionnalites', label: 'Fonctionnalités' },
  { to: '/#securite', label: 'Sécurité' },
  { to: '/blog', label: 'Blog' },
  { to: '/#faq', label: 'FAQ' },
];
</script>

<template>
  <header class="sticky top-0 z-20 border-b bg-surface-glass backdrop-blur">
    <div class="relative mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
      <NuxtLink to="/" class="flex min-h-11 items-center gap-2.5 text-lg font-extrabold text-text" aria-label="DashIA, accueil">
        <BrandLogo :size="32" :online="false" />
        <span aria-hidden="true">DashIA</span>
      </NuxtLink>

      <nav aria-label="Navigation principale" class="ml-6 hidden md:block">
        <ul class="flex items-center gap-1">
          <li v-for="link in LINKS" :key="link.to">
            <NuxtLink :to="link.to" class="rounded-sm px-3 py-2.5 text-[15px] font-semibold text-text hover:bg-surface-muted">{{ link.label }}</NuxtLink>
          </li>
        </ul>
      </nav>

      <div class="ml-auto flex items-center gap-2">
        <NuxtLink to="/login" class="hidden rounded-sm px-3 py-2.5 text-[15px] font-semibold text-text hover:bg-surface-muted sm:inline-block">Se connecter</NuxtLink>
        <NuxtLink to="/login?mode=register" class="btn btn-ink min-h-11 px-4 text-[15px]">Créer un compte</NuxtLink>
        <details class="group md:hidden">
          <summary class="icon-btn size-11 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
            <span class="flex group-open:hidden"><AppIcon name="grid" :size="16" /></span>
            <span class="hidden group-open:flex"><AppIcon name="xmark" :size="16" /></span>
            <span class="sr-only">Menu</span>
          </summary>
          <nav aria-label="Navigation principale (mobile)" class="absolute inset-x-0 top-16 border-y bg-surface px-4 pb-4 shadow-popover">
            <ul class="flex flex-col pt-2">
              <li v-for="link in LINKS" :key="link.to">
                <NuxtLink :to="link.to" class="block rounded-sm px-3 py-3 text-base font-semibold text-text hover:bg-surface-muted">{{ link.label }}</NuxtLink>
              </li>
              <li><NuxtLink to="/login" class="block rounded-sm px-3 py-3 text-base font-semibold text-text hover:bg-surface-muted">Se connecter</NuxtLink></li>
            </ul>
          </nav>
        </details>
      </div>
    </div>
  </header>
</template>

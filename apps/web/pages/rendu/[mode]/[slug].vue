<script setup lang="ts">
import type { Article } from '#shared/blog';
import { SITE } from '#shared/site';

/**
 * Démo du TP : la même page d'article, avec les mêmes données chargées par la même API, rendue de trois façons.
 * Le mode est imposé par les `routeRules` de `nuxt.config.ts` (`/rendu/csr`, `/rendu/ssr`, `/rendu/ssg`), pas par ce composant.
 */
definePageMeta({ layout: 'marketing', marketing: true });

const MODES = {
  csr: { label: 'CSR', name: 'rendu côté client', how: 'Le serveur envoie une page vide. Le navigateur télécharge le JavaScript, appelle l’API, puis construit l’article.' },
  ssr: { label: 'SSR', name: 'rendu serveur à chaque requête', how: 'À chaque visite, le serveur appelle l’API et renvoie l’article en HTML complet. Le navigateur l’affiche tout de suite, puis l’hydrate.' },
  ssg: { label: 'SSG', name: 'génération statique au build', how: 'Le HTML a été produit une fois, pendant la compilation. Le serveur renvoie un fichier déjà prêt, puis le navigateur l’hydrate.' },
} as const;
type Mode = keyof typeof MODES;

const route = useRoute();
const mode = String(route.params.mode) as Mode;
const slug = String(route.params.slug);
if (!(mode in MODES)) throw createError({ statusCode: 404, statusMessage: 'Mode de rendu inconnu', fatal: true });

// Typage explicite : l'URL dynamique fait exploser l'inférence des routes Nitro (TS2321).
const { data: article, error } = await useAsyncData(`article-${slug}`, () => $fetch<unknown>(`/api/blog/${slug}`) as Promise<Article>);
if (error.value) throw createError({ statusCode: 404, statusMessage: 'Article introuvable', fatal: true });

usePageSeo({
  title: `${article.value?.title ?? 'Article'} (${MODES[mode].label}) · ${SITE.name}`,
  description: `Démonstration du rendu ${MODES[mode].label} (${MODES[mode].name}) sur un article du blog DashIA.`,
  // Contenu identique à l'article du blog : c'est lui la page de référence.
  path: `/blog/${slug}`,
});
</script>

<template>
  <div>
    <aside aria-label="Mode de rendu de cette page" class="border-b bg-surface">
      <div class="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-4 sm:px-6 md:flex-row md:items-center md:justify-between">
        <p class="text-[15px]">
          <strong class="rounded-sm bg-ink px-2 py-0.5 text-on-ink" data-testid="render-mode">{{ MODES[mode].label }}</strong>
          <span class="ml-2 font-bold">{{ MODES[mode].name }}.</span>
          <span class="text-muted"> {{ MODES[mode].how }}</span>
        </p>
        <nav aria-label="Autres modes de rendu" class="flex shrink-0 gap-2">
          <NuxtLink
            v-for="(other, key) in MODES"
            :key="key"
            :to="`/rendu/${key}/${slug}`"
            :aria-current="key === mode ? 'page' : undefined"
            class="rounded-sm border px-3 py-2 text-sm font-bold"
            :class="key === mode ? 'border-ink bg-ink text-on-ink' : 'text-text hover:bg-surface-muted'"
            external
          >
            {{ other.label }}
          </NuxtLink>
        </nav>
      </div>
    </aside>
    <MarketingArticleView
      v-if="article"
      :article="article"
      :crumbs="[{ label: 'Accueil', to: '/' }, { label: 'Blog', to: '/blog' }, { label: `${article.title} (${MODES[mode].label})`, to: `/rendu/${mode}/${slug}` }]"
    />
  </div>
</template>

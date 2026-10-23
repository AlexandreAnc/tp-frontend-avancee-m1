<script setup lang="ts">
import { ARTICLE_CATEGORIES, sortedArticles } from '#shared/blog';
import { SITE, absoluteUrl } from '#shared/site';

definePageMeta({ layout: 'marketing', marketing: true });

const articles = sortedArticles();
const [pillar, ...others] = [articles.find((article) => article.category === 'guide')!, ...articles.filter((article) => article.category !== 'guide')];

usePageSeo({
  title: `Blog : documents, vie privée et maison connectée · ${SITE.name}`,
  description: 'Guides pratiques pour organiser vos documents avec une IA, protéger vos données, ne plus rater une échéance et piloter votre maison en langage naturel.',
  path: '/blog',
  jsonLd: [{
    '@type': 'Blog',
    name: `Le blog ${SITE.name}`,
    url: absoluteUrl('/blog'),
    inLanguage: 'fr-FR',
    blogPost: articles.map((article) => ({ '@type': 'BlogPosting', headline: article.title, url: absoluteUrl(`/blog/${article.slug}`), datePublished: article.publishedAt })),
  }],
});
</script>

<template>
  <div class="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:py-16">
    <MarketingBreadcrumbs :items="[{ label: 'Accueil', to: '/' }, { label: 'Blog', to: '/blog' }]" />
    <h1 class="mt-6 text-4xl leading-tight font-extrabold tracking-tight sm:text-5xl">Le blog DashIA</h1>
    <p class="mt-4 max-w-2xl text-lg leading-relaxed text-muted">
      Des guides concrets pour reprendre la main sur vos papiers, protéger vos données et rendre votre maison plus simple, avec ou sans IA.
    </p>

    <section aria-labelledby="pillar-title" class="mt-12">
      <h2 id="pillar-title" class="sr-only">Le guide pour commencer</h2>
      <div class="relative grid gap-6 rounded-xl bg-ink p-8 text-on-ink sm:p-10 lg:grid-cols-[2fr_1fr] lg:items-end">
        <div class="flex flex-col gap-3">
          <p class="text-sm font-extrabold tracking-wide uppercase opacity-80">Pour commencer · {{ ARTICLE_CATEGORIES[pillar.category] }}</p>
          <h3 class="text-2xl leading-snug font-extrabold sm:text-3xl">
            <NuxtLink :to="`/blog/${pillar.slug}`" class="text-on-ink after:absolute after:inset-0 after:content-['']">{{ pillar.title }}</NuxtLink>
          </h3>
          <p class="text-lg leading-relaxed opacity-85">{{ pillar.description }}</p>
        </div>
        <p class="font-bold lg:text-right" aria-hidden="true">Lire le guide →</p>
      </div>
    </section>

    <section aria-labelledby="all-title" class="mt-14">
      <h2 id="all-title" class="text-2xl font-extrabold">Tous les articles</h2>
      <ul class="mt-6 grid gap-5 md:grid-cols-2">
        <li v-for="article in others" :key="article.slug"><MarketingArticleCard :article="article" /></li>
      </ul>
    </section>
  </div>
</template>

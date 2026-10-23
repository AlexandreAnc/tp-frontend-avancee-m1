<script setup lang="ts">
import { ARTICLE_CATEGORIES, BLOG_AUTHOR, getArticle, plainText, readingMinutes } from '#shared/blog';
import { SITE, absoluteUrl } from '#shared/site';

definePageMeta({ layout: 'marketing', marketing: true });

const route = useRoute();
const found = getArticle(String(route.params.slug));
if (!found) throw createError({ statusCode: 404, statusMessage: 'Article introuvable', fatal: true });
const article = found;

const related = article.related.map((slug) => getArticle(slug)!).filter(Boolean);
const formatDate = (value: string) => new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date(value));
const path = `/blog/${article.slug}`;

usePageSeo({
  title: `${article.title} · ${SITE.name}`,
  description: article.description,
  path,
  type: 'article',
  publishedAt: article.publishedAt,
  updatedAt: article.updatedAt,
  jsonLd: [
    {
      '@type': 'BlogPosting',
      headline: article.title,
      description: article.description,
      abstract: article.summary.join(' '),
      url: absoluteUrl(path),
      mainEntityOfPage: absoluteUrl(path),
      datePublished: article.publishedAt,
      dateModified: article.updatedAt,
      inLanguage: 'fr-FR',
      articleSection: ARTICLE_CATEGORIES[article.category],
      timeRequired: `PT${readingMinutes(article)}M`,
      image: absoluteUrl('/og-image.png'),
      author: { '@type': 'Organization', name: BLOG_AUTHOR.name, url: absoluteUrl(BLOG_AUTHOR.url) },
      publisher: { '@type': 'Organization', name: SITE.name, logo: { '@type': 'ImageObject', url: absoluteUrl('/icons/icon-512.png') } },
    },
    {
      '@type': 'FAQPage',
      mainEntity: article.faq.map((item) => ({ '@type': 'Question', name: item.question, acceptedAnswer: { '@type': 'Answer', text: plainText(item.answer) } })),
    },
  ],
});
</script>

<template>
  <div class="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:py-16">
    <MarketingBreadcrumbs :items="[{ label: 'Accueil', to: '/' }, { label: 'Blog', to: '/blog' }, { label: article.title, to: path }]" />

    <div class="mt-8 grid gap-12 lg:grid-cols-[minmax(0,1fr)_260px]">
      <article class="max-w-[70ch]" aria-labelledby="article-title">
        <header class="flex flex-col gap-4">
          <p class="text-sm font-extrabold tracking-wide text-primary-strong uppercase">{{ ARTICLE_CATEGORIES[article.category] }}</p>
          <h1 id="article-title" class="text-3xl leading-tight font-extrabold tracking-tight text-balance sm:text-[42px]">{{ article.title }}</h1>
          <p class="text-[15px] text-muted">
            Par {{ BLOG_AUTHOR.name }} · Publié le <time :datetime="article.publishedAt">{{ formatDate(article.publishedAt) }}</time>,
            mis à jour le <time :datetime="article.updatedAt">{{ formatDate(article.updatedAt) }}</time> · {{ readingMinutes(article) }} min de lecture
          </p>
        </header>

        <!-- Réponse d'abord : ce que retiennent les lecteurs pressés et les moteurs de réponse. -->
        <section aria-labelledby="summary-title" class="mt-8 rounded-lg border-l-4 border-primary bg-primary-soft p-5">
          <h2 id="summary-title" class="text-lg font-extrabold">En bref</h2>
          <ul class="mt-3 flex list-disc flex-col gap-2 pl-5 text-[17px] leading-relaxed">
            <li v-for="point in article.summary" :key="point">{{ point }}</li>
          </ul>
        </section>

        <nav aria-labelledby="toc-title" class="mt-8 rounded-lg border bg-surface p-5 lg:hidden">
          <h2 id="toc-title" class="text-base font-extrabold">Sommaire</h2>
          <ol class="mt-3 flex list-decimal flex-col gap-2 pl-5">
            <li v-for="section in article.sections" :key="section.id"><a :href="`#${section.id}`" class="underline underline-offset-[3px]">{{ section.heading }}</a></li>
            <li><a href="#faq" class="underline underline-offset-[3px]">Questions fréquentes</a></li>
          </ol>
        </nav>

        <div class="mt-10 flex flex-col gap-10 text-[17px] leading-[1.75]">
          <section v-for="section in article.sections" :id="section.id" :key="section.id" :aria-labelledby="`${section.id}-title`" class="flex scroll-mt-24 flex-col gap-4">
            <h2 :id="`${section.id}-title`" class="text-2xl leading-snug font-extrabold">{{ section.heading }}</h2>
            <template v-for="(block, index) in section.blocks" :key="index">
              <p v-if="block.type === 'p'"><MarketingRichText :text="block.text" /></p>
              <component :is="block.ordered ? 'ol' : 'ul'" v-else-if="block.type === 'list'" class="flex flex-col gap-2 pl-6" :class="block.ordered ? 'list-decimal' : 'list-disc'">
                <li v-for="item in block.items" :key="item"><MarketingRichText :text="item" /></li>
              </component>
              <aside v-else class="rounded-lg border bg-surface p-5" :aria-label="block.title">
                <p class="font-extrabold">{{ block.title }}</p>
                <p class="mt-2"><MarketingRichText :text="block.text" /></p>
              </aside>
            </template>
          </section>

          <section id="faq" aria-labelledby="faq-title" class="flex scroll-mt-24 flex-col gap-4">
            <h2 id="faq-title" class="text-2xl leading-snug font-extrabold">Questions fréquentes</h2>
            <div v-for="item in article.faq" :key="item.question">
              <h3 class="text-lg font-extrabold">{{ item.question }}</h3>
              <p class="mt-1">{{ item.answer }}</p>
            </div>
          </section>
        </div>

        <aside aria-labelledby="article-cta" class="mt-12 flex flex-col gap-4 rounded-xl bg-ink p-7 text-on-ink">
          <h2 id="article-cta" class="text-2xl font-extrabold">Essayez DashIA</h2>
          <p class="text-lg opacity-85">Un assistant qui lit vos documents sur votre machine, cite ses sources et vous demande avant d’agir.</p>
          <div class="flex flex-wrap gap-3">
            <NuxtLink to="/login?mode=register" class="btn btn-lg border-0 bg-on-ink text-ink hover:bg-on-ink/90">Créer mon compte gratuit</NuxtLink>
            <NuxtLink to="/#fonctionnalites" class="btn btn-lg border-on-ink/40 bg-transparent text-on-ink hover:bg-on-ink/10">Découvrir les fonctionnalités</NuxtLink>
          </div>
        </aside>
      </article>

      <aside class="hidden lg:block" aria-label="Sommaire de l’article">
        <nav class="sticky top-24 rounded-lg border bg-surface p-5" aria-labelledby="toc-side-title">
          <h2 id="toc-side-title" class="text-base font-extrabold">Sommaire</h2>
          <ol class="mt-3 flex list-decimal flex-col gap-2 pl-5 text-[15px]">
            <li v-for="section in article.sections" :key="section.id"><a :href="`#${section.id}`" class="text-text underline-offset-[3px] hover:underline">{{ section.heading }}</a></li>
            <li><a href="#faq" class="text-text underline-offset-[3px] hover:underline">Questions fréquentes</a></li>
          </ol>
        </nav>
      </aside>
    </div>

    <section aria-labelledby="related-title" class="mt-16 border-t pt-12">
      <h2 id="related-title" class="text-2xl font-extrabold">À lire ensuite</h2>
      <ul class="mt-6 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        <li v-for="item in related" :key="item.slug"><MarketingArticleCard :article="item" /></li>
      </ul>
    </section>
  </div>
</template>

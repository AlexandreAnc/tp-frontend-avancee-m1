<script setup lang="ts">
import { ARTICLE_CATEGORIES, BLOG_AUTHOR, getArticle, plainText, readingMinutes } from '#shared/blog';
import { SITE, absoluteUrl } from '#shared/site';

definePageMeta({ layout: 'marketing', marketing: true });

const route = useRoute();
const found = getArticle(String(route.params.slug));
if (!found) throw createError({ statusCode: 404, statusMessage: 'Article introuvable', fatal: true });
const article = found;

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
  <MarketingArticleView :article="article" :crumbs="[{ label: 'Accueil', to: '/' }, { label: 'Blog', to: '/blog' }, { label: article.title, to: path }]" />
</template>

<script setup lang="ts">
import { ARTICLE_CATEGORIES, readingMinutes, type Article } from '#shared/blog';

const props = withDefaults(defineProps<{ article: Article; headingLevel?: 'h2' | 'h3' }>(), { headingLevel: 'h3' });
const minutes = computed(() => readingMinutes(props.article));
const date = computed(() => new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date(props.article.publishedAt)));
</script>

<template>
  <!-- Toute la carte est cliquable via le lien du titre (un seul lien, nommé par le titre). -->
  <article class="relative flex h-full flex-col gap-3 rounded-lg border bg-surface p-5 shadow-sm transition-shadow focus-within:shadow-md hover:shadow-md">
    <p class="text-xs font-extrabold tracking-wide text-primary-strong uppercase">{{ ARTICLE_CATEGORIES[article.category] }}</p>
    <component :is="headingLevel" class="text-lg leading-snug font-extrabold">
      <NuxtLink :to="`/blog/${article.slug}`" class="text-text after:absolute after:inset-0 after:content-['']">{{ article.title }}</NuxtLink>
    </component>
    <p class="text-[15px] leading-relaxed text-muted">{{ article.description }}</p>
    <p class="mt-auto text-sm text-muted"><time :datetime="article.publishedAt">{{ date }}</time> · {{ minutes }} min de lecture</p>
  </article>
</template>

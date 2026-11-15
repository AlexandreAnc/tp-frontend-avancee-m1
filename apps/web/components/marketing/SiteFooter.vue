<script setup lang="ts">
import { sortedArticles } from '#shared/blog';

const articles = sortedArticles();
</script>

<template>
  <footer class="border-t bg-surface">
    <div class="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.2fr_1fr_1.4fr_1fr]">
      <div class="flex flex-col gap-3">
        <p class="flex items-center gap-2.5 text-lg font-extrabold"><BrandLogo :size="28" :online="false" />DashIA</p>
        <p class="text-[15px] leading-relaxed text-muted">L’assistant IA personnel qui range vos documents, gère vos échéances et pilote votre maison, avec un modèle qui tourne chez vous.</p>
      </div>
      <nav aria-labelledby="footer-produit">
        <h2 id="footer-produit" class="mb-3 text-sm font-extrabold">Produit</h2>
        <ul class="flex flex-col gap-2 text-[15px]">
          <li><NuxtLink to="/#fonctionnalites" class="font-semibold text-muted hover:text-text">Fonctionnalités</NuxtLink></li>
          <li><NuxtLink to="/#agents" class="font-semibold text-muted hover:text-text">Équipe d’agents</NuxtLink></li>
          <li><NuxtLink to="/#securite" class="font-semibold text-muted hover:text-text">Sécurité et vie privée</NuxtLink></li>
          <li><NuxtLink to="/#faq" class="font-semibold text-muted hover:text-text">Questions fréquentes</NuxtLink></li>
          <li><NuxtLink to="/login?mode=register" class="font-semibold text-muted hover:text-text">Créer un compte</NuxtLink></li>
        </ul>
      </nav>
      <nav aria-labelledby="footer-blog">
        <h2 id="footer-blog" class="mb-3 text-sm font-extrabold">Derniers articles</h2>
        <ul class="flex flex-col gap-2 text-[15px]">
          <li v-for="article in articles" :key="article.slug"><NuxtLink :to="`/blog/${article.slug}`" class="font-semibold text-muted hover:text-text">{{ article.title }}</NuxtLink></li>
        </ul>
      </nav>
      <nav aria-labelledby="footer-infos">
        <h2 id="footer-infos" class="mb-3 text-sm font-extrabold">Informations</h2>
        <ul class="flex flex-col gap-2 text-[15px]">
          <li><NuxtLink to="/blog" class="font-semibold text-muted hover:text-text">Blog</NuxtLink></li>
          <li><NuxtLink to="/accessibilite" class="font-semibold text-muted hover:text-text">Accessibilité : partiellement conforme</NuxtLink></li>
          <li><a href="/sitemap.xml" class="font-semibold text-muted hover:text-text">Plan du site (XML)</a></li>
        </ul>
      </nav>
    </div>
    <p class="border-t px-4 py-5 text-center text-sm text-muted">DashIA est un projet de cours (Master 1, développement full-stack). Les articles du blog sont des contenus de démonstration.</p>
  </footer>
</template>

<script setup lang="ts">
import { SITE } from '#shared/site';

definePageMeta({ layout: 'marketing', marketing: true });

const REPORT_URL = 'https://github.com/AlexandreAnc/tp-frontend-avancee-m1/issues/new?labels=accessibilit%C3%A9';
const UPDATED_AT = '2026-10-23';

const FEATURES = [
  'Navigation complète au clavier, avec un focus toujours visible et un lien « Aller au contenu » en début de page.',
  'Structure lisible par les lecteurs d’écran : un titre principal par page, titres hiérarchisés, zones (en-tête, navigation, contenu, pied de page) et fil d’Ariane.',
  'Contrastes conformes au niveau AA, en thème clair comme en thème sombre (suivi automatique du réglage de l’appareil).',
  'Texte agrandissable jusqu’à 200 % sans perte de contenu, et mise en page adaptée aux petits écrans.',
  'Animations réduites quand l’appareil le demande (réglage « Réduire les animations »).',
  'Liens nommés par leur destination, jamais « cliquez ici » ; liens soulignés dans les textes.',
  'Pages légères et sans JavaScript : elles s’affichent vite même avec une connexion lente ou un appareil ancien, et restent utilisables si un script est bloqué.',
  'Chaque article commence par un résumé « En bref » en langage simple, et un sommaire permet d’aller directement à une partie.',
  'Dans l’app : connexion par Face ID ou empreinte (pas de mot de passe à retenir), dépôt de fichiers par bouton et non seulement par glisser-déposer, verrouillage automatique réglable ou désactivable.',
];

usePageSeo({
  title: `Déclaration d’accessibilité · ${SITE.name}`,
  description: 'État de conformité du site DashIA aux règles d’accessibilité (WCAG 2.2, RGAA), résultats des tests, limites connues et moyens de nous signaler un problème.',
  path: '/accessibilite',
});
</script>

<template>
  <div class="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:py-16">
    <MarketingBreadcrumbs :items="[{ label: 'Accueil', to: '/' }, { label: 'Accessibilité', to: '/accessibilite' }]" />
    <h1 class="mt-6 text-4xl leading-tight font-extrabold tracking-tight">Déclaration d’accessibilité</h1>
    <p class="mt-4 text-lg leading-relaxed text-muted">
      DashIA doit pouvoir être utilisé par tout le monde, y compris les personnes qui naviguent au clavier, avec un lecteur d’écran, un zoom important ou qui ont des difficultés de lecture.
    </p>

    <div class="mt-10 flex flex-col gap-10 text-[17px] leading-[1.75]">
      <section aria-labelledby="etat">
        <h2 id="etat" class="text-2xl font-extrabold">État de conformité</h2>
        <p class="mt-3">
          Le site public de DashIA (accueil, blog, cette page) est <strong>partiellement conforme</strong> aux règles WCAG 2.2 niveau AA, sur lesquelles s’appuie le RGAA.
          Ce résultat vient d’une <strong>auto-évaluation</strong> (tests automatisés et vérifications manuelles), pas d’un audit réalisé par un organisme indépendant.
        </p>
      </section>

      <section aria-labelledby="tests">
        <h2 id="tests" class="text-2xl font-extrabold">Comment c’est vérifié</h2>
        <ul class="mt-3 flex list-disc flex-col gap-2 pl-6">
          <li><strong>axe-core</strong>, à chaque modification du code : aucune erreur détectée sur l’accueil, le blog, chaque article, cette page et la page de connexion, en thème clair et en thème sombre (règles WCAG 2.0, 2.1 et 2.2, niveaux A et AA). Le test bloque la mise en production en cas d’erreur.</li>
          <li><strong>Lighthouse</strong> (le moteur de Google PageSpeed Insights), sur mobile : 100 en accessibilité sur toutes les pages du site public.</li>
          <li><strong>Parcours au clavier</strong> automatisé : le lien d’évitement, le menu mobile et les questions fréquentes s’utilisent sans souris.</li>
        </ul>
        <p class="mt-3">Les outils automatiques ne détectent qu’une partie des problèmes : les retours des personnes qui utilisent des technologies d’assistance restent indispensables.</p>
      </section>

      <section aria-labelledby="mesures">
        <h2 id="mesures" class="text-2xl font-extrabold">Ce qui est mis en place</h2>
        <ul class="mt-3 flex list-disc flex-col gap-2 pl-6">
          <li v-for="feature in FEATURES" :key="feature">{{ feature }}</li>
        </ul>
      </section>

      <section aria-labelledby="limites">
        <h2 id="limites" class="text-2xl font-extrabold">Limites connues</h2>
        <ul class="mt-3 flex list-disc flex-col gap-2 pl-6">
          <li>L’application (panel, drive, chat) n’a pas encore été évaluée écran par écran avec un lecteur d’écran.</li>
          <li>Dans l’application, quelques éléments verts à texte blanc (jour sélectionné du planning, bouton d’envoi du chat, étapes terminées de l’agent) n’atteignent pas encore le contraste AA. Correction prévue.</li>
          <li>Les documents que vous déposez (PDF, photos) gardent l’accessibilité de leur source ; l’assistant peut en revanche en lire et résumer le contenu.</li>
          <li>Les réponses de l’assistant sont produites par une IA : leur formulation peut parfois être moins simple que le reste du site.</li>
        </ul>
      </section>

      <section aria-labelledby="contact">
        <h2 id="contact" class="text-2xl font-extrabold">Signaler un problème</h2>
        <p class="mt-3">
          Un contenu ou une fonctionnalité vous est inaccessible ? Dites-le nous en
          <a :href="REPORT_URL" class="underline underline-offset-[3px]" rel="noopener">ouvrant un signalement sur le dépôt du projet<span class="sr-only"> (nouvelle page GitHub)</span></a>.
          Décrivez la page, ce que vous cherchiez à faire et l’outil utilisé (lecteur d’écran, zoom…) : nous vous proposerons une alternative.
        </p>
      </section>

      <section aria-labelledby="recours">
        <h2 id="recours" class="text-2xl font-extrabold">Voies de recours</h2>
        <p class="mt-3">
          Si vous n’obtenez pas de réponse satisfaisante, vous pouvez contacter le
          <a href="https://www.defenseurdesdroits.fr/" class="underline underline-offset-[3px]" rel="noopener">Défenseur des droits</a>.
        </p>
      </section>

      <p class="text-[15px] text-muted">Déclaration établie le <time :datetime="UPDATED_AT">23 octobre 2026</time>.</p>
    </div>
  </div>
</template>

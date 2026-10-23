<script setup lang="ts">
import { sortedArticles } from '#shared/blog';
import { SITE, absoluteUrl } from '#shared/site';
import type { IconName } from '~/utils/icons';

definePageMeta({ layout: 'marketing', marketing: true });

const FEATURES: { icon: IconName; title: string; text: string }[] = [
  { icon: 'folder-open', title: 'Un drive qui comprend vos documents', text: 'Déposez factures, contrats et photos de courrier : chaque document est lu, résumé, classé, et ses dates clés sont repérées.' },
  { icon: 'comments', title: 'Une conversation avec vos données', text: 'Posez votre question en français. La réponse cite le document source, pour que vous puissiez toujours vérifier.' },
  { icon: 'calendar-check', title: 'Planning, rappels et échéances', text: 'Des rappels push à l’heure exacte, les échéances extraites de vos documents et un résumé de la journée chaque matin.' },
  { icon: 'lightbulb', title: 'La maison en une phrase', text: '« Éteins le salon », « lance la scène Lecture » : vos lampes Philips Hue obéissent au chat comme au panel.' },
  { icon: 'nfc', title: 'Routines et tags NFC', text: 'Une routine « Je pars » éteint tout et affiche vos échéances, déclenchée à heure fixe ou en touchant un tag près de la porte.' },
  { icon: 'mobile', title: 'Une app installable, même hors ligne', text: 'Ajoutez DashIA à l’écran d’accueil sur iPhone ou Android : notifications, Face ID, et historique consultable sans réseau.' },
];

const STEPS = [
  { title: 'Déposez', text: 'Glissez vos documents ou prenez-les en photo. L’agent les analyse sur votre propre ordinateur.' },
  { title: 'Demandez', text: 'Une question, un rappel, une lumière à éteindre : écrivez-le comme vous le diriez.' },
  { title: 'Validez', text: 'Les actions engageantes vous sont présentées avant d’être faites. Vous gardez le dernier mot.' },
];

const AGENTS: { icon: IconName; name: string; text: string }[] = [
  { icon: 'file-lines', name: 'Documents', text: 'Cherche, lit et range vos fichiers.' },
  { icon: 'calendar', name: 'Planning', text: 'Consulte l’agenda, programme les rappels.' },
  { icon: 'house', name: 'Maison', text: 'Pilote les lampes, scènes et routines.' },
];

const SECURITY: { icon: IconName; title: string; text: string }[] = [
  { icon: 'desktop', title: 'Un modèle qui tourne chez vous', text: 'Par défaut, l’IA fonctionne sur votre machine : vos documents ne partent chez aucun fournisseur.' },
  { icon: 'hand', title: 'Vous validez ce qui engage', text: 'Un événement d’agenda attend votre accord ; les actions sensibles demandent Face ID ou votre empreinte.' },
  { icon: 'shield', title: 'Des agents cloisonnés', text: 'L’agent qui lit vos documents ne peut pas toucher à la maison : un document piégé ne peut pas le détourner.' },
  { icon: 'lock', title: 'Vos clés et comptes chiffrés', text: 'Clés d’API et connexions (Google, Philips Hue) sont chiffrées et ne sont jamais réaffichées.' },
];

const PROVIDERS = ['DashIA (local)', 'Claude', 'ChatGPT', 'Mistral', 'Gemini'];

const FAQ = [
  { question: 'DashIA est-il gratuit ?', answer: 'Oui. L’IA du service tourne sur votre propre machine, sans abonnement. Si vous choisissez un fournisseur externe, son usage est facturé sur votre compte chez lui, avec votre propre clé.' },
  { question: 'Mes documents sont-ils envoyés à une IA en ligne ?', answer: 'Non, par défaut. L’analyse, la recherche et l’indexation de vos documents restent toujours sur votre machine. Seule la conversation peut passer par Claude, ChatGPT, Mistral ou Gemini, et uniquement si vous l’activez.' },
  { question: 'De quel matériel ai-je besoin ?', answer: 'Un téléphone ou un ordinateur pour utiliser l’app, et un ordinateur allumé avec Ollama pour faire tourner l’agent (un Mac M2 avec 8 Go de mémoire suffit pour un petit modèle).' },
  { question: 'L’assistant peut-il agir sans mon accord ?', answer: 'Seulement pour les actions sans risque et annulables (allumer une lampe, ranger un fichier, programmer un rappel), toutes inscrites au journal. Le reste attend votre validation.' },
  { question: 'DashIA est-il accessible ?', answer: 'Le site et l’app sont conçus pour la navigation au clavier, les lecteurs d’écran et les grandes tailles de texte. Le détail est dans notre déclaration d’accessibilité.' },
];

const latest = sortedArticles().slice(0, 3);

usePageSeo({
  title: `${SITE.name} : assistant IA personnel pour vos documents, votre agenda et votre maison`,
  description: 'Rangez et interrogez vos documents, ne ratez plus une échéance et pilotez votre maison en une phrase. Un assistant IA qui tourne sur votre machine.',
  path: '/',
  jsonLd: [
    { '@type': 'Organization', name: SITE.name, url: SITE.url, logo: absoluteUrl('/icons/icon-512.png') },
    { '@type': 'WebSite', name: SITE.name, url: SITE.url, inLanguage: 'fr-FR' },
    {
      '@type': 'SoftwareApplication',
      name: SITE.name,
      applicationCategory: 'ProductivityApplication',
      operatingSystem: 'iOS, Android, macOS, Windows, Linux (application web installable)',
      description: SITE.description,
      url: SITE.url,
      inLanguage: 'fr-FR',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
      featureList: FEATURES.map((feature) => feature.title),
    },
    {
      '@type': 'FAQPage',
      mainEntity: FAQ.map((item) => ({ '@type': 'Question', name: item.question, acceptedAnswer: { '@type': 'Answer', text: item.answer } })),
    },
  ],
});
</script>

<template>
  <div>
    <!-- Hero -->
    <section aria-labelledby="hero-title" class="relative overflow-hidden">
      <div class="pointer-events-none absolute -top-32 right-[-10%] size-[420px] rounded-full bg-emerald-pale/60 blur-[60px] dark:opacity-10" aria-hidden="true" />
      <div class="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pt-14 pb-16 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:pt-20 lg:pb-24">
        <div class="flex flex-col gap-6">
          <p class="inline-flex w-fit items-center gap-2 rounded-full border bg-surface px-3 py-1.5 text-sm font-bold text-primary-strong">
            <AppIcon name="desktop" :size="13" />IA locale, vos données restent chez vous
          </p>
          <h1 id="hero-title" class="text-4xl leading-[1.1] font-extrabold tracking-tight text-balance sm:text-5xl lg:text-[56px]">
            Votre assistant IA personnel, qui travaille <span class="text-primary-strong">chez vous</span>.
          </h1>
          <p class="max-w-xl text-lg leading-relaxed text-muted">
            DashIA range et comprend vos documents, vous prévient avant chaque échéance et pilote votre maison. Vous posez la question, il trouve la réponse et cite sa source.
          </p>
          <div class="flex flex-wrap gap-3">
            <NuxtLink to="/login?mode=register" class="btn btn-ink btn-xl btn-shadow px-6">Créer mon compte gratuit</NuxtLink>
            <NuxtLink to="/#comment-ca-marche" class="btn btn-xl px-6">Voir comment ça marche</NuxtLink>
          </div>
          <ul class="flex flex-wrap gap-x-6 gap-y-2 text-[15px] font-semibold text-muted">
            <li class="flex items-center gap-2"><AppIcon name="circle-check" :size="14" class="text-primary-strong" />Sans abonnement</li>
            <li class="flex items-center gap-2"><AppIcon name="circle-check" :size="14" class="text-primary-strong" />Sources toujours citées</li>
            <li class="flex items-center gap-2"><AppIcon name="circle-check" :size="14" class="text-primary-strong" />Vous validez chaque action</li>
          </ul>
        </div>
        <MarketingPanelPreview />
      </div>
    </section>

    <!-- Comment ça marche -->
    <section id="comment-ca-marche" aria-labelledby="steps-title" class="scroll-mt-20 border-y bg-surface">
      <div class="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h2 id="steps-title" class="text-3xl leading-tight font-extrabold tracking-tight">Comment ça marche</h2>
        <p class="mt-3 max-w-2xl text-lg text-muted">Trois gestes, et vos papiers travaillent pour vous.</p>
        <ol class="mt-10 grid gap-6 md:grid-cols-3">
          <li v-for="(step, index) in STEPS" :key="step.title" class="flex flex-col gap-3">
            <span class="flex size-10 items-center justify-center rounded-full bg-ink text-lg font-extrabold text-on-ink" aria-hidden="true">{{ index + 1 }}</span>
            <h3 class="text-xl font-extrabold"><span class="sr-only">Étape {{ index + 1 }} : </span>{{ step.title }}</h3>
            <p class="leading-relaxed text-muted">{{ step.text }}</p>
          </li>
        </ol>
      </div>
    </section>

    <!-- Fonctionnalités -->
    <section id="fonctionnalites" aria-labelledby="features-title" class="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6">
      <h2 id="features-title" class="text-3xl leading-tight font-extrabold tracking-tight">Tout ce qui compte, au même endroit</h2>
      <p class="mt-3 max-w-2xl text-lg text-muted">Documents, agenda et maison réunis dans un seul panel, pilotable au doigt comme à la voix.</p>
      <ul class="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <li v-for="feature in FEATURES" :key="feature.title" class="flex flex-col gap-3 rounded-lg border bg-surface p-6 shadow-sm">
          <span class="flex size-11 items-center justify-center rounded-md bg-primary-soft text-primary-strong"><AppIcon :name="feature.icon" :size="18" /></span>
          <h3 class="text-lg font-extrabold">{{ feature.title }}</h3>
          <p class="leading-relaxed text-muted">{{ feature.text }}</p>
        </li>
      </ul>
    </section>

    <!-- Équipe d'agents -->
    <section id="agents" aria-labelledby="agents-title" class="scroll-mt-20 bg-night text-white">
      <div class="mx-auto grid max-w-6xl items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2">
        <div class="flex flex-col gap-4">
          <h2 id="agents-title" class="text-3xl leading-tight font-extrabold tracking-tight">Une équipe d’agents, pas un seul robot</h2>
          <p class="text-lg leading-relaxed text-white/80">
            Un orchestrateur comprend votre demande et la confie aux spécialistes concernés, en parallèle quand c’est possible. Chacun n’a accès qu’à ses propres outils.
          </p>
          <p class="leading-relaxed text-white/80">
            « Mes factures du mois et mon planning de la semaine » ? Les agents Documents et Planning travaillent en même temps, et le fil de la conversation montre qui a fait quoi.
          </p>
          <NuxtLink to="/blog/injection-de-prompt-assistant-ia" class="w-fit font-bold text-emerald-light underline underline-offset-4">Pourquoi ce cloisonnement vous protège</NuxtLink>
        </div>
        <div class="flex flex-col items-center gap-4">
          <div class="flex items-center gap-3 rounded-lg border border-white/15 bg-white/5 px-5 py-4">
            <AppIcon name="sitemap" :size="18" class="text-emerald-light" />
            <div><p class="font-extrabold">Orchestrateur</p><p class="text-sm text-white/70">Comprend, délègue, synthétise</p></div>
          </div>
          <span class="h-6 w-px bg-white/25" aria-hidden="true" />
          <ul class="grid w-full gap-3 sm:grid-cols-3">
            <li v-for="agent in AGENTS" :key="agent.name" class="flex flex-col gap-2 rounded-lg border border-white/15 bg-white/5 p-4">
              <AppIcon :name="agent.icon" :size="16" class="text-emerald-light" />
              <p class="font-extrabold">{{ agent.name }}</p>
              <p class="text-sm leading-snug text-white/70">{{ agent.text }}</p>
            </li>
          </ul>
        </div>
      </div>
    </section>

    <!-- Sécurité -->
    <section id="securite" aria-labelledby="security-title" class="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6">
      <h2 id="security-title" class="text-3xl leading-tight font-extrabold tracking-tight">Conçu pour la confiance</h2>
      <p class="mt-3 max-w-2xl text-lg text-muted">Un assistant qui lit vos papiers doit d’abord protéger vos papiers.</p>
      <ul class="mt-10 grid gap-5 sm:grid-cols-2">
        <li v-for="item in SECURITY" :key="item.title" class="flex gap-4 rounded-lg border bg-surface p-6 shadow-sm">
          <span class="flex size-11 shrink-0 items-center justify-center rounded-md bg-ink text-on-ink"><AppIcon :name="item.icon" :size="18" /></span>
          <div class="flex flex-col gap-2">
            <h3 class="text-lg font-extrabold">{{ item.title }}</h3>
            <p class="leading-relaxed text-muted">{{ item.text }}</p>
          </div>
        </li>
      </ul>
      <p class="mt-8 text-[15px]">
        Pour aller plus loin : <NuxtLink to="/blog/ia-locale-ou-cloud" class="underline underline-offset-[3px]">IA locale ou cloud, où vont vos données ?</NuxtLink>
      </p>
    </section>

    <!-- IA au choix -->
    <section id="ia-au-choix" aria-labelledby="providers-title" class="scroll-mt-20 border-y bg-surface">
      <div class="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-16 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        <div class="max-w-xl">
          <h2 id="providers-title" class="text-3xl leading-tight font-extrabold tracking-tight">L’IA de votre choix</h2>
          <p class="mt-3 text-lg leading-relaxed text-muted">Restez sur le modèle local, ou branchez votre propre clé pour discuter avec un grand modèle. Vous changez quand vous voulez.</p>
        </div>
        <ul class="flex flex-wrap gap-2" aria-label="Modèles disponibles">
          <li v-for="(provider, index) in PROVIDERS" :key="provider" class="rounded-full border px-4 py-2 font-bold" :class="index === 0 ? 'border-ink bg-ink text-on-ink' : 'bg-bg'">{{ provider }}</li>
        </ul>
      </div>
    </section>

    <!-- Blog -->
    <section aria-labelledby="blog-title" class="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <div class="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 id="blog-title" class="text-3xl leading-tight font-extrabold tracking-tight">Le blog</h2>
          <p class="mt-3 text-lg text-muted">Conseils pratiques pour vos documents, votre vie privée et votre maison.</p>
        </div>
        <NuxtLink to="/blog" class="font-bold underline underline-offset-[3px]">Tous les articles</NuxtLink>
      </div>
      <ul class="mt-10 grid gap-5 md:grid-cols-3">
        <li v-for="article in latest" :key="article.slug"><MarketingArticleCard :article="article" /></li>
      </ul>
    </section>

    <!-- FAQ -->
    <section id="faq" aria-labelledby="faq-title" class="scroll-mt-20 border-t bg-surface">
      <div class="mx-auto max-w-3xl px-4 py-20 sm:px-6">
        <h2 id="faq-title" class="text-3xl leading-tight font-extrabold tracking-tight">Questions fréquentes</h2>
        <div class="mt-8 flex flex-col gap-3">
          <details v-for="item in FAQ" :key="item.question" class="group rounded-lg border bg-bg">
            <summary class="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-lg font-extrabold [&::-webkit-details-marker]:hidden">
              {{ item.question }}
              <AppIcon name="chevron-down" :size="14" class="transition-transform group-open:rotate-180 motion-reduce:transition-none" />
            </summary>
            <p class="px-5 pb-5 leading-relaxed text-muted">
              {{ item.answer }}
              <NuxtLink v-if="item.question.includes('accessible')" to="/accessibilite" class="underline underline-offset-[3px]">Lire la déclaration d’accessibilité</NuxtLink>
            </p>
          </details>
        </div>
      </div>
    </section>

    <!-- Appel final -->
    <section aria-labelledby="cta-title" class="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <div class="flex flex-col items-start gap-5 rounded-2xl bg-ink p-8 text-on-ink sm:p-12 lg:flex-row lg:items-center lg:justify-between">
        <div class="max-w-xl">
          <h2 id="cta-title" class="text-3xl leading-tight font-extrabold tracking-tight">Prêt à confier vos papiers à un assistant qui reste chez vous ?</h2>
          <p class="mt-3 text-lg opacity-85">Créez votre compte en une minute, puis connectez votre agent.</p>
        </div>
        <NuxtLink to="/login?mode=register" class="btn btn-xl shrink-0 border-0 bg-on-ink px-6 text-ink hover:bg-on-ink/90">Créer mon compte gratuit</NuxtLink>
      </div>
    </section>
  </div>
</template>

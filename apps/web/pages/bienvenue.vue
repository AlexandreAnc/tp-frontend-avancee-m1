<script setup lang="ts">
definePageMeta({ layout: 'auth' });
useHead({ title: 'Bienvenue · DashIA' });

const { me, refresh } = useMe();
const push = usePush();
const step = ref(0);
const busy = ref(false);
const message = ref<string | null>(null);

onMounted(() => refresh().catch(() => {}));

const firstName = computed(() => me.value?.user.name.split(' ')[0] ?? '');

interface Step {
  title: string;
  text: string;
  cta: string;
  action?: () => Promise<void>;
}

const steps = computed<Step[]>(() => [
  {
    title: `Bienvenue ${firstName.value} 👋\nOn fait le tour ensemble ?`,
    text: "1 minute pour connecter votre agent et régler l'essentiel. Vous pourrez tout modifier plus tard.",
    cta: 'Commencer la visite',
  },
  {
    title: 'Restez informé,\nsans être dérangé',
    text: "Les actions à valider, vos rappels et le résumé du matin arrivent en notification. Sur iPhone, installez d'abord l'app sur l'écran d'accueil.",
    cta: push.subscribed.value ? 'Notifications activées ✓' : 'Activer les notifications',
    action: async () => {
      if (!push.supported.value || push.subscribed.value) return;
      await push.subscribe();
    },
  },
  {
    title: 'Déposez un premier\ndocument',
    text: "Facture, contrat, attestation… votre agent l'analyse sur votre PC : résumé, dates, montants et suggestions.",
    cta: 'Ouvrir le drive',
    action: async () => {
      await navigateTo('/drive');
    },
  },
  {
    title: 'Branchez votre\nquotidien',
    text: 'Connectez Google Agenda pour le planning, puis Philips Hue pour la maison, depuis les réglages.',
    cta: 'Terminer',
    action: async () => {
      await navigateTo('/');
    },
  },
]);

const current = computed(() => steps.value[step.value]!);

async function next() {
  message.value = null;
  busy.value = true;
  try {
    await current.value.action?.();
    if (step.value < steps.value.length - 1 && !['Ouvrir le drive', 'Terminer'].includes(current.value.cta)) step.value++;
  } catch (caught) {
    message.value = caught instanceof Error ? caught.message : 'Action impossible pour le moment.';
  } finally {
    busy.value = false;
  }
}

function skip() {
  if (step.value < steps.value.length - 1) step.value++;
  else void navigateTo('/');
}

const features = [
  { icon: 'plug', label: 'Connexion à votre PC en local' },
  { icon: 'face-smile', label: 'Face ID pour valider les actions' },
  { icon: 'bell', label: 'Notifications utiles, jamais de spam' },
] as const;
</script>

<template>
  <header class="top">
    <span class="small strong muted">Étape {{ step + 1 }} sur {{ steps.length }}</span>
    <button class="text-btn muted-btn" type="button" @click="navigateTo('/')">Passer</button>
  </header>

  <div class="progress" aria-hidden="true">
    <span v-for="(_, index) in steps" :key="index" :class="{ done: index <= step }" />
  </div>

  <section class="body">
    <div class="illustration" aria-hidden="true">
      <span class="core"><AppIcon name="microchip" :size="36" /></span>
      <span class="floating f-planning"><AppIcon name="calendar" :size="11" class="c-info" />Planning</span>
      <span class="floating f-drive"><AppIcon name="file-lines" :size="11" class="c-primary" />Drive</span>
      <span class="floating f-home"><AppIcon name="lightbulb" :size="11" class="c-warning" />Maison</span>
    </div>

    <h1 class="title">{{ current.title }}</h1>
    <p class="muted text">{{ current.text }}</p>

    <ul v-if="step === 0" class="features">
      <li v-for="feature in features" :key="feature.label">
        <span class="icon-tile tone-primary"><AppIcon :name="feature.icon" :size="12" /></span>
        <span>{{ feature.label }}</span>
      </li>
    </ul>
    <p v-if="message" class="alert alert-error">{{ message }}</p>
  </section>

  <footer class="footer">
    <button class="btn btn-primary btn-xl btn-block btn-shadow" type="button" :disabled="busy" @click="next">
      <span v-if="busy" class="spinner" />{{ current.cta }}
    </button>
    <button class="btn btn-ghost btn-block" type="button" @click="skip">Plus tard</button>
  </footer>
</template>

<style scoped>
.top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 58px 0 10px;
}

.top > span {
  margin: 0 auto;
  padding-left: 48px;
}

.muted-btn {
  color: var(--text-muted);
  font-size: 14px;
}

.progress {
  display: flex;
  gap: 6px;
  margin-top: 20px;
}

.progress span {
  flex: 1;
  height: 6px;
  border-radius: var(--radius-pill);
  background: var(--border);
}

.progress span.done {
  background: var(--primary);
}

.body {
  flex: 1;
  padding-top: 40px;
}

.illustration {
  position: relative;
  width: 176px;
  height: 176px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border);
  border-radius: 40px;
  background: var(--surface);
}

.core {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 96px;
  height: 96px;
  border-radius: var(--radius-xl);
  background: var(--ink);
  color: var(--on-ink);
}

.floating {
  position: absolute;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 7px 11px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  font-size: 11px;
  line-height: 16.5px;
  font-weight: 700;
  filter: drop-shadow(0 1px 1px rgb(0 0 0 / 0.05));
}

.f-planning {
  top: 24px;
  left: -16px;
}

.f-drive {
  top: 64px;
  right: -24px;
}

.f-home {
  bottom: -12px;
  left: -8px;
}

.c-info {
  color: var(--info);
}

.c-primary {
  color: var(--primary);
}

.c-warning {
  color: var(--warning-bright);
}

.title {
  margin-top: 40px;
  font-size: 26px;
  line-height: 32.5px;
  letter-spacing: -0.65px;
  white-space: pre-line;
}

.text {
  margin-top: 8px;
}

.features {
  list-style: none;
  margin: 24px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.features li {
  display: flex;
  align-items: center;
  gap: 12px;
  font-weight: 600;
}

.features .icon-tile {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
}

.body .alert {
  margin-top: 16px;
}

.footer {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 16px;
}
</style>

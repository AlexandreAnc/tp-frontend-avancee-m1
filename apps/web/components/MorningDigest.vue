<script setup lang="ts">
import type { AgendaItem } from '@app/shared';

const props = defineProps<{ today: AgendaItem[]; week: AgendaItem[]; pending: number }>();

/** Résumé calculé à partir du planning (le même que la notification du matin). */
const bullets = computed(() => {
  const events = props.today.filter((item) => item.kind === 'event');
  const reminders = props.today.filter((item) => item.kind === 'reminder' && item.status !== 'done');
  const deadlines = props.week.filter((item): item is Extract<AgendaItem, { kind: 'deadline' }> => item.kind === 'deadline');
  const list: { text: string; tone: 'ok' | 'alert' }[] = [];
  if (events.length) {
    const first = events[0]!;
    list.push({ text: `**${events.length} rendez-vous**, le premier à ${formatTime(first.start)} (${first.title}).`, tone: 'ok' });
  }
  if (reminders.length) list.push({ text: `**${reminders.length} rappel${reminders.length > 1 ? 's' : ''}** aujourd’hui, dont « ${reminders[0]!.title} ».`, tone: 'ok' });
  for (const deadline of deadlines.slice(0, 2)) {
    const days = daysUntil(deadline.start);
    list.push({ text: `**${deadline.title}** ${days <= 0 ? 'aujourd’hui' : `dans ${days} jour${days > 1 ? 's' : ''}`} (${deadline.fileName}).`, tone: 'alert' });
  }
  if (props.pending) list.push({ text: `**${props.pending} action${props.pending > 1 ? 's' : ''}** en attente de votre accord.`, tone: 'alert' });
  if (!list.length) list.push({ text: 'Rien de prévu : profitez de votre journée.', tone: 'ok' });
  return list;
});

const speaking = ref(false);

/** Lecture à voix haute par la synthèse vocale du navigateur (aucun envoi à un service tiers). */
function listen() {
  if (!('speechSynthesis' in window)) return;
  if (speaking.value) {
    speechSynthesis.cancel();
    speaking.value = false;
    return;
  }
  const utterance = new SpeechSynthesisUtterance(bullets.value.map((bullet) => bullet.text.replaceAll('**', '')).join(' '));
  utterance.lang = 'fr-FR';
  utterance.onend = () => (speaking.value = false);
  speaking.value = true;
  speechSynthesis.speak(utterance);
}

onBeforeUnmount(() => {
  if (speaking.value) speechSynthesis.cancel();
});
</script>

<template>
  <section class="digest">
    <span class="glow" aria-hidden="true" />
    <header class="row">
      <span class="sun"><AppIcon name="sun" :size="14" /></span>
      <div class="grow">
        <h2>Résumé du matin</h2>
        <p class="tiny sub">Calculé par votre agent à partir du planning</p>
      </div>
      <button class="listen" type="button" @click="listen"><AppIcon :name="speaking ? 'xmark' : 'play'" :size="10" />{{ speaking ? 'Arrêter' : 'Écouter' }}</button>
    </header>
    <ul>
      <!-- eslint-disable-next-line vue/no-v-html -- texte construit localement puis échappé -->
      <li v-for="bullet in bullets" :key="bullet.text" :class="bullet.tone" v-html="renderMarkdown(bullet.text)" />
    </ul>
  </section>
</template>

<style scoped>
.digest {
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px;
  border-radius: var(--radius-lg);
  background: #1c1f23;
  color: #fff;
}

.glow {
  position: absolute;
  top: -60px;
  right: -60px;
  width: 200px;
  height: 200px;
  border-radius: 50%;
  background: rgb(16 185 129 / 0.25);
  filter: blur(40px);
}

.sun {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  background: rgb(251 191 36 / 0.2);
  color: var(--amber);
}

.sub {
  color: rgb(255 255 255 / 0.6);
}

.listen {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: none;
  border-radius: var(--radius-pill);
  background: rgb(255 255 255 / 0.1);
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

li {
  position: relative;
  padding-left: 14px;
  font-size: 13px;
  line-height: 20px;
  color: rgb(255 255 255 / 0.85);
}

li::before {
  content: '';
  position: absolute;
  top: 7px;
  left: 0;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #10b981;
}

li.alert::before {
  background: #e11d48;
}

li :deep(p) {
  margin: 0;
}

li :deep(strong) {
  color: #fff;
}
</style>

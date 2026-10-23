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
  <section class="relative flex flex-col gap-3.5 overflow-hidden rounded-lg bg-night p-4 text-white">
    <span class="absolute -top-[60px] -right-[60px] size-[200px] rounded-full bg-emerald/25 blur-[40px]" aria-hidden="true" />
    <header class="flex items-center gap-2">
      <span class="inline-flex size-8 items-center justify-center rounded-sm bg-amber/20 text-amber"><AppIcon name="sun" :size="14" /></span>
      <div class="min-w-0 flex-1">
        <h2>Résumé du matin</h2>
        <p class="text-2xs text-white/60">Calculé par votre agent à partir du planning</p>
      </div>
      <button class="relative inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-[12px] font-bold text-white" type="button" @click="listen"><AppIcon :name="speaking ? 'xmark' : 'play'" :size="10" />{{ speaking ? 'Arrêter' : 'Écouter' }}</button>
    </header>
    <ul class="flex flex-col gap-2">
      <!-- eslint-disable-next-line vue/no-v-html -- texte construit localement puis échappé -->
      <li v-for="bullet in bullets" :key="bullet.text" class="relative pl-3.5 text-[13px] leading-5 text-white/85 before:absolute before:top-[7px] before:left-0 before:size-1.5 before:rounded-full [&_p]:m-0 [&_strong]:text-white" :class="bullet.tone === 'alert' ? 'before:bg-rose' : 'before:bg-emerald'" v-html="renderMarkdown(bullet.text)" />
    </ul>
  </section>
</template>

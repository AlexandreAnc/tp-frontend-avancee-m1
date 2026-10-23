<script setup lang="ts">
import type { PendingActionStatus, RiskLevel } from '@app/shared';
import type { IconName } from '~/utils/icons';

export interface ActionItem {
  id: string;
  type: string;
  payload: unknown;
  summary: string;
  status: PendingActionStatus;
  risk: RiskLevel;
  conversationId: string | null;
  expiresAt: string;
  error: string | null;
  result: unknown;
  createdAt: string;
}

const props = defineProps<{ action: ActionItem; compact?: boolean }>();
const emit = defineEmits<{ decided: [] }>();
const busy = ref(false);
const error = ref<string | null>(null);

const VISUALS: Record<string, { icon: IconName; tone: string }> = {
  'google_calendar.create_event': { icon: 'calendar-plus', tone: 'tone-primary' },
};
const visual = computed<{ icon: IconName; tone: string }>(() => VISUALS[props.action.type] ?? { icon: 'hand', tone: 'tone-warning' });

const event = computed(() => props.action.payload as { title?: string; start?: string; end?: string; location?: string });
const detail = computed(() => {
  if (props.action.type === 'google_calendar.create_event' && event.value.start) {
    return [formatDayLong(event.value.start), formatTime(event.value.start), event.value.location].filter(Boolean).join(' · ');
  }
  return null;
});
const link = computed(() => (props.action.result as { htmlLink?: string } | null)?.htmlLink ?? null);
const status = computed(() => ACTION_STATUS_LABELS[props.action.status]);

async function decide(decision: 'approve' | 'reject') {
  busy.value = true;
  error.value = null;
  try {
    await $fetch(`/api/actions/${props.action.id}/decision`, { method: 'POST', body: { decision } });
    emit('decided');
  } catch (caught) {
    error.value = getErrorMessage(caught);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <article class="flex flex-col gap-3" :class="compact ? 'rounded-md bg-surface-muted p-3.5' : 'rounded-lg border bg-surface p-4'">
    <div class="flex gap-3">
      <span class="icon-tile size-9" :class="visual.tone"><AppIcon :name="visual.icon" :size="14" /></span>
      <div class="min-w-0 flex-1">
        <div v-if="!compact" class="mb-1 flex items-center gap-2">
          <span class="badge" :class="status.tone"><AppIcon :name="status.icon" :size="10" />{{ status.label }}</span>
          <span v-if="action.risk === 'sensitive'" class="badge tone-danger">Sensible</span>
        </div>
        <h3 class="text-[14px] leading-5" :class="compact ? 'font-bold' : 'font-extrabold'">{{ action.summary }}</h3>
        <p v-if="detail" class="text-2xs text-muted">{{ detail }}</p>
        <p v-if="action.status === 'pending' && !compact" class="mt-1.5 flex items-center gap-1.5 text-2xs text-muted">
          <AppIcon name="comments" :size="10" />
          Expire {{ formatRelative(action.expiresAt) }} · sans validation, rien ne sera fait
        </p>
      </div>
    </div>

    <p v-if="action.error" class="alert alert-error">{{ action.error }}</p>
    <p v-if="error" class="alert alert-error" role="alert">{{ error }}</p>
    <a v-if="link" :href="link" target="_blank" rel="noopener" class="text-xs">Voir dans Google Agenda</a>

    <div v-if="action.status === 'pending'" class="grid grid-cols-[1fr_1fr] gap-2">
      <button class="btn" :class="{ 'min-h-8 rounded-sm text-[12px]': compact }" type="button" :disabled="busy" @click="decide('reject')">Refuser</button>
      <button class="btn btn-ink" :class="{ 'min-h-8 rounded-sm text-[12px]': compact }" type="button" :disabled="busy" @click="decide('approve')">
        <AppIcon v-if="action.risk === 'sensitive'" name="face-smile" :size="14" class="text-primary-bright" />
        Valider
      </button>
    </div>
  </article>
</template>

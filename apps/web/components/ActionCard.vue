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
  <article class="action" :class="{ compact }">
    <div class="main">
      <span class="icon-tile" :class="visual.tone"><AppIcon :name="visual.icon" :size="14" /></span>
      <div class="grow">
        <div v-if="!compact" class="row badges">
          <span class="badge" :class="status.tone"><AppIcon :name="status.icon" :size="10" />{{ status.label }}</span>
          <span v-if="action.risk === 'sensitive'" class="badge tone-danger">Sensible</span>
        </div>
        <h3 class="title">{{ action.summary }}</h3>
        <p v-if="detail" class="tiny muted">{{ detail }}</p>
        <p v-if="action.status === 'pending' && !compact" class="tiny muted meta">
          <AppIcon name="comments" :size="10" />
          Expire {{ formatRelative(action.expiresAt) }} · sans validation, rien ne sera fait
        </p>
      </div>
    </div>

    <p v-if="action.error" class="alert alert-error">{{ action.error }}</p>
    <p v-if="error" class="alert alert-error" role="alert">{{ error }}</p>
    <a v-if="link" :href="link" target="_blank" rel="noopener" class="small">Voir dans Google Agenda</a>

    <div v-if="action.status === 'pending'" class="buttons">
      <button class="btn" type="button" :disabled="busy" @click="decide('reject')">Refuser</button>
      <button class="btn btn-ink" type="button" :disabled="busy" @click="decide('approve')">
        <AppIcon v-if="action.risk === 'sensitive'" name="face-smile" :size="14" class="faceid" />
        Valider
      </button>
    </div>
  </article>
</template>

<style scoped>
.action {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
}

.action.compact {
  padding: 14px;
  border: none;
  background: var(--surface-muted);
  border-radius: var(--radius);
}

.main {
  display: flex;
  gap: 12px;
}

.main .icon-tile {
  width: 36px;
  height: 36px;
}

.badges {
  margin-bottom: 4px;
}

.title {
  font-size: 14px;
  line-height: 20px;
  font-weight: 800;
}

.compact .title {
  font-weight: 700;
}

.meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
}

.buttons {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.compact .buttons .btn {
  min-height: 32px;
  font-size: 12px;
  border-radius: var(--radius-sm);
}

.faceid {
  color: var(--primary-bright);
}
</style>

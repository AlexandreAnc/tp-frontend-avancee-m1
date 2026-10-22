<script setup lang="ts">
import type { ActionItem } from '~/components/ActionCard.vue';

defineProps<{ actions: ActionItem[]; total: number }>();
const emit = defineEmits<{ decided: [] }>();
</script>

<template>
  <PanelCard title="À valider" icon="hand" tone="danger" :count="total" :link="{ to: '/actions', label: 'Tout voir' }" :accent="total > 0">
    <div v-if="actions.length" class="stack">
      <ActionCard v-for="action in actions" :key="action.id" :action="action" compact @decided="emit('decided')" />
    </div>
    <div v-else class="empty-state">
      <span class="icon-tile tone-primary"><AppIcon name="check-double" :size="16" /></span>
      <strong>Tout est validé</strong>
      <p>Rien en attente.</p>
    </div>
  </PanelCard>
</template>

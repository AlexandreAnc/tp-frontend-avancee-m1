<script setup lang="ts">
import type { FileItem } from '~/components/FileRow.vue';

defineProps<{ files: FileItem[] }>();
</script>

<template>
  <PanelCard title="Documents" icon="folder" tone="info" :link="{ to: '/drive', label: 'Drive' }">
    <ul v-if="files.length" class="docs">
      <li v-for="file in files" :key="file.id" class="doc" @click="navigateTo({ path: '/drive', query: { preview: file.id } })">
        <FileTypeIcon :mime-type="file.mimeType" :size="36" />
        <span class="grow">
          <strong class="ellipsis">{{ file.name }}</strong>
          <span class="tiny muted ellipsis">{{ fileSubtitle(file) }}</span>
        </span>
        <FileStatusBadge :status="file.status" />
      </li>
    </ul>
    <div v-else class="empty-state">
      <span class="icon-tile tone-info"><AppIcon name="folder-open" :size="16" /></span>
      <strong>Drive vide</strong>
      <NuxtLink to="/drive" class="text-btn">Importer</NuxtLink>
    </div>
  </PanelCard>
</template>

<style scoped>
.docs {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.docs li {
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 12px;
}

.docs .grow {
  display: flex;
  flex-direction: column;
}
</style>

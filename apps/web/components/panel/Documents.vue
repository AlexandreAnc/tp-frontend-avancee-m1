<script setup lang="ts">
import type { FileItem } from '~/components/FileRow.vue';

defineProps<{ files: FileItem[] }>();
</script>

<template>
  <PanelCard title="Documents" icon="folder" tone="info" :link="{ to: '/drive', label: 'Drive' }">
    <ul v-if="files.length" class="flex flex-col gap-3">
      <li v-for="file in files" :key="file.id" class="flex cursor-pointer items-center gap-3" @click="navigateTo({ path: '/drive', query: { preview: file.id } })">
        <FileTypeIcon :mime-type="file.mimeType" :size="36" />
        <span class="flex min-w-0 flex-1 flex-col">
          <strong class="truncate">{{ file.name }}</strong>
          <span class="truncate text-2xs text-muted">{{ fileSubtitle(file) }}</span>
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

<script setup lang="ts">
defineProps<{ title: string }>();
</script>

<template>
  <section class="section">
    <h2 class="section-label">{{ title }}</h2>
    <div class="card card-flush group">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.group > :deep(* + *) {
  border-top: 1px solid var(--border);
}
</style>

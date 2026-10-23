<script setup lang="ts">
defineProps<{ title: string }>();
</script>

<template>
  <section class="flex flex-col gap-3">
    <h2 class="section-label">{{ title }}</h2>
    <div class="card card-flush [&>*+*]:border-t">
      <slot />
    </div>
  </section>
</template>

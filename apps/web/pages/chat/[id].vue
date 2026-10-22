<script setup lang="ts">
const route = useRoute();
const id = computed(() => route.params.id as string);
</script>

<template>
  <ChatView :key="id" :conversation-id="id" />
</template>

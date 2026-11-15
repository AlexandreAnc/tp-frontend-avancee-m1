<script setup lang="ts">
const route = useRoute();
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
  <!-- Le site public (landing, blog) n'a ni verrouillage ni dialogues de l'app. -->
  <template v-if="!route.meta.marketing">
    <!-- Chargés à part : le site public ne télécharge ni l'authentification ni WebAuthn. -->
    <LazyLockScreen />
    <LazyConfirmDialog />
  </template>
</template>

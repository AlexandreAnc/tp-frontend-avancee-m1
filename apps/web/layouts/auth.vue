<template>
  <main class="auth">
    <div class="blob blob-green" aria-hidden="true" />
    <div class="blob blob-blue" aria-hidden="true" />
    <div class="auth-inner">
      <slot />
    </div>
  </main>
</template>

<style scoped>
.auth {
  position: relative;
  min-height: 100dvh;
  overflow: hidden;
  display: flex;
  justify-content: center;
}

.blob {
  position: absolute;
  border-radius: 50%;
  filter: blur(32px);
  pointer-events: none;
}

.blob-green {
  top: -96px;
  right: -96px;
  width: 288px;
  height: 288px;
  background: rgb(209 250 229 / 0.6);
}

.blob-blue {
  top: 160px;
  left: -112px;
  width: 240px;
  height: 240px;
  background: var(--info-soft);
}

:root[data-theme='dark'] .blob {
  opacity: 0.15;
}

.auth-inner {
  position: relative;
  width: 100%;
  max-width: 448px;
  padding: 0 24px max(32px, env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
}
</style>

<template>
  <main class="relative flex min-h-dvh justify-center overflow-hidden">
    <div class="pointer-events-none absolute -top-24 -right-24 size-72 rounded-full bg-emerald-pale/60 blur-[32px] [:root[data-theme=dark]_&]:opacity-15" aria-hidden="true" />
    <div class="pointer-events-none absolute top-40 -left-28 size-60 rounded-full bg-info-soft blur-[32px] [:root[data-theme=dark]_&]:opacity-15" aria-hidden="true" />
    <div class="relative flex w-full max-w-md flex-col px-6 pb-[max(32px,env(safe-area-inset-bottom))]">
      <slot />
    </div>
  </main>
</template>

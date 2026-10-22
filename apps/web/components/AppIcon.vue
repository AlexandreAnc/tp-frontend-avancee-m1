<script setup lang="ts">
import { ICONS, type IconName } from '~/utils/icons';

const props = withDefaults(defineProps<{ name: IconName; size?: number; label?: string }>(), { size: 14, label: undefined });

/** La hauteur suit `size`, la largeur garde les proportions du SVG de la maquette. */
const style = computed(() => {
  const [width, height] = ICONS[props.name];
  return {
    width: `${(props.size * width) / height}px`,
    height: `${props.size}px`,
    '--icon': `url(/icons/ui/${props.name}.svg)`,
  };
});
</script>

<template>
  <span class="app-icon" :style="style" :role="label ? 'img' : undefined" :aria-label="label" :aria-hidden="label ? undefined : 'true'" />
</template>

<style scoped>
/* Le SVG d'origine sert de masque : la couleur vient du texte (tokens, thème sombre). */
.app-icon {
  display: inline-block;
  flex-shrink: 0;
  background-color: currentColor;
  -webkit-mask: var(--icon) center / contain no-repeat;
  mask: var(--icon) center / contain no-repeat;
}
</style>

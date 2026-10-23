<script setup lang="ts">
import { ICONS, type IconName } from '~/utils/icons';

const props = withDefaults(defineProps<{ name: IconName; size?: number; label?: string }>(), { size: 14, label: undefined });

/**
 * Le SVG d'origine sert de masque : la couleur vient du texte (tokens, thème sombre).
 * La hauteur suit `size`, la largeur garde les proportions du SVG de la maquette.
 */
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
  <span
    class="inline-block shrink-0 bg-current mask-(--icon) mask-contain mask-center mask-no-repeat"
    :style="style"
    :role="label ? 'img' : undefined"
    :aria-label="label"
    :aria-hidden="label ? undefined : 'true'"
  />
</template>

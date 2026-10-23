<script setup lang="ts">
import type { RoutineIcon } from '@app/shared';
import type { ApiResponse } from '#shared/types/api';

useHead({ title: 'Tags NFC · DashIA' });

type Tag = ApiResponse<'/api/tags', 'get'>['tags'][number];

const { data, refresh } = await useFetch('/api/tags', { key: 'tags' });
const { data: routinesData } = await useFetch('/api/routines', { key: 'routines' });
const { ask } = useConfirm();

const platform = ref<'android' | 'iphone'>('android');
const canWriteNfc = ref(false);
const name = ref('');
const icon = ref<RoutineIcon>('house');
const routineId = ref<string | null>(null);
const created = ref<Tag | null>(null);
const writing = ref<'idle' | 'waiting' | 'done' | 'error'>('idle');
const error = ref<string | null>(null);
const copied = ref(false);
const associating = ref<string | null>(null);

onMounted(() => {
  canWriteNfc.value = 'NDEFReader' in window;
  platform.value = /iPhone|iPad/.test(navigator.userAgent) ? 'iphone' : 'android';
  routineId.value = routinesData.value?.routines[0]?.id ?? null;
});

const tags = computed(() => data.value?.tags ?? []);
const routines = computed(() => routinesData.value?.routines ?? []);
const scans = computed(() => tags.value.reduce((sum, tag) => sum + tag.scanCount, 0));
const tagUrl = (tag: Tag) => `${window.location.origin}/t/${tag.publicId}`;

function lastUse(tag: Tag) {
  if (!tag.lastScanAt) return 'jamais scanné';
  const days = daysUntil(tag.lastScanAt);
  return days === 0 ? `aujourd’hui ${formatTime(tag.lastScanAt)}` : days === -1 ? `hier ${formatTime(tag.lastScanAt)}` : formatShortDate(tag.lastScanAt);
}

async function create() {
  error.value = null;
  try {
    const { tag } = await $fetch<{ tag: Tag }>('/api/tags', { method: 'POST', body: { name: name.value, icon: icon.value, routineId: routineId.value } });
    created.value = tag;
    await refresh();
    if (platform.value === 'android' && canWriteNfc.value) await writeTag(tag);
  } catch (caught) {
    error.value = getErrorMessage(caught);
  }
}

/** Android (Chrome) : écrit l'URL du tag directement, via Web NFC. */
async function writeTag(tag: Tag) {
  writing.value = 'waiting';
  try {
    const writer = new (window as unknown as { NDEFReader: new () => { write: (message: unknown) => Promise<void> } }).NDEFReader();
    await writer.write({ records: [{ recordType: 'url', data: tagUrl(tag) }] });
    writing.value = 'done';
  } catch (caught) {
    writing.value = 'error';
    error.value = caught instanceof Error && caught.name === 'NotAllowedError' ? 'Autorisez le NFC pour DashIA.' : "Écriture impossible : rapprochez le tag et réessayez.";
  }
}

async function copy(tag: Tag) {
  await navigator.clipboard.writeText(tagUrl(tag));
  copied.value = true;
  setTimeout(() => (copied.value = false), 2000);
}

function reset() {
  created.value = null;
  writing.value = 'idle';
  name.value = '';
  error.value = null;
}

async function associate(tag: Tag, routine: string) {
  await $fetch(`/api/tags/${tag.id}`, { method: 'PATCH', body: { routineId: routine || null } });
  associating.value = null;
  await refresh();
}

async function revoke(tag: Tag) {
  if (!await ask({ title: `Désactiver le tag « ${tag.name} » ?`, message: 'Il ne lancera plus rien, même si son URL a été copiée.', confirm: 'Désactiver', danger: true })) return;
  await $fetch(`/api/tags/${tag.id}`, { method: 'DELETE' });
  await refresh();
}

const ICON_CHOICES: RoutineIcon[] = ['house', 'door-exit', 'bed', 'laptop', 'car', 'mug', 'moon', 'sun'];
</script>

<template>
  <div>
    <PageHeader title="Tags NFC" :subtitle="`${tags.length} tag${tags.length > 1 ? 's' : ''} · ${scans} scan${scans > 1 ? 's' : ''}`" back="/plus" />

    <main class="page lg:grid lg:grid-cols-2 lg:items-start">
      <section class="flex flex-col gap-3">
        <h2 class="section-label">1 · Mes tags</h2>
        <div v-if="tags.length" class="card card-flush [&>*+*]:border-t">
          <div v-for="tag in tags" :key="tag.id" class="flex items-center gap-3 p-4">
            <span class="icon-tile round" :class="ROUTINE_ICON_TONES[tag.icon]"><AppIcon :name="tag.icon" :size="14" /></span>
            <span class="flex min-w-0 flex-1 flex-col">
              <strong class="font-extrabold">{{ tag.name }}</strong>
              <span class="truncate text-xs text-muted">{{ tag.routineName ? `→ ${tag.routineName} · ${lastUse(tag)}` : 'Aucune routine associée' }}</span>
            </span>
            <select v-if="associating === tag.id" class="input min-h-8 w-auto text-[12px]" :value="tag.routineId ?? ''" aria-label="Routine du tag" @change="associate(tag, ($event.target as HTMLSelectElement).value)">
              <option value="">Aucune</option>
              <option v-for="routine in routines" :key="routine.id" :value="routine.id">{{ routine.name }}</option>
            </select>
            <button v-else-if="!tag.routineId" class="text-btn" type="button" @click="associating = tag.id">Associer</button>
            <button v-else class="cursor-pointer px-1.5 py-px text-2xs font-extrabold text-muted" type="button" :title="'Changer la routine'" @click="associating = tag.id">{{ tag.scanCount }}×</button>
            <button class="icon-btn size-7" type="button" :aria-label="`Désactiver ${tag.name}`" @click="revoke(tag)"><AppIcon name="trash" :size="11" /></button>
          </div>
        </div>
        <div v-else class="empty-state">
          <span class="icon-tile tone-primary"><AppIcon name="nfc" :size="16" /></span>
          <strong>Aucun tag</strong>
          <p>Collez un tag NFC à l'entrée, sur la table de chevet… et lancez une routine d'un simple tap.</p>
        </div>
      </section>

      <section class="flex flex-col gap-3">
        <h2 class="section-label">2 · Ajouter un tag</h2>
        <div class="segmented">
          <button type="button" :class="{ active: platform === 'android' }" @click="platform = 'android'"><AppIcon name="android" :size="14" />Android</button>
          <button type="button" :class="{ active: platform === 'iphone' }" @click="platform = 'iphone'"><AppIcon name="apple" :size="14" />iPhone</button>
        </div>

        <div class="card flex flex-col items-stretch gap-3.5 rounded-xl p-5">
          <template v-if="!created">
            <label class="field">
              <span class="field-label">Nom du tag</span>
              <input v-model="name" class="input" maxlength="60" placeholder="Porte d'entrée" required>
            </label>
            <div class="flex flex-wrap gap-2" role="radiogroup" aria-label="Icône du tag">
              <button v-for="item in ICON_CHOICES" :key="item" type="button" class="icon-tile round cursor-pointer border-2" :class="[ROUTINE_ICON_TONES[item], icon === item ? 'border-ink' : 'border-transparent']" role="radio" :aria-checked="icon === item" :aria-label="item" @click="icon = item">
                <AppIcon :name="item" :size="13" />
              </button>
            </div>
            <label class="field">
              <span class="field-label">Routine à lancer</span>
              <select v-model="routineId" class="input">
                <option :value="null">Aucune pour l'instant</option>
                <option v-for="routine in routines" :key="routine.id" :value="routine.id">{{ routine.name }}</option>
              </select>
            </label>
            <p v-if="platform === 'android' && !canWriteNfc" class="alert alert-warning">Ce navigateur ne peut pas écrire de tag : utilisez Chrome sur Android, ou la méthode iPhone (copier l'URL).</p>
            <button class="btn btn-ink btn-lg btn-block" type="button" :disabled="!name.trim()" @click="create">
              {{ platform === 'android' && canWriteNfc ? 'Écrire le tag' : 'Créer le tag' }}
            </button>
          </template>

          <!-- Android : écriture -->
          <template v-else-if="platform === 'android' && canWriteNfc">
            <div class="relative mx-auto size-40" aria-hidden="true">
              <span class="ring-pulse absolute inset-0 rounded-full border-2 border-emerald-deep/20" /><span class="absolute inset-5 rounded-full border-2 border-emerald-deep/30" /><span class="absolute inset-10 flex items-center justify-center rounded-full bg-primary-soft text-primary-strong"><AppIcon name="mobile" :size="34" /></span>
            </div>
            <h3 class="text-center text-base">{{ writing === 'done' ? 'Tag écrit ✓' : 'Approchez le tag du dos du téléphone' }}</h3>
            <p class="text-center text-xs text-muted">DashIA écrit le tag directement — aucune autre app nécessaire.</p>
            <p class="flex items-center justify-center gap-2 rounded-md bg-surface-muted px-3 py-2.5 text-xs font-extrabold text-muted">
              <template v-if="writing === 'waiting'"><span class="spinner" /> En attente du tag…</template>
              <template v-else-if="writing === 'done'"><AppIcon name="circle-check" :size="12" /> « {{ created.name }} » est prêt.</template>
              <template v-else-if="writing === 'error'"><button class="text-btn" type="button" @click="writeTag(created)">Réessayer l'écriture</button></template>
            </p>
            <button class="btn btn-block" type="button" @click="reset">{{ writing === 'done' ? 'Ajouter un autre tag' : 'Annuler' }}</button>
          </template>

          <!-- iPhone : URL à copier -->
          <template v-else>
            <h3 class="text-center text-base">Écrivez cette adresse sur le tag</h3>
            <code class="block p-3 break-all select-all">{{ tagUrl(created) }}</code>
            <button class="btn btn-ink btn-block" type="button" @click="copy(created)"><AppIcon name="file-export" :size="12" />{{ copied ? 'Copiée ✓' : 'Copier l’adresse' }}</button>
            <ol class="flex flex-col gap-1.5 text-xs text-muted">
              <li><strong>1.</strong> Installez une app d'écriture NFC (ex. « NFC Tools »).</li>
              <li><strong>2.</strong> Choisissez « Écrire » → « URL » et collez l'adresse.</li>
              <li><strong>3.</strong> Approchez le tag du haut de l'iPhone. Ensuite, un simple tap ouvre DashIA.</li>
            </ol>
            <button class="btn btn-block" type="button" @click="reset">Terminé</button>
          </template>
          <p v-if="error" class="alert alert-error">{{ error }}</p>
        </div>
      </section>
    </main>
  </div>
</template>

<style scoped>
/* Halo qui pulse autour du téléphone pendant l'écriture du tag. */
.ring-pulse {
  animation: ring-pulse 2s ease-out infinite;
}

@keyframes ring-pulse {
  50% {
    transform: scale(1.05);
    opacity: 0.6;
  }
}
</style>

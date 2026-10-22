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

    <main class="page tags-page">
      <section class="section">
        <h2 class="section-label">1 · Mes tags</h2>
        <div v-if="tags.length" class="card card-flush">
          <div v-for="tag in tags" :key="tag.id" class="tag-row">
            <span class="icon-tile round" :class="ROUTINE_ICON_TONES[tag.icon]"><AppIcon :name="tag.icon" :size="14" /></span>
            <span class="grow">
              <strong>{{ tag.name }}</strong>
              <span class="small muted ellipsis">{{ tag.routineName ? `→ ${tag.routineName} · ${lastUse(tag)}` : 'Aucune routine associée' }}</span>
            </span>
            <select v-if="associating === tag.id" class="input mini" :value="tag.routineId ?? ''" aria-label="Routine du tag" @change="associate(tag, ($event.target as HTMLSelectElement).value)">
              <option value="">Aucune</option>
              <option v-for="routine in routines" :key="routine.id" :value="routine.id">{{ routine.name }}</option>
            </select>
            <button v-else-if="!tag.routineId" class="text-btn" type="button" @click="associating = tag.id">Associer</button>
            <button v-else class="tiny muted strong count" type="button" :title="'Changer la routine'" @click="associating = tag.id">{{ tag.scanCount }}×</button>
            <button class="icon-btn small-btn" type="button" :aria-label="`Désactiver ${tag.name}`" @click="revoke(tag)"><AppIcon name="trash" :size="11" /></button>
          </div>
        </div>
        <div v-else class="empty-state">
          <span class="icon-tile tone-primary"><AppIcon name="nfc" :size="16" /></span>
          <strong>Aucun tag</strong>
          <p>Collez un tag NFC à l'entrée, sur la table de chevet… et lancez une routine d'un simple tap.</p>
        </div>
      </section>

      <section class="section">
        <h2 class="section-label">2 · Ajouter un tag</h2>
        <div class="segmented">
          <button type="button" :class="{ active: platform === 'android' }" @click="platform = 'android'"><AppIcon name="android" :size="14" />Android</button>
          <button type="button" :class="{ active: platform === 'iphone' }" @click="platform = 'iphone'"><AppIcon name="apple" :size="14" />iPhone</button>
        </div>

        <div class="card add">
          <template v-if="!created">
            <label class="field">
              <span class="field-label">Nom du tag</span>
              <input v-model="name" class="input" maxlength="60" placeholder="Porte d'entrée" required>
            </label>
            <div class="icon-row" role="radiogroup" aria-label="Icône du tag">
              <button v-for="item in ICON_CHOICES" :key="item" type="button" class="icon-tile round" :class="[ROUTINE_ICON_TONES[item], { picked: icon === item }]" role="radio" :aria-checked="icon === item" :aria-label="item" @click="icon = item">
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
            <div class="rings" aria-hidden="true">
              <span class="ring r1" /><span class="ring r2" /><span class="core"><AppIcon name="mobile" :size="34" /></span>
            </div>
            <h3>{{ writing === 'done' ? 'Tag écrit ✓' : 'Approchez le tag du dos du téléphone' }}</h3>
            <p class="small muted center">DashIA écrit le tag directement — aucune autre app nécessaire.</p>
            <p class="status small strong">
              <template v-if="writing === 'waiting'"><span class="spinner" /> En attente du tag…</template>
              <template v-else-if="writing === 'done'"><AppIcon name="circle-check" :size="12" /> « {{ created.name }} » est prêt.</template>
              <template v-else-if="writing === 'error'"><button class="text-btn" type="button" @click="writeTag(created)">Réessayer l'écriture</button></template>
            </p>
            <button class="btn btn-block" type="button" @click="reset">{{ writing === 'done' ? 'Ajouter un autre tag' : 'Annuler' }}</button>
          </template>

          <!-- iPhone : URL à copier -->
          <template v-else>
            <h3>Écrivez cette adresse sur le tag</h3>
            <code class="url">{{ tagUrl(created) }}</code>
            <button class="btn btn-ink btn-block" type="button" @click="copy(created)"><AppIcon name="file-export" :size="12" />{{ copied ? 'Copiée ✓' : 'Copier l’adresse' }}</button>
            <ol class="tuto small">
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
.tags-page {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.tag-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
}

.tag-row + .tag-row {
  border-top: 1px solid var(--border);
}

.tag-row .grow {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.tag-row strong {
  font-weight: 800;
}

.count {
  border: none;
  background: none;
  cursor: pointer;
}

.input.mini {
  width: auto;
  min-height: 32px;
  font-size: 12px;
}

.small-btn {
  width: 28px;
  height: 28px;
}

.add {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 14px;
  padding: 20px;
  border-radius: var(--radius-xl);
}

.add h3 {
  font-size: 16px;
  line-height: 24px;
  text-align: center;
}

.icon-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.icon-row .icon-tile {
  border: 2px solid transparent;
  cursor: pointer;
}

.icon-row .picked {
  border-color: var(--ink);
}

.rings {
  position: relative;
  width: 160px;
  height: 160px;
  margin: 0 auto;
}

.ring,
.core {
  position: absolute;
  border-radius: 50%;
}

.r1 {
  inset: 0;
  border: 2px solid rgb(5 150 105 / 0.2);
  animation: pulse 2s ease-out infinite;
}

.r2 {
  inset: 20px;
  border: 2px solid rgb(5 150 105 / 0.3);
}

.core {
  inset: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--primary-soft);
  color: var(--primary-strong);
}

@keyframes pulse {
  50% {
    transform: scale(1.05);
    opacity: 0.6;
  }
}

.status {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: var(--radius);
  background: var(--surface-muted);
  color: var(--text-muted);
}

.center {
  text-align: center;
}

.url {
  display: block;
  padding: 12px;
  word-break: break-all;
  user-select: all;
}

.tuto {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: var(--text-muted);
}

@media (min-width: 1024px) {
  .tags-page {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    align-items: start;
  }
}
</style>

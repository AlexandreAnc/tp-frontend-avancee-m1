<script setup lang="ts">
import { ROUTINE_ICONS, type RoutineIcon, type RoutineInput, type RoutineStep } from '@app/shared';

const props = defineProps<{ initial: Omit<RoutineInput, 'enabled'> & { id?: string } }>();
const emit = defineEmits<{ saved: []; cancel: [] }>();

const { home, refresh: refreshHome } = useHome();
onMounted(() => {
  if (!home.value) void refreshHome();
});

type Trigger = 'time' | 'nfc' | 'manual';
const STEPS = ['Déclencheur', 'Actions', 'Récap'] as const;
const step = ref(0);
const trigger = ref<Trigger>(props.initial.schedule ? 'time' : 'manual');
const time = ref(props.initial.schedule?.time ?? '07:30');
const days = ref<number[]>(props.initial.schedule?.days ?? [1, 2, 3, 4, 5]);
const name = ref(props.initial.name);
const icon = ref<RoutineIcon>(props.initial.icon);
const actions = ref<RoutineStep[]>(structuredClone(toRaw(props.initial.steps)));
const busy = ref(false);
const error = ref<string | null>(null);

const TRIGGERS: { id: Trigger; icon: 'clock' | 'nfc' | 'hand-pointer'; title: string; hint: string }[] = [
  { id: 'time', icon: 'clock', title: 'À une heure', hint: 'ex. 07:30' },
  { id: 'nfc', icon: 'nfc', title: 'Tag NFC', hint: 'Au tap du téléphone' },
  { id: 'manual', icon: 'hand-pointer', title: 'Manuel', hint: "Depuis l'app ou l'agent" },
];
const DAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

function toggleDay(day: number) {
  days.value = days.value.includes(day) ? days.value.filter((item) => item !== day) : [...days.value, day];
}

const rooms = computed(() => (home.value?.rooms ?? []).filter((room) => room.kind === 'room'));
const scenes = computed(() => home.value?.scenes ?? []);

type NewStep = 'room' | 'scene' | 'reminder' | 'notify' | 'agent';
function addStep(kind: NewStep) {
  const factories: Record<NewStep, () => RoutineStep> = {
    room: () => ({ type: 'hue.set_room', payload: { roomId: 'all', on: false }, label: 'Éteindre toutes les lampes' }),
    scene: () => ({ type: 'hue.activate_scene', payload: { sceneId: scenes.value[0]?.id ?? '' }, label: `Scène « ${scenes.value[0]?.name ?? ''} »` }),
    reminder: () => ({ type: 'reminder', text: 'Rappel', offsetMinutes: 60, label: 'Rappel dans 1 h' }),
    notify: () => ({ type: 'notify', text: 'Bonne journée !', label: 'Notification' }),
    agent: () => ({ type: 'agent', prompt: 'Fais-moi le résumé de ma journée.', label: 'Question à l’agent' }),
  };
  actions.value.push(factories[kind]());
}

/** Libellé automatique d'une étape pièce/scène après modification. */
function relabel(item: RoutineStep) {
  if (item.type === 'hue.set_room') {
    const target = item.payload.roomId === 'all' ? 'toute la maison' : rooms.value.find((room) => room.id === item.payload.roomId)?.name ?? 'la pièce';
    item.label = item.payload.on === false ? `Éteindre ${target}` : item.payload.brightness ? `${target} à ${item.payload.brightness} %` : `Allumer ${target}`;
  } else if (item.type === 'hue.activate_scene') {
    item.label = `Scène « ${scenes.value.find((sceneItem) => sceneItem.id === item.payload.sceneId)?.name ?? ''} »`;
  } else if (item.type === 'reminder') {
    item.label = `Rappel « ${item.text} » dans ${item.offsetMinutes >= 60 ? `${Math.round(item.offsetMinutes / 60)} h` : `${item.offsetMinutes} min`}`;
  }
}

function setRoomMode(item: Extract<RoutineStep, { type: 'hue.set_room' }>, mode: string) {
  item.payload = mode === 'off' ? { roomId: item.payload.roomId, on: false } : { roomId: item.payload.roomId, on: true, ...(mode === 'on' ? {} : { brightness: Number(mode) }) };
  relabel(item);
}

function roomMode(item: Extract<RoutineStep, { type: 'hue.set_room' }>) {
  if (item.payload.on === false) return 'off';
  return item.payload.brightness ? String(item.payload.brightness) : 'on';
}

const canContinue = computed(() => {
  if (step.value === 0) return trigger.value !== 'time' || days.value.length > 0;
  if (step.value === 1) return actions.value.length > 0;
  return name.value.trim().length > 0;
});

async function save() {
  busy.value = true;
  error.value = null;
  const body: RoutineInput = {
    name: name.value.trim(),
    icon: icon.value,
    enabled: true,
    schedule: trigger.value === 'time' ? { time: time.value, days: [...days.value].sort() } : null,
    steps: actions.value,
  };
  try {
    if (props.initial.id) await $fetch(`/api/routines/${props.initial.id}`, { method: 'PATCH', body });
    else await $fetch('/api/routines', { method: 'POST', body });
    emit('saved');
    if (trigger.value === 'nfc') await navigateTo('/tags');
  } catch (caught) {
    error.value = getErrorMessage(caught);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="editor">
    <div class="progress">
      <div v-for="(label, index) in STEPS" :key="label" class="progress-step" :class="{ done: index <= step }">
        <span />{{ label }}
      </div>
    </div>

    <!-- 1. Déclencheur -->
    <template v-if="step === 0">
      <h2 class="question">Quand la routine démarre-t-elle ?</h2>
      <div class="options">
        <button v-for="option in TRIGGERS" :key="option.id" type="button" class="option" :class="{ active: trigger === option.id, wide: option.id === 'manual' }" @click="trigger = option.id">
          <AppIcon :name="option.icon" :size="16" />
          <strong>{{ option.title }}</strong>
          <span class="tiny muted">{{ option.hint }}</span>
        </button>
      </div>
      <template v-if="trigger === 'time'">
        <label class="time-box">
          <span class="muted strong">Heure</span>
          <input v-model="time" type="time" required>
        </label>
        <div class="days" role="group" aria-label="Jours">
          <button v-for="(label, index) in DAYS" :key="index" type="button" class="day" :class="{ active: days.includes(index + 1) }" :aria-pressed="days.includes(index + 1)" @click="toggleDay(index + 1)">{{ label }}</button>
        </div>
      </template>
      <p v-else-if="trigger === 'nfc'" class="alert alert-info">Après l'enregistrement, associez la routine à un tag dans « Tags NFC ».</p>
    </template>

    <!-- 2. Actions -->
    <template v-else-if="step === 1">
      <h2 class="question">Que doit faire la routine ?</h2>
      <ol class="actions">
        <li v-for="(item, index) in actions" :key="index" class="action">
          <div class="row between">
            <strong class="small">{{ index + 1 }}. {{ item.label }}</strong>
            <button class="icon-btn small-btn" type="button" aria-label="Retirer l'étape" @click="actions.splice(index, 1)"><AppIcon name="xmark" :size="10" /></button>
          </div>
          <div v-if="item.type === 'hue.set_room'" class="fields">
            <select v-model="item.payload.roomId" class="input" @change="relabel(item)">
              <option value="all">Toute la maison</option>
              <option v-for="room in rooms" :key="room.id" :value="room.id">{{ room.name }}</option>
            </select>
            <select class="input" :value="roomMode(item)" @change="setRoomMode(item, ($event.target as HTMLSelectElement).value)">
              <option value="off">Éteindre</option>
              <option value="on">Allumer</option>
              <option value="20">Allumer à 20 %</option>
              <option value="40">Allumer à 40 %</option>
              <option value="70">Allumer à 70 %</option>
              <option value="100">Allumer à 100 %</option>
            </select>
          </div>
          <select v-else-if="item.type === 'hue.activate_scene'" v-model="item.payload.sceneId" class="input" @change="relabel(item)">
            <option v-for="sceneItem in scenes" :key="sceneItem.id" :value="sceneItem.id">{{ sceneItem.name }}</option>
          </select>
          <div v-else-if="item.type === 'reminder'" class="fields">
            <input v-model="item.text" class="input" maxlength="300" placeholder="Texte du rappel" @change="relabel(item)">
            <select v-model.number="item.offsetMinutes" class="input" @change="relabel(item)">
              <option :value="15">dans 15 min</option>
              <option :value="30">dans 30 min</option>
              <option :value="60">dans 1 h</option>
              <option :value="90">dans 1 h 30</option>
              <option :value="180">dans 3 h</option>
              <option :value="720">dans 12 h</option>
            </select>
          </div>
          <input v-else-if="item.type === 'notify'" v-model="item.text" class="input" maxlength="300" placeholder="Texte de la notification">
          <textarea v-else-if="item.type === 'agent'" v-model="item.prompt" class="input" rows="2" maxlength="1000" placeholder="Question posée à l'agent" />
          <input v-if="item.type === 'notify' || item.type === 'agent'" v-model="item.label" class="input" maxlength="120" placeholder="Nom de l'étape">
        </li>
      </ol>
      <div class="add">
        <span class="small muted strong">Ajouter</span>
        <div class="chips">
          <button class="chip" type="button" @click="addStep('room')"><AppIcon name="lightbulb" :size="12" />Pièce</button>
          <button class="chip" type="button" :disabled="!scenes.length" @click="addStep('scene')"><AppIcon name="book-open" :size="12" />Scène</button>
          <button class="chip" type="button" @click="addStep('reminder')"><AppIcon name="bell" :size="12" />Rappel</button>
          <button class="chip" type="button" @click="addStep('notify')"><AppIcon name="paper-plane" :size="12" />Notification</button>
          <button class="chip" type="button" @click="addStep('agent')"><AppIcon name="microchip" :size="12" />Question à l'agent</button>
        </div>
        <p v-if="!home?.connected" class="tiny muted">Philips Hue n'est pas connecté : les étapes lumières échoueront tant qu'il ne l'est pas.</p>
      </div>
    </template>

    <!-- 3. Récap -->
    <template v-else>
      <h2 class="question">On l'appelle comment ?</h2>
      <input v-model="name" class="input" maxlength="80" placeholder="Bonne nuit" required>
      <div class="icons" role="radiogroup" aria-label="Icône">
        <button v-for="item in ROUTINE_ICONS" :key="item" type="button" class="icon-tile" :class="[ROUTINE_ICON_TONES[item], { picked: icon === item }]" role="radio" :aria-checked="icon === item" :aria-label="item" @click="icon = item">
          <AppIcon :name="item" :size="14" />
        </button>
      </div>
      <div class="recap small">
        <p><strong>Déclencheur :</strong> {{ trigger === 'time' ? `${time} · ${describeDays(days)}` : trigger === 'nfc' ? 'tag NFC' : 'manuel' }}</p>
        <p><strong>{{ actions.length }} étape{{ actions.length > 1 ? 's' : '' }} :</strong> {{ actions.map((item) => item.label).join(' → ') }}</p>
        <p class="muted">Niveau : action directe, sans validation (chaque action reste annulable depuis le journal).</p>
      </div>
    </template>

    <p v-if="error" class="alert alert-error">{{ error }}</p>
    <div class="nav">
      <button class="btn btn-lg" type="button" @click="step === 0 ? emit('cancel') : step--">{{ step === 0 ? 'Annuler' : 'Retour' }}</button>
      <button v-if="step < STEPS.length - 1" class="btn btn-ink btn-lg" type="button" :disabled="!canContinue" @click="step++">Continuer</button>
      <button v-else class="btn btn-primary btn-lg" type="button" :disabled="!canContinue || busy" @click="save">{{ initial.id ? 'Enregistrer' : 'Créer la routine' }}</button>
    </div>
  </section>
</template>

<style scoped>
.editor {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px;
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  background: var(--surface);
}

.progress {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
}

.progress-step {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 11px;
  font-weight: 700;
  color: var(--text-muted);
}

.progress-step span {
  height: 6px;
  border-radius: var(--radius-pill);
  background: var(--border);
}

.progress-step.done {
  color: var(--text);
}

.progress-step.done span {
  background: var(--primary);
}

.question {
  font-size: 18px;
  line-height: 24px;
}

.options {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.option {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  padding: 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
  text-align: left;
  cursor: pointer;
}

.option.wide {
  grid-column: 1 / -1;
}

.option.active {
  border: 2px solid var(--primary);
  padding: 13px;
  background: var(--primary-soft);
}

.option strong {
  font-weight: 800;
}

.time-box {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-radius: var(--radius-lg);
  background: var(--surface-muted);
}

.time-box input {
  border: none;
  background: none;
  font-size: 22px;
  font-weight: 800;
}

.days {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 6px;
}

.day {
  height: 36px;
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  background: var(--surface);
  font-weight: 800;
  cursor: pointer;
}

.day.active {
  border-color: var(--ink);
  background: var(--ink);
  color: var(--on-ink);
}

.actions {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.action {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border-radius: var(--radius);
  background: var(--surface-muted);
}

.fields {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.small-btn {
  width: 24px;
  height: 24px;
}

.add {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.chips {
  flex-wrap: wrap;
}

.icons {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.icons .icon-tile {
  border: 2px solid transparent;
  cursor: pointer;
}

.icons .picked {
  border-color: var(--ink);
}

.recap {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px;
  border-radius: var(--radius);
  background: var(--surface-muted);
}

.nav {
  display: grid;
  grid-template-columns: 1fr 2fr;
  gap: 8px;
}
</style>

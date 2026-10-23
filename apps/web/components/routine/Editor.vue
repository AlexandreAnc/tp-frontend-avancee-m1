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
  <section class="flex flex-col gap-4 rounded-xl border bg-surface p-5">
    <div class="grid grid-cols-[repeat(3,1fr)] gap-1.5">
      <div v-for="(label, index) in STEPS" :key="label" class="flex flex-col gap-1.5 text-[11px] font-bold" :class="index <= step ? 'text-text' : 'text-muted'">
        <span class="h-1.5 rounded-full" :class="index <= step ? 'bg-primary' : 'bg-border'" />{{ label }}
      </div>
    </div>

    <!-- 1. Déclencheur -->
    <template v-if="step === 0">
      <h2 class="text-[18px] leading-6">Quand la routine démarre-t-elle ?</h2>
      <div class="grid grid-cols-[1fr_1fr] gap-2">
        <button v-for="option in TRIGGERS" :key="option.id" type="button" class="flex cursor-pointer flex-col items-start gap-1 rounded-lg text-left" :class="[trigger === option.id ? 'border-2 border-primary bg-primary-soft p-[13px]' : 'border bg-surface p-3.5', { 'col-span-full': option.id === 'manual' }]" @click="trigger = option.id">
          <AppIcon :name="option.icon" :size="16" />
          <strong class="font-extrabold">{{ option.title }}</strong>
          <span class="text-2xs text-muted">{{ option.hint }}</span>
        </button>
      </div>
      <template v-if="trigger === 'time'">
        <label class="flex items-center justify-between rounded-lg bg-surface-muted px-4 py-3">
          <span class="font-extrabold text-muted">Heure</span>
          <input v-model="time" class="pl-px text-[22px] font-extrabold" type="time" required>
        </label>
        <div class="grid grid-cols-[repeat(7,1fr)] gap-1.5" role="group" aria-label="Jours">
          <button v-for="(label, index) in DAYS" :key="index" type="button" class="h-9 cursor-pointer rounded-full border font-extrabold" :class="days.includes(index + 1) ? 'border-ink bg-ink text-on-ink' : 'bg-surface'" :aria-pressed="days.includes(index + 1)" @click="toggleDay(index + 1)">{{ label }}</button>
        </div>
      </template>
      <p v-else-if="trigger === 'nfc'" class="alert alert-info">Après l'enregistrement, associez la routine à un tag dans « Tags NFC ».</p>
    </template>

    <!-- 2. Actions -->
    <template v-else-if="step === 1">
      <h2 class="text-[18px] leading-6">Que doit faire la routine ?</h2>
      <ol class="flex flex-col gap-2.5">
        <li v-for="(item, index) in actions" :key="index" class="flex flex-col gap-2 rounded-md bg-surface-muted p-3">
          <div class="flex items-center justify-between gap-2">
            <strong class="text-xs">{{ index + 1 }}. {{ item.label }}</strong>
            <button class="icon-btn size-6" type="button" aria-label="Retirer l'étape" @click="actions.splice(index, 1)"><AppIcon name="xmark" :size="10" /></button>
          </div>
          <div v-if="item.type === 'hue.set_room'" class="grid grid-cols-[1fr_1fr] gap-2">
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
          <div v-else-if="item.type === 'reminder'" class="grid grid-cols-[1fr_1fr] gap-2">
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
      <div class="flex flex-col gap-2">
        <span class="text-xs font-extrabold text-muted">Ajouter</span>
        <div class="chips flex-wrap">
          <button class="chip" type="button" @click="addStep('room')"><AppIcon name="lightbulb" :size="12" />Pièce</button>
          <button class="chip" type="button" :disabled="!scenes.length" @click="addStep('scene')"><AppIcon name="book-open" :size="12" />Scène</button>
          <button class="chip" type="button" @click="addStep('reminder')"><AppIcon name="bell" :size="12" />Rappel</button>
          <button class="chip" type="button" @click="addStep('notify')"><AppIcon name="paper-plane" :size="12" />Notification</button>
          <button class="chip" type="button" @click="addStep('agent')"><AppIcon name="microchip" :size="12" />Question à l'agent</button>
        </div>
        <p v-if="!home?.connected" class="text-2xs text-muted">Philips Hue n'est pas connecté : les étapes lumières échoueront tant qu'il ne l'est pas.</p>
      </div>
    </template>

    <!-- 3. Récap -->
    <template v-else>
      <h2 class="text-[18px] leading-6">On l'appelle comment ?</h2>
      <input v-model="name" class="input" maxlength="80" placeholder="Bonne nuit" required>
      <div class="flex flex-wrap gap-2" role="radiogroup" aria-label="Icône">
        <button v-for="item in ROUTINE_ICONS" :key="item" type="button" class="icon-tile cursor-pointer border-2" :class="[ROUTINE_ICON_TONES[item], icon === item ? 'border-ink' : 'border-transparent']" role="radio" :aria-checked="icon === item" :aria-label="item" @click="icon = item">
          <AppIcon :name="item" :size="14" />
        </button>
      </div>
      <div class="flex flex-col gap-1.5 rounded-md bg-surface-muted p-3.5 text-xs">
        <p><strong>Déclencheur :</strong> {{ trigger === 'time' ? `${time} · ${describeDays(days)}` : trigger === 'nfc' ? 'tag NFC' : 'manuel' }}</p>
        <p><strong>{{ actions.length }} étape{{ actions.length > 1 ? 's' : '' }} :</strong> {{ actions.map((item) => item.label).join(' → ') }}</p>
        <p class="text-muted">Niveau : action directe, sans validation (chaque action reste annulable depuis le journal).</p>
      </div>
    </template>

    <p v-if="error" class="alert alert-error">{{ error }}</p>
    <div class="grid grid-cols-[1fr_2fr] gap-2">
      <button class="btn btn-lg" type="button" @click="step === 0 ? emit('cancel') : step--">{{ step === 0 ? 'Annuler' : 'Retour' }}</button>
      <button v-if="step < STEPS.length - 1" class="btn btn-ink btn-lg" type="button" :disabled="!canContinue" @click="step++">Continuer</button>
      <button v-else class="btn btn-primary btn-lg" type="button" :disabled="!canContinue || busy" @click="save">{{ initial.id ? 'Enregistrer' : 'Créer la routine' }}</button>
    </div>
  </section>
</template>

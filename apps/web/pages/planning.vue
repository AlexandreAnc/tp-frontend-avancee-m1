<script setup lang="ts">
import type { AgendaItem } from '@app/shared';

useHead({ title: 'Planning · DashIA' });

type View = 'day' | 'week' | 'month' | 'list';
const VIEWS: { id: View; label: string }[] = [
  { id: 'day', label: 'Jour' },
  { id: 'week', label: 'Semaine' },
  { id: 'month', label: 'Mois' },
  { id: 'list', label: 'Liste' },
];

const view = ref<View>('day');
const selected = ref(startOfDay(new Date()));
const reminderDialog = ref<{ open: (preset?: { text?: string; date?: Date }) => void } | null>(null);
const error = ref<string | null>(null);

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

const weekStart = computed(() => addDays(selected.value, -((selected.value.getDay() + 6) % 7)));
const weekDays = computed(() => Array.from({ length: 7 }, (_, index) => addDays(weekStart.value, index)));

/** Période chargée : le mois affiché (vue Mois), sinon la semaine, plus 60 jours d'échéances. */
const range = computed(() => {
  if (view.value === 'month') {
    const first = new Date(selected.value.getFullYear(), selected.value.getMonth(), 1);
    return { from: addDays(first, -7), to: addDays(new Date(first.getFullYear(), first.getMonth() + 1, 1), 7) };
  }
  if (view.value === 'list') return { from: startOfDay(new Date()), to: addDays(new Date(), 60) };
  return { from: weekStart.value, to: addDays(weekStart.value, 7) };
});

const query = computed(() => ({ from: range.value.from.toISOString(), to: range.value.to.toISOString() }));
const { data: agenda, refresh } = await useFetch('/api/agenda', { key: 'planning-agenda', query });
const upcomingQuery = { from: startOfDay(new Date()).toISOString(), to: addDays(new Date(), 60).toISOString() };
const { data: upcoming, refresh: refreshUpcoming } = await useFetch('/api/agenda', { key: 'planning-upcoming', query: upcomingQuery });
const { count: pending } = usePendingActions();

useEvents((event) => {
  if (event.type === 'reminder.updated' || event.type === 'file.updated') {
    void refresh();
    void refreshUpcoming();
  }
});

const items = computed(() => agenda.value?.items ?? []);
const sameDay = (iso: string, day: Date) => {
  const date = iso.length === 10 ? new Date(`${iso}T00:00:00`) : new Date(iso);
  return startOfDay(date).getTime() === day.getTime();
};
const itemsOn = (day: Date) => items.value.filter((item) => sameDay(item.start, day));
const dayItems = computed(() => itemsOn(selected.value));

const isToday = computed(() => selected.value.getTime() === startOfDay(new Date()).getTime());
const todayItems = computed(() => (upcoming.value?.items ?? []).filter((item) => sameDay(item.start, startOfDay(new Date()))));
const weekAhead = computed(() => (upcoming.value?.items ?? []).filter((item) => daysUntil(item.start) <= 7));

const reminders = computed(() => (upcoming.value?.items ?? [])
  .filter((item): item is Extract<AgendaItem, { kind: 'reminder' }> => item.kind === 'reminder')
  .slice(0, 8));
const deadlines = computed(() => (upcoming.value?.items ?? [])
  .filter((item): item is Extract<AgendaItem, { kind: 'deadline' }> => item.kind === 'deadline'));

// ── Vue Jour : grille horaire ──────────────────────────────────
const HOUR_HEIGHT = 48;
const timedEvents = computed(() => dayItems.value.filter((item) => item.kind === 'event' && !item.allDay) as Extract<AgendaItem, { kind: 'event' }>[]);
const firstHour = computed(() => Math.min(8, ...timedEvents.value.map((event) => new Date(event.start).getHours())));
const lastHour = computed(() => Math.max(19, ...timedEvents.value.map((event) => new Date(event.end ?? event.start).getHours() + 1)));
const hours = computed(() => Array.from({ length: lastHour.value - firstHour.value }, (_, index) => firstHour.value + index));

function position(start: string, end: string | null) {
  const from = new Date(start);
  const to = end ? new Date(end) : new Date(from.getTime() + 30 * 60_000);
  const top = (from.getHours() - firstHour.value + from.getMinutes() / 60) * HOUR_HEIGHT;
  const height = Math.max(28, ((to.getTime() - from.getTime()) / 3_600_000) * HOUR_HEIGHT - 4);
  return { top: `${top}px`, height: `${height}px` };
}

const now = ref(new Date());
let clock: ReturnType<typeof setInterval> | undefined;
onMounted(() => (clock = setInterval(() => (now.value = new Date()), 60_000)));
onBeforeUnmount(() => clearInterval(clock));
const nowLine = computed(() => (now.value.getHours() - firstHour.value + now.value.getMinutes() / 60) * HOUR_HEIGHT);

// ── Vue Mois ───────────────────────────────────────────────────
const monthDays = computed(() => {
  const first = new Date(selected.value.getFullYear(), selected.value.getMonth(), 1);
  const start = addDays(first, -((first.getDay() + 6) % 7));
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
});

const monthLabel = computed(() => {
  const text = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(selected.value);
  return text.charAt(0).toUpperCase() + text.slice(1);
});

function shift(direction: -1 | 1) {
  selected.value = view.value === 'month'
    ? new Date(selected.value.getFullYear(), selected.value.getMonth() + direction, 1)
    : addDays(selected.value, direction * 7);
}

/** Groupes par jour pour les vues Semaine et Liste. */
const groupedDays = computed(() => {
  const days = view.value === 'week' ? weekDays.value : [...new Set(items.value.map((item) => startOfDay(new Date(item.start.length === 10 ? `${item.start}T00:00:00` : item.start)).getTime()))].map((time) => new Date(time));
  return days.map((day) => ({ day, items: itemsOn(day) })).filter((group) => view.value === 'week' || group.items.length);
});

function dotTone(day: Date) {
  const entries = itemsOn(day);
  if (entries.some((item) => item.kind === 'deadline')) return 'danger';
  if (entries.some((item) => item.kind === 'event')) return 'info';
  if (entries.length) return 'primary';
  return null;
}

async function toggleReminder(reminder: Extract<AgendaItem, { kind: 'reminder' }>) {
  error.value = null;
  try {
    await $fetch(`/api/reminders/${reminder.id}`, { method: 'PATCH', body: { status: reminder.status === 'done' ? 'scheduled' : 'done' } });
    await Promise.all([refresh(), refreshUpcoming()]);
  } catch (caught) {
    error.value = getErrorMessage(caught);
  }
}

async function removeReminder(id: string) {
  await $fetch(`/api/reminders/${id}`, { method: 'DELETE' });
  await Promise.all([refresh(), refreshUpcoming()]);
}

function deadlineTone(days: number) {
  if (days <= 7) return 'tone-danger';
  if (days <= 30) return 'tone-warning';
  return '';
}

const DOT = { danger: 'bg-danger', info: 'bg-info', primary: 'bg-primary' } as const;
function dotClass(day: Date) {
  const tone = dotTone(day);
  return tone ? DOT[tone] : '';
}

const WEEKDAY = new Intl.DateTimeFormat('fr-FR', { weekday: 'short' });
</script>

<template>
  <div>
    <PageHeader title="Planning" :subtitle="monthLabel" back="/panel">
      <template #actions>
        <button class="icon-btn" type="button" aria-label="Période précédente" @click="shift(-1)"><AppIcon name="arrow-left" /></button>
        <button class="icon-btn" type="button" aria-label="Aujourd'hui" @click="selected = startOfDay(new Date())"><AppIcon name="calendar-check" /></button>
      </template>
      <template #below>
        <div class="segmented" role="tablist">
          <button v-for="item in VIEWS" :key="item.id" type="button" role="tab" :aria-selected="view === item.id" :class="{ active: view === item.id }" @click="view = item.id">{{ item.label }}</button>
        </div>
        <div v-if="view === 'day' || view === 'week'" class="grid grid-cols-[repeat(7,1fr)] gap-1">
          <button
            v-for="day in weekDays"
            :key="day.getTime()"
            type="button"
            class="flex cursor-pointer flex-col items-center gap-0.5 rounded-md py-2"
            :class="{ 'bg-primary text-white': day.getTime() === selected.getTime() }"
            @click="selected = day; view = 'day'"
          >
            <span class="text-[10px] font-bold" :class="day.getTime() === selected.getTime() ? 'text-white' : 'text-muted'">{{ WEEKDAY.format(day).replace('.', '').toUpperCase() }}</span>
            <span class="text-[16px] font-extrabold" :class="day.getTime() === selected.getTime() ? 'text-white' : day < startOfDay(new Date()) ? 'text-muted' : ''">{{ day.getDate() }}</span>
            <span class="size-[5px] rounded-full" :class="day.getTime() === selected.getTime() ? 'bg-white' : dotClass(day)" />
          </button>
        </div>
      </template>
    </PageHeader>

    <main class="page lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
      <div class="flex flex-col gap-3 *:min-w-0">
        <MorningDigest v-if="isToday && view === 'day'" :today="todayItems" :week="weekAhead" :pending="pending" />
        <p v-if="!agenda?.calendarConnected" class="alert alert-info">
          <AppIcon name="calendar" :size="14" />
          <span class="min-w-0 flex-1">Google Agenda n'est pas connecté : seuls vos rappels et échéances apparaissent.</span>
          <NuxtLink to="/settings" class="font-extrabold">Connecter</NuxtLink>
        </p>
        <p v-if="error" class="alert alert-error">{{ error }}</p>

        <!-- Jour -->
        <section v-if="view === 'day'" class="flex flex-col gap-3">
          <div class="flex items-center justify-between gap-2">
            <h2>{{ formatDayLong(selected) }}</h2>
            <span class="text-xs text-muted">{{ dayItems.length }} élément{{ dayItems.length > 1 ? 's' : '' }}</span>
          </div>
          <div class="card py-3 pr-3 pl-0">
            <div class="relative ml-[52px]" :style="{ height: `${hours.length * HOUR_HEIGHT}px` }">
              <div v-for="hour in hours" :key="hour" class="absolute right-0 -left-[52px] h-0 border-t" :style="{ top: `${(hour - firstHour) * HOUR_HEIGHT}px` }">
                <span class="absolute -top-2 left-3 text-[11px] font-bold text-muted">{{ String(hour).padStart(2, '0') }}:00</span>
              </div>
              <div
                v-if="isToday && nowLine >= 0 && nowLine <= hours.length * HOUR_HEIGHT"
                class="absolute right-0 -left-1.5 h-0.5 bg-danger before:absolute before:-top-[3px] before:left-0 before:size-2 before:rounded-full before:bg-danger"
                :style="{ top: `${nowLine}px` }"
              />
              <div
                v-for="event in timedEvents"
                :key="event.id"
                class="absolute right-1 left-1 flex flex-col overflow-hidden rounded-sm border-l-[3px] border-info bg-info-soft px-2.5 py-1.5 text-[12px]"
                :style="position(event.start, event.end)"
              >
                <strong class="truncate">{{ event.title }}</strong>
                <span class="text-2xs font-bold text-info">{{ formatTime(event.start) }}{{ event.end ? ` – ${formatTime(event.end)}` : '' }}{{ event.location ? ` · ${event.location}` : '' }}</span>
              </div>
              <div
                v-for="item in dayItems.filter((entry) => entry.kind === 'reminder')"
                :key="item.id"
                class="absolute right-1 left-1 flex flex-col overflow-hidden rounded-sm border-l-[3px] border-amber bg-warning-soft px-2.5 py-1.5 text-[12px]"
                :style="position(item.start, null)"
              >
                <strong class="truncate"><AppIcon name="bell" :size="10" /> {{ item.title }}</strong>
              </div>
            </div>
          </div>
          <div
            v-for="item in dayItems.filter((entry) => entry.kind === 'deadline' || (entry.kind === 'event' && entry.allDay))"
            :key="item.id"
            class="flex items-center gap-2 rounded-md bg-danger-soft px-3 py-2.5 text-[12px] font-bold text-danger"
          >
            <AppIcon :name="item.kind === 'deadline' ? 'hourglass' : 'calendar'" :size="12" />{{ item.title }}
          </div>
        </section>

        <!-- Mois -->
        <section v-else-if="view === 'month'" class="flex flex-col gap-3">
          <div class="flex items-center justify-between gap-2">
            <button class="icon-btn" type="button" aria-label="Mois précédent" @click="shift(-1)"><AppIcon name="arrow-left" /></button>
            <h2>{{ monthLabel }}</h2>
            <button class="icon-btn -scale-x-100" type="button" aria-label="Mois suivant" @click="shift(1)"><AppIcon name="arrow-left" /></button>
          </div>
          <div class="card grid grid-cols-[repeat(7,1fr)] gap-1 p-3">
            <span v-for="(label, index) in ['L', 'M', 'M', 'J', 'V', 'S', 'D']" :key="index" class="text-center text-2xs font-extrabold text-muted">{{ label }}</span>
            <button
              v-for="day in monthDays"
              :key="day.getTime()"
              type="button"
              class="flex cursor-pointer flex-col items-center gap-[3px] rounded-sm py-2 font-bold"
              :class="{
                'opacity-50': day.getMonth() !== selected.getMonth(),
                'text-muted': day.getMonth() !== selected.getMonth() && day.getTime() !== startOfDay(new Date()).getTime(),
                'bg-primary text-white': day.getTime() === startOfDay(new Date()).getTime(),
              }"
              @click="selected = day; view = 'day'"
            >
              {{ day.getDate() }}
              <span class="size-[5px] rounded-full" :class="dotClass(day)" />
            </button>
          </div>
        </section>

        <!-- Semaine / Liste -->
        <section v-else class="flex flex-col gap-3">
          <div v-for="group in groupedDays" :key="group.day.getTime()" class="flex flex-col gap-2">
            <h2 class="text-xs">{{ formatDayLong(group.day) }}</h2>
            <div class="card card-flush">
              <div v-for="item in group.items" :key="`${item.kind}-${item.id}`" class="list-row">
                <AgendaBadge :item="item" />
              </div>
              <p v-if="!group.items.length" class="list-row text-xs text-muted">Rien de prévu</p>
            </div>
          </div>
          <div v-if="!groupedDays.length" class="empty-state">
            <span class="icon-tile tone-info"><AppIcon name="calendar-check" :size="16" /></span>
            <strong>Rien de prévu</strong>
            <p>Ajoutez un rappel ou connectez Google Agenda.</p>
          </div>
        </section>
      </div>

      <div class="flex flex-col gap-3 *:min-w-0">
        <section class="flex flex-col gap-3">
          <div class="flex items-center justify-between gap-2">
            <h2>Rappels</h2>
            <button class="text-btn" type="button" @click="reminderDialog?.open({ date: selected })">+ Ajouter</button>
          </div>
          <div v-if="reminders.length" class="card card-flush">
            <div v-for="reminder in reminders" :key="reminder.id" class="list-row">
              <button
                class="inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-tag border-[1.5px] text-white"
                :class="reminder.status === 'done' ? 'border-primary bg-primary' : 'bg-surface'"
                type="button"
                :aria-pressed="reminder.status === 'done'"
                :aria-label="reminder.status === 'done' ? 'Marquer comme à faire' : 'Marquer comme fait'"
                @click="toggleReminder(reminder)"
              >
                <AppIcon v-if="reminder.status === 'done'" name="check" :size="10" />
              </button>
              <div class="flex min-w-0 flex-1 flex-col">
                <strong class="truncate font-bold" :class="{ 'text-muted line-through': reminder.status === 'done' }">{{ reminder.title }}</strong>
                <span class="text-2xs text-muted">{{ daysUntil(reminder.start) === 0 ? 'Aujourd’hui' : formatDayLong(reminder.start) }} · {{ formatTime(reminder.start) }}</span>
              </div>
              <button class="icon-btn size-7" type="button" aria-label="Supprimer le rappel" @click="removeReminder(reminder.id)"><AppIcon name="trash" :size="12" /></button>
            </div>
          </div>
          <div v-else class="empty-state">
            <span class="icon-tile tone-primary"><AppIcon name="bell" :size="16" /></span>
            <strong>Aucun rappel</strong>
            <p>Demandez-en un à l'agent ou ajoutez-le ici.</p>
          </div>
        </section>

        <section class="flex flex-col gap-3">
          <h2>Échéances</h2>
          <NuxtLink v-for="deadline in deadlines" :key="deadline.id" :to="{ path: '/drive', query: { q: deadline.fileName } }" class="card flex items-center gap-3 font-normal text-text">
            <!-- Les teintes d'urgence sont recouvertes par le fond neutre de la tuile (rendu d'origine conservé). -->
            <span class="inline-flex size-11 shrink-0 flex-col items-center justify-center rounded-md bg-surface-muted text-[16px] leading-4 font-extrabold text-muted" :class="deadlineTone(daysUntil(deadline.start))">
              <span class="text-2xs">J‑</span>{{ daysUntil(deadline.start) }}
            </span>
            <div class="flex min-w-0 flex-1 flex-col gap-0.5">
              <strong class="font-extrabold">{{ deadline.title }}</strong>
              <span class="flex items-center gap-2 text-2xs text-muted"><AppIcon name="file-pdf" :size="10" />{{ deadline.fileName }} · {{ formatShortDate(deadline.start) }}</span>
            </div>
            <AppIcon name="chevron-right" :size="12" class="text-muted" />
          </NuxtLink>
          <p v-if="!deadlines.length" class="text-xs text-muted">Aucune échéance repérée dans vos documents pour les 60 prochains jours.</p>
        </section>
      </div>
    </main>

    <button
      class="fixed right-4 bottom-[calc(var(--nav-height)+16px+env(safe-area-inset-bottom))] z-15 inline-flex size-14 cursor-pointer items-center justify-center rounded-lg bg-primary text-white shadow-primary lg:right-6 lg:bottom-6"
      type="button"
      aria-label="Ajouter un rappel"
      @click="reminderDialog?.open({ date: selected })"
    >
      <AppIcon name="plus" :size="16" />
    </button>
    <ReminderDialog ref="reminderDialog" :default-date="selected" @created="refresh(); refreshUpcoming()" />
  </div>
</template>

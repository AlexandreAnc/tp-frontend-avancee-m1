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

const WEEKDAY = new Intl.DateTimeFormat('fr-FR', { weekday: 'short' });
</script>

<template>
  <div>
    <PageHeader title="Planning" :subtitle="monthLabel" back="/">
      <template #actions>
        <button class="icon-btn" type="button" aria-label="Période précédente" @click="shift(-1)"><AppIcon name="arrow-left" /></button>
        <button class="icon-btn" type="button" aria-label="Aujourd'hui" @click="selected = startOfDay(new Date())"><AppIcon name="calendar-check" /></button>
      </template>
      <template #below>
        <div class="segmented" role="tablist">
          <button v-for="item in VIEWS" :key="item.id" type="button" role="tab" :aria-selected="view === item.id" :class="{ active: view === item.id }" @click="view = item.id">{{ item.label }}</button>
        </div>
        <div v-if="view === 'day' || view === 'week'" class="week-strip">
          <button
            v-for="day in weekDays"
            :key="day.getTime()"
            type="button"
            class="day-pill"
            :class="{ active: day.getTime() === selected.getTime(), past: day < startOfDay(new Date()) }"
            @click="selected = day; view = 'day'"
          >
            <span class="dow">{{ WEEKDAY.format(day).replace('.', '').toUpperCase() }}</span>
            <span class="num">{{ day.getDate() }}</span>
            <span class="dot" :class="dotTone(day)" />
          </button>
        </div>
      </template>
    </PageHeader>

    <main class="page planning">
      <div class="stack col-main">
        <MorningDigest v-if="isToday && view === 'day'" :today="todayItems" :week="weekAhead" :pending="pending" />
        <p v-if="!agenda?.calendarConnected" class="alert alert-info">
          <AppIcon name="calendar" :size="14" />
          <span class="grow">Google Agenda n'est pas connecté : seuls vos rappels et échéances apparaissent.</span>
          <NuxtLink to="/settings" class="strong">Connecter</NuxtLink>
        </p>
        <p v-if="error" class="alert alert-error">{{ error }}</p>

        <!-- Jour -->
        <section v-if="view === 'day'" class="section">
          <div class="section-head">
            <h2>{{ formatDayLong(selected) }}</h2>
            <span class="small muted">{{ dayItems.length }} élément{{ dayItems.length > 1 ? 's' : '' }}</span>
          </div>
          <div class="day-grid card">
            <div class="grid-body" :style="{ height: `${hours.length * HOUR_HEIGHT}px` }">
              <div v-for="hour in hours" :key="hour" class="hour" :style="{ top: `${(hour - firstHour) * HOUR_HEIGHT}px` }">
                <span>{{ String(hour).padStart(2, '0') }}:00</span>
              </div>
              <div v-if="isToday && nowLine >= 0 && nowLine <= hours.length * HOUR_HEIGHT" class="now" :style="{ top: `${nowLine}px` }" />
              <div v-for="event in timedEvents" :key="event.id" class="event" :style="position(event.start, event.end)">
                <strong class="ellipsis">{{ event.title }}</strong>
                <span class="tiny">{{ formatTime(event.start) }}{{ event.end ? ` – ${formatTime(event.end)}` : '' }}{{ event.location ? ` · ${event.location}` : '' }}</span>
              </div>
              <div
                v-for="item in dayItems.filter((entry) => entry.kind === 'reminder')"
                :key="item.id"
                class="event reminder"
                :style="position(item.start, null)"
              >
                <strong class="ellipsis"><AppIcon name="bell" :size="10" /> {{ item.title }}</strong>
              </div>
            </div>
          </div>
          <div v-for="item in dayItems.filter((entry) => entry.kind === 'deadline' || (entry.kind === 'event' && entry.allDay))" :key="item.id" class="allday">
            <AppIcon :name="item.kind === 'deadline' ? 'hourglass' : 'calendar'" :size="12" />{{ item.title }}
          </div>
        </section>

        <!-- Mois -->
        <section v-else-if="view === 'month'" class="section">
          <div class="section-head">
            <button class="icon-btn" type="button" aria-label="Mois précédent" @click="shift(-1)"><AppIcon name="arrow-left" /></button>
            <h2>{{ monthLabel }}</h2>
            <button class="icon-btn flip" type="button" aria-label="Mois suivant" @click="shift(1)"><AppIcon name="arrow-left" /></button>
          </div>
          <div class="month card">
            <span v-for="(label, index) in ['L', 'M', 'M', 'J', 'V', 'S', 'D']" :key="index" class="mhead tiny muted strong">{{ label }}</span>
            <button
              v-for="day in monthDays"
              :key="day.getTime()"
              type="button"
              class="mday"
              :class="{ out: day.getMonth() !== selected.getMonth(), today: day.getTime() === startOfDay(new Date()).getTime() }"
              @click="selected = day; view = 'day'"
            >
              {{ day.getDate() }}
              <span class="dot" :class="dotTone(day)" />
            </button>
          </div>
        </section>

        <!-- Semaine / Liste -->
        <section v-else class="section">
          <div v-for="group in groupedDays" :key="group.day.getTime()" class="stack-sm">
            <h2 class="small">{{ formatDayLong(group.day) }}</h2>
            <div class="card card-flush">
              <div v-for="item in group.items" :key="`${item.kind}-${item.id}`" class="list-row">
                <AgendaBadge :item="item" />
              </div>
              <p v-if="!group.items.length" class="list-row small muted">Rien de prévu</p>
            </div>
          </div>
          <div v-if="!groupedDays.length" class="empty-state">
            <span class="icon-tile tone-info"><AppIcon name="calendar-check" :size="16" /></span>
            <strong>Rien de prévu</strong>
            <p>Ajoutez un rappel ou connectez Google Agenda.</p>
          </div>
        </section>
      </div>

      <div class="stack col-side">
        <section class="section">
          <div class="section-head">
            <h2>Rappels</h2>
            <button class="text-btn" type="button" @click="reminderDialog?.open({ date: selected })">+ Ajouter</button>
          </div>
          <div v-if="reminders.length" class="card card-flush">
            <div v-for="reminder in reminders" :key="reminder.id" class="list-row reminder-row" :class="{ done: reminder.status === 'done' }">
              <button class="check" type="button" :aria-pressed="reminder.status === 'done'" :aria-label="reminder.status === 'done' ? 'Marquer comme à faire' : 'Marquer comme fait'" @click="toggleReminder(reminder)">
                <AppIcon v-if="reminder.status === 'done'" name="check" :size="10" />
              </button>
              <div class="grow">
                <strong class="ellipsis">{{ reminder.title }}</strong>
                <span class="tiny muted">{{ daysUntil(reminder.start) === 0 ? 'Aujourd’hui' : formatDayLong(reminder.start) }} · {{ formatTime(reminder.start) }}</span>
              </div>
              <button class="icon-btn small-btn" type="button" aria-label="Supprimer le rappel" @click="removeReminder(reminder.id)"><AppIcon name="trash" :size="12" /></button>
            </div>
          </div>
          <div v-else class="empty-state">
            <span class="icon-tile tone-primary"><AppIcon name="bell" :size="16" /></span>
            <strong>Aucun rappel</strong>
            <p>Demandez-en un à l'agent ou ajoutez-le ici.</p>
          </div>
        </section>

        <section class="section">
          <h2>Échéances</h2>
          <NuxtLink v-for="deadline in deadlines" :key="deadline.id" :to="{ path: '/drive', query: { q: deadline.fileName } }" class="card deadline-card">
            <span class="jtile" :class="deadlineTone(daysUntil(deadline.start))">
              <span class="tiny">J‑</span>{{ daysUntil(deadline.start) }}
            </span>
            <div class="grow">
              <strong>{{ deadline.title }}</strong>
              <span class="tiny muted row"><AppIcon name="file-pdf" :size="10" />{{ deadline.fileName }} · {{ formatShortDate(deadline.start) }}</span>
            </div>
            <AppIcon name="chevron-right" :size="12" class="muted" />
          </NuxtLink>
          <p v-if="!deadlines.length" class="small muted">Aucune échéance repérée dans vos documents pour les 60 prochains jours.</p>
        </section>
      </div>
    </main>

    <button class="fab" type="button" aria-label="Ajouter un rappel" @click="reminderDialog?.open({ date: selected })"><AppIcon name="plus" :size="16" /></button>
    <ReminderDialog ref="reminderDialog" :default-date="selected" @created="refresh(); refreshUpcoming()" />
  </div>
</template>

<style scoped>
.week-strip {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
}

.day-pill {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 8px 0;
  border: none;
  border-radius: var(--radius);
  background: none;
  cursor: pointer;
}

.day-pill .dow {
  font-size: 10px;
  font-weight: 700;
  color: var(--text-muted);
}

.day-pill .num {
  font-size: 16px;
  font-weight: 800;
}

.day-pill.past .num {
  color: var(--text-muted);
}

.day-pill.active {
  background: var(--primary);
  color: #fff;
}

.day-pill.active .dow,
.day-pill.active .num {
  color: #fff;
}

.dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
}

.dot.info {
  background: var(--info);
}

.dot.danger {
  background: var(--danger);
}

.dot.primary {
  background: var(--primary);
}

.day-pill.active .dot {
  background: #fff;
}

.planning {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.day-grid {
  padding: 12px 12px 12px 0;
}

.grid-body {
  position: relative;
  margin-left: 52px;
}

.hour {
  position: absolute;
  left: -52px;
  right: 0;
  height: 0;
  border-top: 1px solid var(--border);
}

.hour span {
  position: absolute;
  top: -8px;
  left: 12px;
  font-size: 11px;
  font-weight: 700;
  color: var(--text-muted);
}

.now {
  position: absolute;
  left: -6px;
  right: 0;
  height: 2px;
  background: var(--danger);
}

.now::before {
  content: '';
  position: absolute;
  left: 0;
  top: -3px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--danger);
}

.event {
  position: absolute;
  left: 4px;
  right: 4px;
  display: flex;
  flex-direction: column;
  padding: 6px 10px;
  border-left: 3px solid var(--info);
  border-radius: var(--radius-sm);
  background: var(--info-soft);
  overflow: hidden;
  font-size: 12px;
}

.event .tiny {
  color: var(--info);
  font-weight: 700;
}

.event.reminder {
  border-left-color: var(--amber);
  background: var(--warning-soft);
}

.allday {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: var(--radius);
  background: var(--danger-soft);
  color: var(--danger);
  font-size: 12px;
  font-weight: 700;
}

.flip {
  transform: scaleX(-1);
}

.month {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
  padding: 12px;
}

.mhead {
  text-align: center;
}

.mday {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 8px 0;
  border: none;
  border-radius: var(--radius-sm);
  background: none;
  font-weight: 700;
  cursor: pointer;
}

.mday.out {
  color: var(--text-muted);
  opacity: 0.5;
}

.mday.today {
  background: var(--primary);
  color: #fff;
}

.reminder-row .grow {
  display: flex;
  flex-direction: column;
}

.reminder-row strong {
  font-weight: 700;
}

.reminder-row.done strong {
  color: var(--text-muted);
  text-decoration: line-through;
}

.check {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  border: 1.5px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  color: #fff;
  cursor: pointer;
}

.done .check {
  border-color: var(--primary);
  background: var(--primary);
}

.small-btn {
  width: 28px;
  height: 28px;
}

.deadline-card {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--text);
  font-weight: 400;
}

.deadline-card .grow {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.deadline-card strong {
  font-weight: 800;
}

.jtile {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  border-radius: var(--radius);
  background: var(--surface-muted);
  color: var(--text-muted);
  font-size: 16px;
  font-weight: 800;
  line-height: 16px;
}

.fab {
  position: fixed;
  right: 16px;
  bottom: calc(var(--nav-height) + 16px + env(safe-area-inset-bottom));
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  border: none;
  border-radius: var(--radius-lg);
  background: var(--primary);
  color: #fff;
  box-shadow: var(--shadow-primary);
  cursor: pointer;
  z-index: 15;
}

@media (min-width: 1024px) {
  .planning {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 360px;
    align-items: start;
  }

  .fab {
    bottom: 24px;
    right: 24px;
  }
}
</style>

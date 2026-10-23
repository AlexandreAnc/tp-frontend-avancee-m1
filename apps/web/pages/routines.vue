<script setup lang="ts">
import type { RoutineInput } from '@app/shared';
import type { ApiResponse } from '#shared/types/api';
import type { RoutineItem } from '~/components/routine/Card.vue';

useHead({ title: 'Routines · DashIA' });

const { data, refresh } = await useFetch('/api/routines', { key: 'routines' });
const { ask } = useConfirm();
const editing = ref<(Omit<RoutineInput, 'enabled'> & { id?: string }) | null>(null);
const busy = ref<string | null>(null);
const error = ref<string | null>(null);
const lastResult = ref<{ name: string; routineId: string; run: ApiResponse<'/api/routines/:id/run', 'post'>['run'] } | null>(null);

const routines = computed(() => (data.value?.routines ?? []) as RoutineItem[]);
const active = computed(() => routines.value.filter((routine) => routine.enabled).length);

useEvents((event) => {
  if (event.type === 'activity.created') void refresh();
});

function edit(routine: RoutineItem) {
  editing.value = { id: routine.id, name: routine.name, icon: routine.icon, schedule: routine.schedule, steps: routine.steps };
  lastResult.value = null;
}

function startFrom(template: (typeof ROUTINE_TEMPLATES)[number] | null) {
  editing.value = template
    ? { name: template.name, icon: template.icon, schedule: template.schedule, steps: template.steps }
    : { name: '', icon: 'house', schedule: null, steps: [] };
  lastResult.value = null;
}

async function toggle(routine: RoutineItem) {
  error.value = null;
  try {
    await $fetch(`/api/routines/${routine.id}`, { method: 'PATCH', body: { enabled: !routine.enabled } });
    await refresh();
  } catch (caught) {
    error.value = getErrorMessage(caught);
  }
}

async function run(routineId: string, name: string) {
  busy.value = routineId;
  error.value = null;
  try {
    const { run: result } = await $fetch<ApiResponse<'/api/routines/:id/run', 'post'>>(`/api/routines/${routineId}/run`, { method: 'POST' });
    lastResult.value = { name, routineId, run: result };
    await refresh();
  } catch (caught) {
    error.value = getErrorMessage(caught);
  } finally {
    busy.value = null;
  }
}

async function remove() {
  const id = editing.value?.id;
  if (!id || !await ask({ title: 'Supprimer cette routine ?', message: 'Les tags associés ne lanceront plus rien.', confirm: 'Supprimer', danger: true })) return;
  await $fetch(`/api/routines/${id}`, { method: 'DELETE' });
  editing.value = null;
  await refresh();
}

async function onSaved() {
  editing.value = null;
  await refresh();
}
</script>

<template>
  <div>
    <PageHeader title="Routines" :subtitle="`${active} active${active > 1 ? 's' : ''} · ${routines.length - active} en pause`" back="/plus">
      <template #actions>
        <button class="btn btn-sm btn-primary" type="button" @click="startFrom(null)"><AppIcon name="plus" :size="12" />Nouvelle</button>
      </template>
    </PageHeader>

    <main class="page flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
      <div class="flex flex-col gap-3 *:min-w-0">
        <p v-if="error" class="alert alert-error">{{ error }}</p>

        <template v-if="editing">
          <h2 class="section-label">{{ editing.id ? 'Modifier la routine' : 'Créer une routine' }}</h2>
          <RoutineEditor :key="editing.id ?? editing.name" :initial="editing" @saved="onSaved" @cancel="editing = null" />
          <button v-if="editing.id" class="text-btn self-center text-danger" type="button" @click="remove">Supprimer la routine</button>
        </template>

        <RoutineRunResult
          v-if="lastResult"
          :name="lastResult.name"
          :run="lastResult.run"
          @retry="run(lastResult.routineId, lastResult.name)"
          @edit="edit(routines.find((routine) => routine.id === lastResult?.routineId)!)"
        />

        <section class="flex flex-col gap-3">
          <h2 class="section-label">Mes routines</h2>
          <RoutineCard
            v-for="routine in routines"
            :key="routine.id"
            :routine="routine"
            :busy="busy === routine.id"
            @toggle="toggle(routine)"
            @run="run(routine.id, routine.name)"
            @edit="edit(routine)"
          />
          <div v-if="!routines.length" class="empty-state">
            <span class="icon-tile tone-primary"><AppIcon name="repeat" :size="16" /></span>
            <strong>Aucune routine</strong>
            <p>Partez d'un modèle ci-dessous ou créez la vôtre.</p>
          </div>
        </section>
      </div>

      <section class="flex flex-col gap-3">
        <h2 class="section-label">Modèles</h2>
        <button v-for="template in ROUTINE_TEMPLATES" :key="template.name" type="button" class="card flex w-full cursor-pointer items-center gap-3 text-left" @click="startFrom(template)">
          <span class="icon-tile" :class="ROUTINE_ICON_TONES[template.icon]"><AppIcon :name="template.icon" :size="14" /></span>
          <span class="flex min-w-0 flex-1 flex-col">
            <strong class="font-extrabold">{{ template.name }}</strong>
            <span class="text-xs text-muted">{{ template.description }}{{ template.schedule ? ` · ${describeSchedule(template.schedule)}` : '' }}</span>
          </span>
          <AppIcon name="plus" :size="12" class="text-muted" />
        </button>
      </section>
    </main>
  </div>
</template>

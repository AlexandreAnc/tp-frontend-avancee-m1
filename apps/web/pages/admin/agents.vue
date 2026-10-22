<script setup lang="ts">
useHead({ title: 'Agents locaux · DashIA' });

const { data, error: loadError, refresh } = await useFetch('/api/admin/agent-keys', { key: 'agent-keys' });
const { ask } = useConfirm();
const name = ref('');
const createdKey = ref<{ name: string; key: string } | null>(null);
const error = ref<string | null>(null);

useEvents((event) => {
  if (event.type === 'agent.status') void refresh();
});

async function create() {
  error.value = null;
  try {
    const { key, agentKey } = await $fetch('/api/admin/agent-keys', { method: 'POST', body: { name: name.value } });
    createdKey.value = { name: agentKey.name, key };
    name.value = '';
    await refresh();
  } catch (caught) {
    error.value = getErrorMessage(caught);
  }
}

async function revoke(id: string, keyName: string) {
  if (!await ask({ title: `Révoquer la clé de « ${keyName} » ?`, message: "L'agent de cette machine sera déconnecté.", confirm: 'Révoquer', danger: true })) return;
  error.value = null;
  try {
    await $fetch(`/api/admin/agent-keys/${id}`, { method: 'DELETE' });
    await refresh();
  } catch (caught) {
    error.value = getErrorMessage(caught);
  }
}

function connectionFor(keyId: string) {
  return data.value?.connected.find((agent) => agent.agentKeyId === keyId);
}
</script>

<template>
  <div>
    <PageHeader title="Agents locaux" :subtitle="data ? `Embeddings exigés : ${data.embedModel}` : undefined" back="/plus" />
    <main class="page page-narrow">
      <p v-if="loadError" class="alert alert-error">{{ getErrorMessage(loadError) }}</p>
      <p v-if="error" class="alert alert-error" role="alert">{{ error }}</p>

      <section class="card stack">
        <h2>Nouvelle machine</h2>
        <form class="row" @submit.prevent="create">
          <label for="agent-name" class="sr-only">Nom de la machine</label>
          <input id="agent-name" v-model="name" class="input grow" placeholder="ex. macbook-pro" required maxlength="100">
          <button class="btn btn-primary" type="submit">Générer une clé</button>
        </form>
        <div v-if="createdKey" class="alert alert-success new-key">
          <p>Clé de <strong>{{ createdKey.name }}</strong>, à copier dans <code>AGENT_KEY</code> du <code>.env</code> de l'agent. Elle ne sera plus affichée :</p>
          <code class="key">{{ createdKey.key }}</code>
        </div>
      </section>

      <div v-if="data" class="stack">
        <article v-for="key in data.keys" :key="key.id" class="card row key-row">
          <div class="grow">
            <strong>{{ key.name }}</strong> <code>{{ key.keyPrefix }}…</code>
            <div class="muted small">
              <template v-if="key.revokedAt">Révoquée {{ formatRelative(key.revokedAt) }}</template>
              <template v-else-if="connectionFor(key.id)">
                Connecté · {{ connectionFor(key.id)!.chatModel }} · {{ connectionFor(key.id)!.activeTasks }}/{{ connectionFor(key.id)!.concurrency }} tâche(s)
                <span v-if="!connectionFor(key.id)!.compatible" class="badge badge-danger">
                  Embeddings {{ connectionFor(key.id)!.embedModel }} incompatibles
                </span>
              </template>
              <template v-else>Hors ligne{{ key.lastSeenAt ? ` · vu ${formatRelative(key.lastSeenAt)}` : '' }}</template>
            </div>
          </div>
          <span v-if="!key.revokedAt" class="badge" :class="connectionFor(key.id) ? 'badge-success' : ''">
            <span class="dot" aria-hidden="true" />{{ connectionFor(key.id) ? 'En ligne' : 'Hors ligne' }}
          </span>
          <button v-if="!key.revokedAt" class="btn btn-sm btn-danger" type="button" @click="revoke(key.id, key.name)">Révoquer</button>
        </article>
      </div>
    </main>
  </div>
</template>

<style scoped>
.grow {
  flex: 1;
  min-width: 0;
}

.new-key {
  margin-top: 1rem;
}

.new-key p {
  margin: 0 0 0.5rem;
}

.key {
  display: block;
  word-break: break-all;
  user-select: all;
}

.key-row {
  padding: 0.85rem 1rem;
}
</style>

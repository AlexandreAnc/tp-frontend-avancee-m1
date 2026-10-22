<script setup lang="ts">
import type { ThemePreference } from '~/composables/useTheme';

useHead({ title: 'Réglages · DashIA' });

const route = useRoute();
const { me } = useMe();
const { online, agent } = useAgentStatus();
const push = usePush();
const { signOut } = useAuth();
const { theme, setTheme } = useTheme();
const { supported: passkeySupported, withStepUp } = useStepUp();
const { $reloadAppLock } = useNuxtApp();

const { data: settingsData, refresh: refreshSettings } = await useFetch('/api/settings', { key: 'settings' });
const { data: connectorsData, refresh: refreshConnectors } = await useFetch('/api/connectors', { key: 'connectors' });
const { data: filesData } = await useFetch('/api/files', { key: 'files' });
const { data: modelsData, refresh: refreshModels } = await useFetch('/api/agent-models', { key: 'agent-models' });

const message = ref<{ tone: 'success' | 'error'; text: string } | null>(null);
const busy = ref<string | null>(null);
const ping = ref<{ latencyMs: number; testedAt: string } | null>(null);
const passkeys = ref<{ id: string; name?: string | null; createdAt?: Date | string | null }[]>([]);

const CONNECTOR_MESSAGES: Record<string, { tone: 'success' | 'error'; text: string }> = {
  connected: { tone: 'success', text: 'Google Agenda est connecté.' },
  cancelled: { tone: 'error', text: 'Connexion à Google annulée.' },
  error: { tone: 'error', text: 'La connexion à Google a échoué. Réessayez.' },
};
if (route.query.connector === 'google' && typeof route.query.status === 'string') {
  message.value = CONNECTOR_MESSAGES[route.query.status] ?? null;
}

const settings = computed(() => settingsData.value?.settings);

async function run(key: string, task: () => Promise<unknown>, success?: string) {
  busy.value = key;
  message.value = null;
  try {
    await task();
    if (success) message.value = { tone: 'success', text: success };
  } catch (caught) {
    const text = caught instanceof Error && !('data' in caught)
      ? (caught.name === 'NotAllowedError' ? 'Vérification annulée.' : caught.message)
      : getErrorMessage(caught);
    message.value = { tone: 'error', text };
  } finally {
    busy.value = null;
  }
}

async function updateSettings(update: Record<string, unknown>) {
  await run('settings', async () => {
    await $fetch<unknown>('/api/settings', { method: 'PATCH', body: update });
    await refreshSettings();
  });
}

// ── Agent ──────────────────────────────────────────────────────
const testConnection = () => run('ping', async () => {
  ping.value = await $fetch<{ latencyMs: number; testedAt: string }>('/api/agent-test', { method: 'POST' });
});

const changeModel = (chatModel: string) => run('model', async () => {
  await $fetch<{ ok: boolean }>('/api/admin/agent-model', { method: 'PUT', body: { chatModel } });
  await refreshModels();
}, `L'agent passe sur ${chatModel}.`);

// ── Stockage : répartition par type de fichier ────────────────
const storage = computed(() => {
  const files = filesData.value?.files ?? [];
  const quota = filesData.value?.quota ?? { usedBytes: 0, maxBytes: 1 };
  const groups = [
    { label: 'Documents', color: 'var(--info)', test: (type: string) => type === 'application/pdf' || type.includes('wordprocessing') },
    { label: 'Images', color: 'var(--primary)', test: (type: string) => type.startsWith('image/') },
    { label: 'Tableurs', color: 'var(--amber)', test: (type: string) => type.includes('spreadsheet') },
    { label: 'Texte', color: 'var(--text-muted)', test: (type: string) => type.startsWith('text/') },
  ].map((group) => ({ ...group, bytes: files.filter((file) => group.test(file.mimeType)).reduce((sum, file) => sum + file.sizeBytes, 0) }));
  return { ...quota, groups, percent: Math.round((quota.usedBytes / quota.maxBytes) * 100) };
});

// ── Sécurité : passkeys ────────────────────────────────────────
async function loadPasskeys() {
  if (!passkeySupported) return;
  const { data } = await authClient.passkey.listUserPasskeys();
  passkeys.value = data ?? [];
}
onMounted(loadPasskeys);

function deviceName() {
  const agentString = navigator.userAgent;
  if (/iPhone/.test(agentString)) return 'iPhone';
  if (/iPad/.test(agentString)) return 'iPad';
  if (/Android/.test(agentString)) return 'Android';
  if (/Mac/.test(agentString)) return 'Mac';
  if (/Windows/.test(agentString)) return 'PC Windows';
  return 'Cet appareil';
}

const addPasskey = () => run('passkey', async () => {
  const result = await authClient.passkey.addPasskey({ name: deviceName() });
  if (result?.error) throw new Error(result.error.message ?? 'Ajout impossible.');
  await loadPasskeys();
}, 'Face ID / empreinte activé sur cet appareil.');

const removePasskey = (id: string) => run(`passkey-${id}`, async () => {
  await authClient.passkey.deletePasskey({ id });
  await loadPasskeys();
});

const LOCK_OPTIONS = [
  { value: null, label: 'Désactivé' },
  { value: 0, label: 'Immédiat' },
  { value: 1, label: '1 min' },
  { value: 5, label: '5 min' },
  { value: 15, label: '15 min' },
  { value: 60, label: '1 h' },
];

async function setLock(value: number | null) {
  await updateSettings({ lockAfterMinutes: value });
  await $reloadAppLock();
}

// ── Notifications ──────────────────────────────────────────────
const togglePush = () => run('push', () => (push.subscribed.value ? push.unsubscribe() : push.subscribe()));

// ── Connecteurs ────────────────────────────────────────────────
const disconnect = (provider: 'google' | 'hue') => run(provider, async () => {
  await $fetch<{ ok: boolean }>(`/api/connectors/${provider}`, { method: 'DELETE' });
  await refreshConnectors();
}, provider === 'hue' ? 'Philips Hue est déconnecté.' : 'Google Agenda est déconnecté.');

// ── Confidentialité et compte ──────────────────────────────────
function exportData() {
  window.location.href = '/api/me/export';
}

async function clearHistory() {
  if (!confirm('Effacer toutes vos discussions ? Les documents et le planning sont conservés.')) return;
  await run('history', () => withStepUp(() => $fetch<{ deleted: number }>('/api/conversations', { method: 'DELETE' })), 'Historique des discussions effacé.');
}

async function deleteAccount() {
  if (!confirm('Supprimer définitivement votre compte, vos fichiers et vos discussions ?')) return;
  await run('account', async () => {
    await withStepUp(() => $fetch<{ ok: boolean }>('/api/me', { method: 'DELETE' }));
    await signOut();
  });
}

const THEMES: { value: ThemePreference; label: string; icon: 'sun-outline' | 'moon' | 'circle-half' }[] = [
  { value: 'light', label: 'Clair', icon: 'sun-outline' },
  { value: 'dark', label: 'Sombre', icon: 'moon' },
  { value: 'auto', label: 'Auto', icon: 'circle-half' },
];
</script>

<template>
  <div>
    <PageHeader title="Réglages" back="/plus" />

    <main class="page page-narrow">
      <p v-if="message" class="alert" :class="`alert-${message.tone}`" role="status">{{ message.text }}</p>

      <section v-if="me" class="card profile">
        <UserAvatar :name="me.user.name" :size="56" />
        <div class="grow">
          <strong class="name">{{ me.user.name }}</strong>
          <span class="small muted">{{ me.user.email }}</span>
        </div>
      </section>

      <SettingsGroup title="Agent local">
        <SettingsRow icon="desktop" tone="tone-ink" :title="agent?.name ?? 'Aucun agent connecté'" :subtitle="agent ? `${agent.activeTasks} tâche(s) en cours` : 'Lancez l’agent sur votre PC'">
          <span class="badge" :class="online ? 'tone-primary' : ''">{{ online ? 'En ligne' : 'Hors ligne' }}</span>
        </SettingsRow>
        <SettingsRow icon="microchip" tone="tone-primary" title="Modèle" :subtitle="modelsData?.canChange ? 'Modèles Ollama installés qui gèrent les outils' : 'Choisi par l’administrateur'">
          <select
            v-if="modelsData?.canChange && modelsData.models.length"
            class="select"
            :value="modelsData.current ?? ''"
            :disabled="busy === 'model'"
            aria-label="Modèle de chat"
            @change="changeModel(($event.target as HTMLSelectElement).value)"
          >
            <option v-for="model in modelsData.models" :key="model.name" :value="model.name">
              {{ model.name }}{{ model.vision ? ' · vision' : '' }}
            </option>
          </select>
          <span v-else class="small muted strong">{{ modelsData?.current ?? agent?.chatModel ?? '—' }}</span>
        </SettingsRow>
        <SettingsRow icon="signal" tone="tone-info" title="Tester la connexion">
          <template #subtitle>
            <span v-if="ping" class="ok-text"><AppIcon name="check" :size="9" /> {{ ping.latencyMs }} ms · {{ formatRelative(ping.testedAt) }}</span>
            <span v-else>Aller-retour jusqu'à votre PC</span>
          </template>
          <button class="btn btn-sm" type="button" :disabled="busy === 'ping' || !online" @click="testConnection">
            <span v-if="busy === 'ping'" class="spinner" />Tester
          </button>
        </SettingsRow>
        <SettingsRow icon="power" tone="tone-warning" title="Réveiller le PC à distance" subtitle="Wake-on-LAN · nécessite un relais toujours allumé sur votre réseau (bientôt)">
          <button class="switch" type="button" role="switch" aria-checked="false" disabled aria-label="Réveiller le PC à distance" />
        </SettingsRow>
      </SettingsGroup>

      <section class="section">
        <h2 class="section-label">Stockage</h2>
        <div class="card storage">
          <div class="row between">
            <p><strong class="big">{{ formatBytes(storage.usedBytes) }}</strong> <span class="muted strong">/ {{ formatBytes(storage.maxBytes) }}</span></p>
            <span class="small muted strong">{{ storage.percent }} %</span>
          </div>
          <div class="segments" aria-hidden="true">
            <span v-for="group in storage.groups" :key="group.label" :style="{ width: `${(group.bytes / storage.maxBytes) * 100}%`, background: group.color }" />
          </div>
          <ul class="legend">
            <li v-for="group in storage.groups" :key="group.label"><i :style="{ background: group.color }" />{{ group.label }} · {{ formatBytes(group.bytes) }}</li>
          </ul>
          <NuxtLink to="/drive" class="btn btn-block"><AppIcon name="broom" :size="12" />Gérer le drive</NuxtLink>
        </div>
      </section>

      <SettingsGroup title="Sécurité">
        <SettingsRow icon="face-smile" tone="tone-primary" title="Face ID / empreinte" :subtitle="passkeySupported ? (passkeys.length ? `${passkeys.length} appareil(s) enregistré(s)` : 'Connexion et validation sans mot de passe') : 'Non disponible sur ce navigateur'">
          <button v-if="passkeySupported" class="btn btn-sm" type="button" :disabled="busy === 'passkey'" @click="addPasskey">Ajouter</button>
        </SettingsRow>
        <SettingsRow v-for="key in passkeys" :key="key.id" :title="key.name ?? 'Passkey'" :subtitle="key.createdAt ? `Ajoutée ${formatRelative(new Date(key.createdAt).toISOString())}` : undefined">
          <button class="icon-btn" type="button" :aria-label="`Retirer ${key.name ?? 'la passkey'}`" :disabled="busy === `passkey-${key.id}`" @click="removePasskey(key.id)"><AppIcon name="trash" :size="12" /></button>
        </SettingsRow>
        <SettingsRow icon="shield" tone="tone-primary" title="Face ID pour les actions sensibles" subtitle="Suppressions, effacement de l'historique, actions irréversibles">
          <button
            class="switch"
            type="button"
            role="switch"
            :aria-checked="settings?.biometricForSensitive ?? true"
            aria-label="Face ID pour les actions sensibles"
            :disabled="!passkeys.length"
            @click="updateSettings({ biometricForSensitive: !settings?.biometricForSensitive })"
          />
        </SettingsRow>
        <SettingsRow icon="lock" tone="tone-ink" title="Verrouillage automatique" :subtitle="passkeys.length ? 'Face ID demandé à la réouverture' : 'Ajoutez d’abord Face ID / empreinte'">
          <select
            class="select"
            :value="settings?.lockAfterMinutes ?? 'null'"
            :disabled="!passkeys.length"
            aria-label="Délai de verrouillage"
            @change="setLock(($event.target as HTMLSelectElement).value === 'null' ? null : Number(($event.target as HTMLSelectElement).value))"
          >
            <option v-for="option in LOCK_OPTIONS" :key="String(option.value)" :value="option.value ?? 'null'">{{ option.label }}</option>
          </select>
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="Notifications">
        <SettingsRow icon="bell" tone="tone-info" title="Sur cet appareil" :subtitle="!push.supported.value ? 'Non disponible (sur iPhone, installez d’abord l’app)' : push.permission.value === 'denied' ? 'Bloquées dans les réglages du navigateur' : 'Actions à valider et rappels'">
          <button
            class="switch"
            type="button"
            role="switch"
            :aria-checked="push.subscribed.value"
            aria-label="Notifications sur cet appareil"
            :disabled="!push.supported.value || busy === 'push'"
            @click="togglePush"
          />
        </SettingsRow>
        <SettingsRow icon="hand" tone="tone-danger" title="Actions à valider" subtitle="Toujours envoyées">
          <button class="switch" type="button" role="switch" aria-checked="true" disabled aria-label="Actions à valider" />
        </SettingsRow>
        <SettingsRow icon="bell" tone="tone-info" title="Rappels & échéances" subtitle="Toujours envoyés">
          <button class="switch" type="button" role="switch" aria-checked="true" disabled aria-label="Rappels" />
        </SettingsRow>
        <SettingsRow icon="sun" tone="tone-warning" title="Résumé du matin">
          <template #subtitle>
            <label class="inline">à
              <select class="select mini" :value="settings?.digestHour ?? 8" aria-label="Heure du résumé" @change="updateSettings({ digestHour: Number(($event.target as HTMLSelectElement).value) })">
                <option v-for="hour in 24" :key="hour - 1" :value="hour - 1">{{ String(hour - 1).padStart(2, '0') }}:00</option>
              </select>
            </label>
          </template>
          <button class="switch" type="button" role="switch" :aria-checked="settings?.digestEnabled ?? false" aria-label="Résumé du matin" @click="updateSettings({ digestEnabled: !settings?.digestEnabled, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone })" />
        </SettingsRow>
        <SettingsRow icon="file-lines" tone="tone-primary" title="Documents analysés" subtitle="Quand l'app est fermée">
          <button class="switch" type="button" role="switch" :aria-checked="settings?.notifyDocumentReady ?? true" aria-label="Documents analysés" @click="updateSettings({ notifyDocumentReady: !settings?.notifyDocumentReady })" />
        </SettingsRow>
        <SettingsRow icon="comments" tone="tone-info" title="Réponses de l'agent" subtitle="Quand l'app est fermée">
          <button class="switch" type="button" role="switch" :aria-checked="settings?.notifyReplyReady ?? true" aria-label="Réponses de l'agent" @click="updateSettings({ notifyReplyReady: !settings?.notifyReplyReady })" />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="Maison, NFC & connecteurs">
        <SettingsRow
          v-for="connector in connectorsData?.connectors ?? []"
          :key="connector.provider"
          :icon="connector.provider === 'hue' ? 'lightbulb' : 'calendar'"
          :tone="connector.provider === 'hue' ? 'tone-warning' : 'tone-info'"
          :title="connector.label"
          :subtitle="connector.connected ? `Connecté ${formatRelative(connector.connectedAt!)}` : connector.available ? 'Non connecté' : 'Non configuré sur le serveur'"
        >
          <button v-if="connector.connected" class="btn btn-sm" type="button" :disabled="busy === connector.provider" @click="disconnect(connector.provider)">Déconnecter</button>
          <a v-else-if="connector.available" class="btn btn-sm btn-ink" :href="`/api/connectors/${connector.provider}/connect`">Connecter</a>
        </SettingsRow>
        <SettingsRow icon="nfc" tone="tone-primary" title="Tags NFC" to="/tags" subtitle="Routines au tap" />
      </SettingsGroup>

      <section class="section">
        <h2 class="section-label">Confidentialité</h2>
        <p class="privacy small">
          <AppIcon name="shield" :size="14" />
          <span><strong>Traitement I.A local.</strong> Vos documents sont stockés sur le serveur DashIA et analysés par votre agent : aucune donnée n'est envoyée à un service d'I.A tiers.</span>
        </p>
        <div class="card card-flush group">
          <button class="settings-btn" type="button" @click="exportData"><AppIcon name="file-export" :size="14" />Exporter mes données<AppIcon name="chevron-right" :size="12" class="chevron" /></button>
          <button class="settings-btn danger" type="button" :disabled="busy === 'history'" @click="clearHistory"><AppIcon name="trash" :size="14" />Effacer l'historique des discussions</button>
        </div>
      </section>

      <section class="section">
        <h2 class="section-label">Apparence</h2>
        <div class="segmented">
          <button v-for="option in THEMES" :key="option.value" type="button" :class="{ active: theme === option.value }" @click="setTheme(option.value)">
            <AppIcon :name="option.icon" :size="12" />{{ option.label }}
          </button>
        </div>
      </section>

      <button class="btn btn-lg btn-block logout" type="button" @click="signOut"><AppIcon name="logout" :size="14" />Se déconnecter</button>
      <button class="text-btn delete" type="button" :disabled="busy === 'account'" @click="deleteAccount">Supprimer mon compte</button>
      <p class="tiny muted center">DashIA · protocole agent v1</p>
    </main>
  </div>
</template>

<style scoped>
.profile {
  display: flex;
  align-items: center;
  gap: 14px;
}

.profile .grow {
  display: flex;
  flex-direction: column;
}

.name {
  font-size: 16px;
  font-weight: 800;
}

.select {
  max-width: 180px;
  min-height: 36px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  font-size: 12px;
  font-weight: 700;
}

.select.mini {
  min-height: 24px;
  padding: 0 4px;
}

.inline {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.ok-text {
  color: var(--primary);
  font-weight: 700;
}

.storage {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.big {
  font-size: 24px;
  line-height: 32px;
  font-weight: 800;
}

.segments {
  display: flex;
  height: 8px;
  border-radius: var(--radius-pill);
  background: var(--surface-muted);
  overflow: hidden;
}

.segments span {
  display: block;
  height: 100%;
}

.legend {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px 12px;
  font-size: 12px;
  color: var(--text-muted);
}

.legend li {
  display: flex;
  align-items: center;
  gap: 6px;
}

.legend i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.privacy {
  display: flex;
  gap: 10px;
  padding: 14px;
  border: 1px solid color-mix(in srgb, var(--primary) 25%, var(--border));
  border-radius: var(--radius-lg);
  background: var(--primary-soft);
  color: var(--text);
}

.privacy .app-icon {
  margin-top: 3px;
  color: var(--primary-strong);
}

.group > * + * {
  border-top: 1px solid var(--border);
}

.settings-btn {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 56px;
  padding: 0 16px;
  border: none;
  background: none;
  font-weight: 800;
  text-align: left;
  cursor: pointer;
}

.settings-btn .chevron {
  margin-left: auto;
  color: var(--text-muted);
}

.settings-btn.danger {
  color: var(--danger);
}

.logout {
  color: var(--danger);
}

.delete {
  align-self: center;
  color: var(--text-muted);
}

.center {
  text-align: center;
}
</style>

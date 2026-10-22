import type { HomeRoom, HomeState, ProposedAction } from '@app/shared';

export interface HomeToast {
  text: string;
  activityId: string | null;
  error?: boolean;
}

/** Maison Philips Hue : état, actions directes (panel) et annulation depuis la notification. */
export function useHome() {
  const home = useState<HomeState | null>('home', () => null);
  const toast = useState<HomeToast | null>('home-toast', () => null);
  const loading = ref(false);
  const busy = ref<string | null>(null);

  async function refresh() {
    loading.value = true;
    try {
      home.value = await $fetch<HomeState>('/api/home');
    } catch (error) {
      toast.value = { text: getErrorMessage(error, 'Votre pont Hue ne répond pas.'), activityId: null, error: true };
    } finally {
      loading.value = false;
    }
  }

  async function run(key: string, action: ProposedAction, summary: string) {
    busy.value = key;
    try {
      const response = await $fetch<{ status: string; activityId?: string }>('/api/home/actions', { method: 'POST', body: { action, summary } });
      toast.value = { text: summary, activityId: response.activityId ?? null };
      await refresh();
    } catch (error) {
      toast.value = { text: getErrorMessage(error), activityId: null, error: true };
    } finally {
      busy.value = null;
    }
  }

  async function undo() {
    const activityId = toast.value?.activityId;
    if (!activityId) return;
    try {
      await $fetch(`/api/activity/${activityId}/undo`, { method: 'POST' });
      toast.value = { text: 'Action annulée', activityId: null };
      await refresh();
    } catch (error) {
      toast.value = { text: getErrorMessage(error), activityId: null, error: true };
    }
  }

  const toggleRoom = (room: HomeRoom) => run(room.id, { type: 'hue.set_room', payload: { roomId: room.id, on: !room.on } }, `${room.on ? 'Éteindre' : 'Allumer'} ${room.name}`);
  const dimRoom = (room: HomeRoom, brightness: number) => run(room.id, { type: 'hue.set_room', payload: { roomId: room.id, brightness } }, `${room.name} à ${brightness} %`);
  const allOff = () => run('all', { type: 'hue.set_room', payload: { roomId: 'all', on: false } }, 'Tout éteindre');
  const scene = (id: string, name: string) => run(id, { type: 'hue.activate_scene', payload: { sceneId: id } }, `Scène « ${name} »`);
  const toggleLight = (light: { id: string; name: string; on: boolean }) => run(light.id, { type: 'hue.set_light', payload: { lightId: light.id, on: !light.on } }, `${light.on ? 'Éteindre' : 'Allumer'} ${light.name}`);

  const lightsOn = computed(() => (home.value?.rooms ?? []).filter((room) => room.kind === 'room').flatMap((room) => room.lights).filter((light) => light.on).length);

  return { home, toast, loading, busy, refresh, toggleRoom, dimRoom, allOff, scene, toggleLight, undo, lightsOn };
}

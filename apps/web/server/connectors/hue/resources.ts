import type { HomeRoom, HomeScene, HomeState } from '@app/shared';

/** Sous-ensemble des ressources CLIP v2 de Philips Hue utilisées par DashIA. */
interface ResourceRef {
  rid: string;
  rtype: string;
}

export interface HueResources {
  room: { id: string; metadata: { name: string; archetype?: string }; children: ResourceRef[]; services: ResourceRef[] }[];
  zone: { id: string; metadata: { name: string; archetype?: string }; children: ResourceRef[]; services: ResourceRef[] }[];
  device: { id: string; metadata: { name: string }; services: ResourceRef[] }[];
  light: { id: string; owner: ResourceRef; metadata?: { name: string }; on: { on: boolean }; dimming?: { brightness: number } }[];
  grouped_light: { id: string; on?: { on: boolean }; dimming?: { brightness: number } }[];
  scene: { id: string; metadata: { name: string }; group: ResourceRef }[];
  zigbee_connectivity: { id: string; owner: ResourceRef; status: string }[];
}

export const HUE_RESOURCE_TYPES = ['room', 'zone', 'device', 'light', 'grouped_light', 'scene', 'zigbee_connectivity'] as const;

const round = (value: number | undefined) => (value === undefined ? null : Math.round(value));

/** Construit l'état de la maison (pièces, lampes, scènes) à partir des ressources du pont. */
export function buildHomeState(resources: HueResources): HomeState {
  const devices = new Map(resources.device.map((device) => [device.id, device]));
  const lightsById = new Map(resources.light.map((light) => [light.id, light]));
  const groupedLights = new Map(resources.grouped_light.map((group) => [group.id, group]));
  const unreachable = new Set(resources.zigbee_connectivity.filter((item) => item.status !== 'connected').map((item) => item.owner.rid));

  const toLight = (lightId: string) => {
    const light = lightsById.get(lightId);
    if (!light) return null;
    const device = devices.get(light.owner.rid);
    return {
      id: light.id,
      name: light.metadata?.name ?? device?.metadata.name ?? 'Lampe',
      on: light.on.on,
      brightness: round(light.dimming?.brightness),
      reachable: !unreachable.has(light.owner.rid),
    };
  };

  const groups = [
    ...resources.room.map((room) => ({ ...room, kind: 'room' as const })),
    ...resources.zone.map((zone) => ({ ...zone, kind: 'zone' as const })),
  ];

  const rooms: HomeRoom[] = groups.map((group) => {
    // Une pièce contient des appareils ; une zone contient directement des lampes.
    const lightIds = group.children.flatMap((child) => (child.rtype === 'light'
      ? [child.rid]
      : (devices.get(child.rid)?.services ?? []).filter((service) => service.rtype === 'light').map((service) => service.rid)));
    const lights = lightIds.map(toLight).filter((light) => light !== null);
    const grouped = group.services.find((service) => service.rtype === 'grouped_light');
    const state = grouped ? groupedLights.get(grouped.rid) : undefined;
    return {
      id: grouped?.rid ?? group.id,
      name: group.metadata.name,
      kind: group.kind,
      archetype: group.metadata.archetype ?? null,
      on: state?.on?.on ?? lights.some((light) => light.on),
      brightness: round(state?.dimming?.brightness),
      lights,
    };
  });

  /** Les scènes pointent vers une pièce/zone : on expose l'identifiant de son groupe de lumières. */
  const groupedByGroup = new Map(groups.map((group) => [group.id, group.services.find((service) => service.rtype === 'grouped_light')?.rid ?? group.id]));
  const scenes: HomeScene[] = resources.scene.map((scene) => ({
    id: scene.id,
    name: scene.metadata.name,
    roomId: groupedByGroup.get(scene.group.rid) ?? null,
  }));

  return { connected: true, rooms, scenes };
}

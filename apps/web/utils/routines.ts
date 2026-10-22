import type { RoutineIcon, RoutineInput, RoutineSchedule } from '@app/shared';

export const ROUTINE_ICON_TONES: Record<RoutineIcon, string> = {
  sun: 'tone-warning',
  moon: 'tone-info',
  'door-exit': 'tone-primary',
  house: 'tone-primary',
  laptop: 'tone-warning',
  bed: 'tone-info',
  car: '',
  mug: 'tone-warning',
  film: 'tone-info',
  lightbulb: 'tone-warning',
};

const DAY_LABELS = ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'];

/** « tous les jours », « lun → ven », « sam, dim »… */
export function describeDays(days: number[]): string {
  const sorted = [...days].sort();
  if (sorted.length === 7) return 'tous les jours';
  if (sorted.join() === '1,2,3,4,5') return 'lun → ven';
  if (sorted.join() === '6,7') return 'le week-end';
  return sorted.map((day) => DAY_LABELS[day - 1]).join(', ');
}

export function describeSchedule(schedule: RoutineSchedule | null): string | null {
  return schedule ? `${schedule.time} · ${describeDays(schedule.days)}` : null;
}

/** Modèles proposés à la création (les pièces/scènes sont choisies ensuite). */
export const ROUTINE_TEMPLATES: (Omit<RoutineInput, 'enabled'> & { description: string })[] = [
  {
    name: 'Bonjour',
    icon: 'sun',
    description: 'Lumière douce et récap de la journée',
    schedule: { time: '07:30', days: [1, 2, 3, 4, 5] },
    steps: [
      { type: 'hue.set_room', payload: { roomId: 'all', on: true, brightness: 40 }, label: 'Allumer la maison à 40 %' },
      { type: 'agent', prompt: 'Fais-moi le résumé de ma journée : rendez-vous, rappels et échéances proches.', label: 'Résumé de la journée' },
    ],
  },
  {
    name: 'Départ maison',
    icon: 'door-exit',
    description: 'Tout éteindre en partant',
    schedule: null,
    steps: [
      { type: 'hue.set_room', payload: { roomId: 'all', on: false }, label: 'Éteindre toutes les lampes' },
      { type: 'agent', prompt: 'Quel est mon prochain rendez-vous aujourd’hui ?', label: 'Me lire le prochain RDV' },
    ],
  },
  {
    name: 'Bonne nuit',
    icon: 'moon',
    description: 'Extinction et rappels du lendemain',
    schedule: { time: '23:00', days: [1, 2, 3, 4, 5, 6, 7] },
    steps: [
      { type: 'hue.set_room', payload: { roomId: 'all', on: false }, label: 'Éteindre toutes les lampes' },
      { type: 'agent', prompt: 'Qu’ai-je de prévu demain ? Rappels et rendez-vous.', label: 'Programme de demain' },
    ],
  },
  {
    name: 'Mode travail',
    icon: 'laptop',
    description: 'Lumière franche et rappel de pause',
    schedule: null,
    steps: [
      { type: 'hue.set_room', payload: { roomId: 'all', on: true, brightness: 100 }, label: 'Lumière à 100 %' },
      { type: 'reminder', text: 'Faire une pause', offsetMinutes: 90, label: 'Pause dans 1 h 30' },
    ],
  },
];

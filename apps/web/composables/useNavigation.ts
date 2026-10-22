import type { IconName } from '~/utils/icons';

export interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  /** Icône pleine pour l'onglet actif (barre du bas). */
  activeIcon?: IconName;
  count?: number;
  adminOnly?: boolean;
}

/** Onglets de la barre du bas (mobile). Les autres pages sont dans « Plus ». */
export const PRIMARY_NAV: NavItem[] = [
  { to: '/', label: 'Accueil', icon: 'house' },
  { to: '/chat', label: 'Discussions', icon: 'comments', activeIcon: 'comments-solid' },
  { to: '/drive', label: 'Drive', icon: 'folder', activeIcon: 'folder-solid' },
  { to: '/maison', label: 'Maison', icon: 'lightbulb' },
];

export const SECONDARY_NAV: NavItem[] = [
  { to: '/planning', label: 'Planning', icon: 'calendar' },
  { to: '/actions', label: 'Actions', icon: 'hand' },
  { to: '/routines', label: 'Routines', icon: 'repeat' },
  { to: '/tags', label: 'Tags NFC', icon: 'nfc' },
  { to: '/journal', label: "Journal d'activité", icon: 'history' },
  { to: '/settings', label: 'Réglages', icon: 'list-check' },
  { to: '/admin/agents', label: 'Agents locaux', icon: 'desktop', adminOnly: true },
];

export function isRouteActive(path: string, to: string): boolean {
  if (to === '/') return path === '/';
  return path === to || path.startsWith(`${to}/`);
}

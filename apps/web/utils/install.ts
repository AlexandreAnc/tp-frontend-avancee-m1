/**
 * Comment proposer l'installation de l'app sur cet appareil :
 * - `installed` : déjà ouverte depuis l'écran d'accueil, rien à proposer ;
 * - `prompt` : le navigateur a fourni l'invite d'installation (`beforeinstallprompt`, Chrome, Edge, Samsung Internet) ;
 * - `ios` : iPhone et iPad n'ont pas d'invite, l'installation passe par le menu Partager (Safari, et Chrome ou Firefox depuis iOS 16.4) ;
 * - `manual` : autre navigateur, ou invite pas encore reçue : on indique le menu du navigateur.
 */
export type InstallMode = 'installed' | 'prompt' | 'ios' | 'manual';

export interface InstallContext {
  /** `display-mode: standalone` (ou `navigator.standalone` sur iOS). */
  standalone: boolean;
  promptAvailable: boolean;
  userAgent: string;
  maxTouchPoints: number;
}

/** iPhone, iPod, ou iPad (qui se présente comme un Mac depuis iPadOS 13, mais tactile). */
export function isAppleMobile(userAgent: string, maxTouchPoints: number): boolean {
  return /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
}

export function installMode(context: InstallContext): InstallMode {
  if (context.standalone) return 'installed';
  if (context.promptAvailable) return 'prompt';
  if (isAppleMobile(context.userAgent, context.maxTouchPoints)) return 'ios';
  return 'manual';
}

import type { FileStatus, PendingActionStatus } from '@app/shared';

export const FILE_STATUS_LABELS: Record<FileStatus, { label: string; tone: string; icon: 'clock' | 'spinner' | 'check' | 'triangle-exclamation' }> = {
  pending: { label: 'Importé', tone: '', icon: 'clock' },
  processing: { label: 'En cours', tone: 'tone-info', icon: 'spinner' },
  ready: { label: 'Analysé', tone: 'tone-primary', icon: 'check' },
  failed: { label: 'Erreur', tone: 'tone-danger', icon: 'triangle-exclamation' },
};

export const ACTION_STATUS_LABELS: Record<PendingActionStatus, { label: string; tone: string; icon: 'clock' | 'spinner' | 'check' | 'xmark' | 'ban' | 'hourglass' }> = {
  pending: { label: 'À valider', tone: 'tone-warning', icon: 'clock' },
  approved: { label: 'En cours', tone: 'tone-info', icon: 'spinner' },
  executed: { label: 'Réussie', tone: 'tone-primary', icon: 'check' },
  failed: { label: 'Échouée', tone: 'tone-danger', icon: 'xmark' },
  rejected: { label: 'Refusée', tone: '', icon: 'ban' },
  expired: { label: 'Expirée', tone: '', icon: 'hourglass' },
};

/** Sous-titre d'un fichier : catégorie / type puis taille, ou état d'avancement. */
export function fileSubtitle(file: { status: FileStatus; sizeBytes: number; createdAt: string; analysis: { documentType: string } | null; error?: string | null }): string {
  if (file.status === 'failed') return file.error ?? "L'analyse a échoué";
  if (file.status === 'processing') return 'Analyse par votre agent…';
  if (file.status === 'pending') return `${formatBytes(file.sizeBytes)} · ${formatRelative(file.createdAt)}`;
  return [file.analysis?.documentType, formatBytes(file.sizeBytes)].filter(Boolean).join(' · ');
}

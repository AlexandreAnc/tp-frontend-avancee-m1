export { formatBytes } from '@app/shared';

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
}

export function formatRelative(iso: string): string {
  const seconds = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [['day', 86400], ['hour', 3600], ['minute', 60]];
  const format = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' });
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit);
  }
  return "à l'instant";
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}

function renderInline(text: string): string {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
}

/**
 * Rendu Markdown minimal des réponses de l'agent (gras, italique, code, listes, titres).
 * Le texte est échappé avant toute transformation : aucun HTML du modèle n'est interprété.
 */
export function renderMarkdown(markdown: string): string {
  const html: string[] = [];
  let list: 'ul' | 'ol' | null = null;
  const closeList = () => {
    if (list) html.push(`</${list}>`);
    list = null;
  };

  for (const line of markdown.split('\n')) {
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    const ordered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (bullet || ordered) {
      const kind = bullet ? 'ul' : 'ol';
      if (list !== kind) {
        closeList();
        html.push(`<${kind}>`);
        list = kind;
      }
      html.push(`<li>${renderInline((bullet ?? ordered)![1]!)}</li>`);
    } else if (heading) {
      closeList();
      html.push(`<p><strong>${renderInline(heading[2]!)}</strong></p>`);
    } else if (line.trim()) {
      closeList();
      html.push(`<p>${renderInline(line)}</p>`);
    } else {
      closeList();
    }
  }
  closeList();
  return html.join('');
}

export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

export function formatDayLong(date: Date | string): string {
  const text = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(date));
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function formatShortDate(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit' }).format(new Date(iso));
}

/** Début et fin (exclue) du jour local contenant `date`, décalés de `offsetDays`. */
export function dayRange(date = new Date(), offsetDays = 0, lengthDays = 1) {
  const from = new Date(date.getFullYear(), date.getMonth(), date.getDate() + offsetDays);
  const to = new Date(from.getFullYear(), from.getMonth(), from.getDate() + lengthDays);
  return { from: from.toISOString(), to: to.toISOString() };
}

/** Nombre de jours entre aujourd'hui et une date (AAAA-MM-JJ ou ISO), pour les puces « J-14 ». */
export function daysUntil(dateOrIso: string, now = new Date()): number {
  const target = new Date(dateOrIso.length === 10 ? `${dateOrIso}T00:00:00` : dateOrIso);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  return Math.round((day.getTime() - today.getTime()) / 86_400_000);
}

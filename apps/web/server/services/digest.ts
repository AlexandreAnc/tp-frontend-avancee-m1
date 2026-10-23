import { and, eq, isNull, ne, or } from 'drizzle-orm';
import { db, schema } from '../db';
import { getAgenda } from './agenda';
import { countPendingActions } from './actions';
import { sendToUser } from './push';

const { userSettings } = schema;

/** Date et heure locales d'un instant dans un fuseau donné. */
export function localParts(now: Date, timezone: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(now).map((part) => [part.type, part.value]));
  return { day: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}

const plural = (count: number, word: string) => `${count} ${word}${count > 1 ? 's' : ''}`;

/** Texte du résumé : événements et rappels du jour, échéances de la semaine, actions à valider. */
export async function buildDigest(userId: string, now: Date): Promise<string> {
  const dayEnd = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const weekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const [today, week, pending] = await Promise.all([
    getAgenda(userId, now, dayEnd),
    getAgenda(userId, now, weekEnd),
    countPendingActions(userId),
  ]);

  const events = today.items.filter((item) => item.kind === 'event').length;
  const reminders = today.items.filter((item) => item.kind === 'reminder').length;
  const deadlines = week.items.filter((item) => item.kind === 'deadline').length;
  const parts = [
    events && plural(events, 'événement'),
    reminders && plural(reminders, 'rappel'),
    deadlines && `${plural(deadlines, 'échéance')} cette semaine`,
    pending && `${plural(pending, 'action')} à valider`,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'Rien de prévu aujourd’hui.';
}

/**
 * Lancé toutes les heures : envoie le résumé aux utilisateurs dont c'est l'heure locale,
 * une seule fois par jour (`last_digest_on`).
 */
export async function runDigests(now = new Date()): Promise<number> {
  const candidates = await db.select().from(userSettings).where(eq(userSettings.digestEnabled, true));

  let sent = 0;
  for (const settings of candidates) {
    const local = localParts(now, settings.timezone);
    if (local.hour !== settings.digestHour || settings.lastDigestOn === local.day) continue;

    const [claimed] = await db.update(userSettings).set({ lastDigestOn: local.day })
      .where(and(eq(userSettings.userId, settings.userId), or(isNull(userSettings.lastDigestOn), ne(userSettings.lastDigestOn, local.day))))
      .returning();
    if (!claimed) continue;

    await sendToUser(settings.userId, { title: 'Votre journée', body: await buildDigest(settings.userId, now), url: '/panel', tag: 'digest' });
    sent++;
  }
  return sent;
}

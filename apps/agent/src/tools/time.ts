function offsetMinutesAt(instant: Date, timezone: string): number {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: timezone, timeZoneName: 'longOffset' })
    .formatToParts(instant).find((part) => part.type === 'timeZoneName')?.value ?? 'GMT';
  const match = /GMT([+-])(\d{2}):(\d{2})/.exec(name);
  if (!match) return 0;
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === '-' ? -minutes : minutes;
}

function formatOffset(minutes: number): string {
  const sign = minutes < 0 ? '-' : '+';
  const absolute = Math.abs(minutes);
  return `${sign}${String(Math.floor(absolute / 60)).padStart(2, '0')}:${String(absolute % 60).padStart(2, '0')}`;
}

/**
 * Convertit une heure locale (`2026-11-14T09:00`) d'un fuseau en ISO 8601 avec le décalage
 * en vigueur à cette date (`2026-11-14T09:00:00+01:00` pour Europe/Paris en hiver).
 */
export function localToZonedIso(local: string, timezone: string): string {
  const [datePart, timePart = '00:00'] = local.split('T');
  const time = timePart.length === 5 ? `${timePart}:00` : timePart.slice(0, 8);
  const asUtc = new Date(`${datePart}T${time}Z`);
  // Deux passes : le décalage dépend de l'instant, qui dépend lui-même du décalage (changement d'heure).
  let offset = offsetMinutesAt(asUtc, timezone);
  offset = offsetMinutesAt(new Date(asUtc.getTime() - offset * 60_000), timezone);
  return `${datePart}T${time}${formatOffset(offset)}`;
}

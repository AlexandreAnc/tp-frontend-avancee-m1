import { z } from 'zod';

/** Élément du planning : événement Google Agenda, rappel, ou échéance détectée dans un document. */
export const agendaItemSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('event'),
    id: z.string(),
    title: z.string(),
    start: z.string(),
    end: z.string().nullable(),
    allDay: z.boolean(),
    location: z.string().nullable(),
    link: z.string().nullable(),
  }),
  z.object({
    kind: z.literal('reminder'),
    id: z.uuid(),
    title: z.string(),
    start: z.string(),
    status: z.enum(['scheduled', 'sent', 'done', 'cancelled']),
    fileId: z.uuid().nullable(),
  }),
  z.object({
    kind: z.literal('deadline'),
    id: z.string(),
    title: z.string(),
    /** Date seule (AAAA-MM-JJ). */
    start: z.string(),
    fileId: z.uuid(),
    fileName: z.string(),
    detail: z.string().nullable(),
  }),
]);

export type AgendaItem = z.infer<typeof agendaItemSchema>;

export const agendaResponseSchema = z.object({
  items: z.array(agendaItemSchema),
  /** Faux si Google Agenda n'est pas connecté : seuls rappels et échéances sont listés. */
  calendarConnected: z.boolean(),
});

export type AgendaResponse = z.infer<typeof agendaResponseSchema>;

export const agendaQuerySchema = z.object({
  from: z.iso.datetime({ offset: true }),
  to: z.iso.datetime({ offset: true }),
}).refine((range) => new Date(range.to) > new Date(range.from), { message: 'Période invalide', path: ['to'] });

export const REMINDER_STATUSES = ['scheduled', 'sent', 'done', 'cancelled'] as const;
export type ReminderStatus = (typeof REMINDER_STATUSES)[number];

import { z } from 'zod';

/** Catégories du drive. L'agent en suggère une à l'analyse, l'utilisateur la confirme. */
export const FILE_CATEGORIES = [
  'Factures', 'Logement', 'Santé', 'Banque', 'Impôts', 'Travail', 'Véhicule', 'Assurance', 'Identité', 'Autre',
] as const;
export type FileCategory = (typeof FILE_CATEGORIES)[number];

export const fileAnalysisSchema = z.object({
  documentType: z.string().min(1).max(100),
  /** Catégorie suggérée (absente des analyses antérieures à son introduction). */
  category: z.enum(FILE_CATEGORIES).optional(),
  summary: z.string().min(1).max(2000),
  keyInfo: z.object({
    dates: z.array(z.object({
      label: z.string(),
      value: z.string(),
      /** Date exploitable (AAAA-MM-JJ) quand le document la précise : alimente le planning et les rappels. */
      iso: z.iso.date().nullable().optional(),
      /** Vrai pour une échéance (paiement, résiliation, rendu…), à rappeler à l'utilisateur. */
      isDeadline: z.boolean().optional(),
    })).max(20),
    amounts: z.array(z.object({ label: z.string(), value: z.string() })).max(20),
    names: z.array(z.string()).max(30),
  }),
  suggestedActions: z.array(z.object({ label: z.string(), description: z.string() })).max(5),
});

export type FileAnalysis = z.infer<typeof fileAnalysisSchema>;

export const FILE_STATUSES = ['pending', 'processing', 'ready', 'failed'] as const;
export type FileStatus = (typeof FILE_STATUSES)[number];

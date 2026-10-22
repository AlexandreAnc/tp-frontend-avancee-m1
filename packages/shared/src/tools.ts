import { z } from 'zod';
import { agendaResponseSchema } from './agenda';
import { homeStateSchema } from './home';
import {
  createActionResponseSchema,
  exactSearchResponseSchema,
  listFilesResponseSchema,
  readFileResponseSchema,
  semanticSearchResponseSchema,
} from './agent-api';

export interface ToolDefinition<TInput extends z.ZodType = z.ZodType, TOutput extends z.ZodType = z.ZodType> {
  name: string;
  description: string;
  input: TInput;
  output: TOutput;
}

function defineTool<TInput extends z.ZodType, TOutput extends z.ZodType>(
  definition: ToolDefinition<TInput, TOutput>,
): ToolDefinition<TInput, TOutput> {
  return definition;
}

/** Définitions des outils exposés au modèle. L'implémentation vit dans `apps/agent/src/tools`. */
export const toolDefinitions = {
  list_files: defineTool({
    name: 'list_files',
    description: "Liste les fichiers du drive de l'utilisateur avec leur dossier, leur type de document et leur résumé.",
    input: z.object({}),
    output: listFilesResponseSchema,
  }),
  move_file: defineTool({
    name: 'move_file',
    description: "Range un fichier dans un dossier du drive (ex. « Logement/2026 »), en créant les dossiers manquants. Chemin vide = racine. Exécuté immédiatement, annulable.",
    input: z.object({
      fileId: z.uuid().describe('Identifiant du fichier (voir list_files)'),
      folderPath: z.string().max(500).describe('Chemin du dossier, séparé par « / »'),
    }),
    output: createActionResponseSchema,
  }),
  read_file: defineTool({
    name: 'read_file',
    description: "Lit le texte d'un fichier du drive. Utilise offset pour lire la suite d'un long document.",
    input: z.object({
      fileId: z.uuid().describe('Identifiant du fichier (voir list_files)'),
      offset: z.number().int().nonnegative().optional().describe('Position de départ en caractères'),
    }),
    output: readFileResponseSchema,
  }),
  semantic_search: defineTool({
    name: 'semantic_search',
    description: 'Recherche par le sens dans le contenu de tous les fichiers. À utiliser pour retrouver une information ou le bon document.',
    input: z.object({
      query: z.string().min(1).describe('Question ou description de ce qui est cherché'),
      limit: z.number().int().min(1).max(20).optional(),
    }),
    output: semanticSearchResponseSchema,
  }),
  exact_search: defineTool({
    name: 'exact_search',
    description: 'Recherche un texte exact (nom, numéro, référence) dans les fichiers, sans tenir compte de la casse.',
    input: z.object({
      query: z.string().min(1).max(200),
    }),
    output: exactSearchResponseSchema,
  }),
  create_calendar_event: defineTool({
    name: 'create_calendar_event',
    description: "Propose d'ajouter un événement à Google Agenda. L'événement n'est créé qu'après validation par l'utilisateur.",
    // Heures locales sans décalage : l'agent calcule le décalage du fuseau à la date de l'événement (heure d'été/hiver).
    input: z.object({
      title: z.string().min(1).max(200),
      start: z.iso.datetime({ local: true }).describe("Début en heure locale, ex. 2026-11-14T09:00"),
      end: z.iso.datetime({ local: true }).describe("Fin en heure locale, ex. 2026-11-14T10:00"),
      description: z.string().max(2000).optional(),
      location: z.string().max(300).optional(),
    }),
    output: createActionResponseSchema,
  }),
  create_reminder: defineTool({
    name: 'create_reminder',
    description: "Programme un rappel envoyé à l'utilisateur par notification à l'heure dite. Exécuté immédiatement, sans validation.",
    input: z.object({
      text: z.string().min(1).max(300).describe('Texte du rappel, ex. « Payer la facture Plomberie Martin (340,50 €) »'),
      at: z.iso.datetime({ local: true }).describe('Heure locale du rappel, ex. 2026-11-14T09:00'),
      fileId: z.uuid().optional().describe('Document concerné, si le rappel porte sur un document'),
    }),
    output: createActionResponseSchema,
  }),
  get_home: defineTool({
    name: 'get_home',
    description: "État de la maison Philips Hue : pièces, lampes allumées, luminosité et scènes disponibles. À consulter avant d'agir sur les lumières.",
    input: z.object({}),
    output: homeStateSchema,
  }),
  control_lights: defineTool({
    name: 'control_lights',
    description: "Allume, éteint ou règle la luminosité d'une pièce (roomId de get_home) ou de toute la maison (roomId « all »). Exécuté immédiatement.",
    input: z.object({
      roomId: z.string().min(1).describe('Identifiant de pièce (get_home) ou « all »'),
      on: z.boolean().optional(),
      brightness: z.number().int().min(1).max(100).optional().describe('Luminosité en %'),
    }),
    output: createActionResponseSchema,
  }),
  activate_scene: defineTool({
    name: 'activate_scene',
    description: 'Active une scène Hue (sceneId de get_home). Exécuté immédiatement.',
    input: z.object({ sceneId: z.string().min(1) }),
    output: createActionResponseSchema,
  }),
  list_routines: defineTool({
    name: 'list_routines',
    description: "Liste les routines de l'utilisateur (Bonjour, Départ maison, Bonne nuit…) avec leurs étapes.",
    input: z.object({}),
    output: z.object({ routines: z.array(z.object({ id: z.uuid(), name: z.string(), enabled: z.boolean(), steps: z.array(z.string()) })) }),
  }),
  run_routine: defineTool({
    name: 'run_routine',
    description: 'Lance une routine (id de list_routines) immédiatement.',
    input: z.object({ routineId: z.uuid() }),
    output: z.object({ status: z.enum(['success', 'partial', 'failed']), steps: z.array(z.object({ label: z.string(), status: z.string(), error: z.string().nullable() })) }),
  }),
  get_agenda: defineTool({
    name: 'get_agenda',
    description: "Consulte le planning de l'utilisateur sur une période : événements Google Agenda, rappels et échéances détectées dans ses documents.",
    input: z.object({
      from: z.iso.date().describe('Premier jour (AAAA-MM-JJ)'),
      to: z.iso.date().describe('Dernier jour inclus (AAAA-MM-JJ)'),
    }),
    output: agendaResponseSchema,
  }),
} as const;

export type ToolName = keyof typeof toolDefinitions;
export const TOOL_NAMES = Object.keys(toolDefinitions) as ToolName[];

export type ToolInput<T extends ToolName> = z.infer<(typeof toolDefinitions)[T]['input']>;
export type ToolOutput<T extends ToolName> = z.infer<(typeof toolDefinitions)[T]['output']>;

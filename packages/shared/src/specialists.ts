import { z } from 'zod';
import type { ToolName } from './tools';

/**
 * Agents spécialisés coordonnés par l'orchestrateur. Chacun n'a accès qu'à ses outils :
 * l'orchestrateur ne touche à aucun outil métier, il délègue (`ask_<spécialiste>`) puis synthétise.
 */
export const SPECIALIST_NAMES = ['documents', 'planning', 'home'] as const;
export type SpecialistName = (typeof SPECIALIST_NAMES)[number];

/** Auteur d'une étape de la boucle : l'orchestrateur ou un spécialiste. */
export const AGENT_ROLES = ['orchestrator', ...SPECIALIST_NAMES] as const;
export const agentRoleSchema = z.enum(AGENT_ROLES);
export type AgentRole = z.infer<typeof agentRoleSchema>;

export interface SpecialistDefinition {
  label: string;
  /** Présentation donnée à l'orchestrateur pour choisir à qui déléguer. */
  description: string;
  tools: readonly ToolName[];
}

export const SPECIALISTS = {
  documents: {
    label: 'Documents',
    description: 'Drive de l\'utilisateur : retrouver un document, y lire une information (montant, date, nom, clause), lister ou ranger des fichiers.',
    tools: ['list_files', 'read_file', 'semantic_search', 'exact_search', 'move_file'],
  },
  planning: {
    label: 'Planning',
    description: 'Agenda, rappels et échéances : consulter une période, programmer un rappel, proposer un événement Google Agenda.',
    tools: ['get_agenda', 'create_reminder', 'create_calendar_event'],
  },
  home: {
    label: 'Maison',
    description: 'Lumières Philips Hue et routines : état des pièces, allumer, éteindre, régler, activer une scène, lancer une routine.',
    tools: ['get_home', 'control_lights', 'activate_scene', 'list_routines', 'run_routine'],
  },
} as const satisfies Record<SpecialistName, SpecialistDefinition>;

/** Nom de l'outil de délégation exposé à l'orchestrateur (`ask_documents`…). */
export function delegationToolName(specialist: SpecialistName): string {
  return `ask_${specialist}`;
}

export function specialistForDelegationTool(tool: string): SpecialistName | null {
  return SPECIALIST_NAMES.find((name) => delegationToolName(name) === tool) ?? null;
}

export const delegationInputSchema = z.object({
  task: z.string().min(1).max(2000).describe(
    'Consigne autonome pour le spécialiste : ce qu\'il doit faire ou trouver, avec les noms, dates, montants et identifiants utiles (il ne voit pas la conversation).',
  ),
});
export type DelegationInput = z.infer<typeof delegationInputSchema>;

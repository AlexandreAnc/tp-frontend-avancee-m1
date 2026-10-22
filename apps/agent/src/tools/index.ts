import { TOOL_NAMES, type ToolInput, type ToolName } from '@app/shared';
import type { Tool } from 'ollama';
import { z } from 'zod';
import { activateSceneTool } from './activate-scene';
import { controlLightsTool } from './control-lights';
import { createCalendarEventTool } from './create-calendar-event';
import { createReminderTool } from './create-reminder';
import { exactSearchTool } from './exact-search';
import { getAgendaTool } from './get-agenda';
import { getHomeTool } from './get-home';
import { listRoutinesTool } from './list-routines';
import { moveFileTool } from './move-file';
import { runRoutineTool } from './run-routine';
import { listFilesTool } from './list-files';
import { readFileTool } from './read-file';
import { semanticSearchTool } from './semantic-search';
import type { AgentTool, ToolContext } from './types';

export const tools: { [N in ToolName]: AgentTool<N> } = {
  list_files: listFilesTool,
  move_file: moveFileTool,
  read_file: readFileTool,
  semantic_search: semanticSearchTool,
  exact_search: exactSearchTool,
  create_calendar_event: createCalendarEventTool,
  create_reminder: createReminderTool,
  get_home: getHomeTool,
  control_lights: controlLightsTool,
  activate_scene: activateSceneTool,
  list_routines: listRoutinesTool,
  run_routine: runRoutineTool,
  get_agenda: getAgendaTool,
};

/** Définitions au format attendu par Ollama, générées depuis les schémas Zod partagés. */
export function toOllamaTools(): Tool[] {
  return TOOL_NAMES.map((name) => {
    const { definition } = tools[name];
    return {
      type: 'function',
      function: {
        name: definition.name,
        description: definition.description,
        // Le JSON Schema généré par Zod est plus riche que le type déclaré par la lib ollama.
        parameters: z.toJSONSchema(definition.input, { io: 'input' }) as NonNullable<Tool['function']['parameters']>,
      },
    };
  });
}

export function isToolName(name: string): name is ToolName {
  return (TOOL_NAMES as string[]).includes(name);
}

export type ToolCallResult = { ok: true; output: unknown } | { ok: false; error: string };

/** Valide les arguments fournis par le modèle, exécute l'outil et valide sa sortie. */
export async function runTool(name: string, args: unknown, context: ToolContext): Promise<ToolCallResult> {
  if (!isToolName(name)) return { ok: false, error: `Outil inconnu : ${name}` };
  const tool = tools[name] as AgentTool;

  const input = tool.definition.input.safeParse(args);
  if (!input.success) {
    return { ok: false, error: `Arguments invalides : ${z.prettifyError(input.error)}` };
  }
  // `input.data` a été validé par le schéma de cet outil précis.
  const output = await tool.execute(input.data as ToolInput<ToolName>, context);
  return { ok: true, output: tool.definition.output.parse(output) };
}

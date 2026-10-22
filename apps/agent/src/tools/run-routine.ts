import { defineAgentTool } from './types';

export const runRoutineTool = defineAgentTool('run_routine', (input, { api }) => api.runRoutine(input.routineId));

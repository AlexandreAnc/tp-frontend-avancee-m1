import { defineAgentTool } from './types';

export const listRoutinesTool = defineAgentTool('list_routines', (_input, { api }) => api.listRoutines());

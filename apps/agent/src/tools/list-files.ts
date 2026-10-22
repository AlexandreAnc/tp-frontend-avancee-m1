import { defineAgentTool } from './types';

export const listFilesTool = defineAgentTool('list_files', (_input, { api }) => api.listFiles());

import { defineAgentTool } from './types';

export const getHomeTool = defineAgentTool('get_home', (_input, { api }) => api.getHome());

import { defineAgentTool } from './types';

export const readFileTool = defineAgentTool('read_file', (input, { api }) => api.readFile(input.fileId, input.offset));

import { defineAgentTool } from './types';

const LIMIT = 10;

export const exactSearchTool = defineAgentTool('exact_search', (input, { api }) =>
  api.exactSearch({ query: input.query, limit: LIMIT }));

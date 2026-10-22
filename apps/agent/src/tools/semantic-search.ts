import { defineAgentTool } from './types';

const DEFAULT_LIMIT = 5;

export const semanticSearchTool = defineAgentTool('semantic_search', async (input, { api, llm }) => {
  const [embedding] = await llm.embed([input.query]);
  return api.semanticSearch({
    embedModel: llm.embedModel,
    embedding: embedding!,
    limit: input.limit ?? DEFAULT_LIMIT,
  });
});

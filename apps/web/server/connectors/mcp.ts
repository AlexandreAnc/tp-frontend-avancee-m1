import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { AppError } from '../utils/errors';

/** Appelle un outil d'un serveur MCP instancié en mémoire pour l'utilisateur, puis ferme la session. */
export async function callMcpTool(server: McpServer, tool: string, args: Record<string, unknown>): Promise<unknown> {
  const client = new Client({ name: 'pwa-agent-ia', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    const result = await client.callTool({ name: tool, arguments: args });
    if (result.isError) {
      const message = Array.isArray(result.content) && result.content[0]?.type === 'text' ? result.content[0].text : 'Erreur inconnue';
      throw new AppError('upstream', `Le connecteur a échoué : ${message}`);
    }
    return result.structuredContent ?? null;
  } finally {
    await client.close();
    await server.close();
  }
}

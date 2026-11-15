import { EMBEDDING_DIMENSIONS } from '@app/shared';
import { Ollama, type ChatRequest } from 'ollama';
import type { AgentConfig } from '../config';
import { TaskError } from '../tasks/errors';
import type { ChatBackend, ChatMessage } from './chat-backend';

const EMBED_BATCH_SIZE = 16;

/**
 * Accès aux modèles pour une tâche : toutes les requêtes sont interrompues si la tâche est annulée.
 * Les embeddings passent toujours par Ollama ; la conversation peut passer par le fournisseur choisi
 * par l'utilisateur (`withChatBackend`).
 */
export class LlmClient {
  private readonly ollama: Ollama;
  private chatBackend: ChatBackend | null = null;

  constructor(
    private readonly config: Pick<AgentConfig, 'OLLAMA_URL' | 'CHAT_MODEL' | 'EMBED_MODEL' | 'CHAT_CONTEXT'>,
    private readonly signal: AbortSignal,
    private readonly ollamaThinking: boolean,
    readonly supportsVision = false,
  ) {
    this.ollama = new Ollama({
      host: config.OLLAMA_URL,
      fetch: (input, init) => fetch(input, { ...init, signal: this.signal }),
    });
  }

  /** Même accès (Ollama, annulation), conversation déléguée au fournisseur externe. */
  withChatBackend(backend: ChatBackend): LlmClient {
    const client = new LlmClient(this.config, this.signal, this.ollamaThinking, this.supportsVision);
    client.chatBackend = backend;
    return client;
  }

  get supportsThinking() {
    return this.chatBackend ? this.chatBackend.supportsThinking : this.ollamaThinking;
  }

  get chatModel() {
    return this.chatBackend ? `${this.chatBackend.label} · ${this.chatBackend.model}` : this.config.CHAT_MODEL;
  }

  get embedModel() {
    return this.config.EMBED_MODEL;
  }

  async chat(request: Omit<ChatRequest, 'model' | 'stream' | 'messages'> & { messages: ChatMessage[] }): Promise<{ message: ChatMessage }> {
    if (this.chatBackend) {
      return this.chatBackend.chat({ messages: request.messages, tools: request.tools, think: request.think === true }, this.signal);
    }
    try {
      const options = this.config.CHAT_CONTEXT ? { ...request.options, num_ctx: this.config.CHAT_CONTEXT } : request.options;
      return await this.ollama.chat({ ...request, options, model: this.config.CHAT_MODEL, stream: false });
    } catch (error) {
      throw this.wrap(error);
    }
  }

  async embed(texts: string[]): Promise<number[][]> {
    const embeddings: number[][] = [];
    for (let start = 0; start < texts.length; start += EMBED_BATCH_SIZE) {
      try {
        const response = await this.ollama.embed({
          model: this.config.EMBED_MODEL,
          input: texts.slice(start, start + EMBED_BATCH_SIZE),
        });
        embeddings.push(...response.embeddings);
      } catch (error) {
        throw this.wrap(error);
      }
    }
    if (embeddings.some((embedding) => embedding.length !== EMBEDDING_DIMENSIONS)) {
      throw new TaskError(`Le modèle ${this.config.EMBED_MODEL} ne produit pas des vecteurs de ${EMBEDDING_DIMENSIONS} dimensions`, false);
    }
    return embeddings;
  }

  private wrap(error: unknown): unknown {
    if (this.signal.aborted) return error;
    return new TaskError(`Ollama : ${error instanceof Error ? error.message : String(error)}`, true);
  }
}

export interface ModelCheck {
  supportsThinking: boolean;
  supportsVision: boolean;
}

export interface InstalledModel {
  name: string;
  capabilities: string[];
}

/** Modèles installés dans Ollama avec leurs capacités (tools, vision, embedding…). */
export async function listInstalledModels(ollamaUrl: string): Promise<InstalledModel[]> {
  const ollama = new Ollama({ host: ollamaUrl });
  const { models } = await ollama.list();
  return Promise.all(models.map(async (model) => {
    try {
      return { name: model.name, capabilities: (await ollama.show({ model: model.name })).capabilities };
    } catch {
      return { name: model.name, capabilities: [] };
    }
  }));
}

/** Vérifie au démarrage que les modèles sont installés et ont les capacités nécessaires. */
export async function checkModels(config: Pick<AgentConfig, 'OLLAMA_URL' | 'CHAT_MODEL' | 'EMBED_MODEL'> & { CHAT_THINKING?: boolean }): Promise<ModelCheck> {
  const ollama = new Ollama({ host: config.OLLAMA_URL });
  const show = async (model: string) => {
    try {
      return await ollama.show({ model });
    } catch (error) {
      throw new Error(`Modèle ${model} indisponible dans Ollama (${config.OLLAMA_URL}). Installez-le avec : ollama pull ${model}`, { cause: error });
    }
  };
  const [chat, embed] = await Promise.all([show(config.CHAT_MODEL), show(config.EMBED_MODEL)]);

  if (!chat.capabilities.includes('tools')) {
    throw new Error(`Le modèle ${config.CHAT_MODEL} ne gère pas les outils (tool calling)`);
  }
  if (!embed.capabilities.includes('embedding')) {
    throw new Error(`Le modèle ${config.EMBED_MODEL} n'est pas un modèle d'embeddings`);
  }
  return {
    supportsThinking: chat.capabilities.includes('thinking') && config.CHAT_THINKING !== false,
    supportsVision: chat.capabilities.includes('vision'),
  };
}

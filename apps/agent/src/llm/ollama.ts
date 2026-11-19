import { EMBEDDING_DIMENSIONS } from '@app/shared';
import { Ollama, type ChatRequest } from 'ollama';
import type { AgentConfig } from '../config';
import { errorMessage, TaskError } from '../tasks/errors';
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
    private readonly config: Pick<AgentConfig, 'OLLAMA_URL' | 'CHAT_MODEL' | 'EMBED_MODEL' | 'CHAT_CONTEXT' | 'CHAT_MAX_TOKENS'>,
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

  /**
   * `onContent` : reçoit le texte écrit jusqu'ici à mesure que le modèle l'écrit (réponse en flux, Ollama uniquement ;
   * les fournisseurs externes répondent d'un bloc). Le résultat est le même message complet dans les deux cas.
   */
  async chat(request: Omit<ChatRequest, 'model' | 'stream' | 'messages'> & { messages: ChatMessage[]; onContent?: (text: string) => void }): Promise<{ message: ChatMessage }> {
    const { onContent, ...rest } = request;
    if (this.chatBackend) {
      return this.chatBackend.chat({ messages: rest.messages, tools: rest.tools, think: rest.think === true }, this.signal);
    }
    try {
      const options = {
        ...rest.options,
        ...(this.config.CHAT_CONTEXT && { num_ctx: this.config.CHAT_CONTEXT }),
        ...(this.config.CHAT_MAX_TOKENS && { num_predict: this.config.CHAT_MAX_TOKENS }),
      };
      const chatRequest = { ...rest, options, model: this.config.CHAT_MODEL };
      const response = onContent
        ? await this.streamChat(chatRequest, onContent)
        : await this.ollama.chat({ ...chatRequest, stream: false });
      // Réponse coupée par la limite : le modèle a bouclé. Une réponse tronquée ne vaut rien, on échoue tout de suite.
      if (response.done_reason === 'length') {
        const limit = this.config.CHAT_MAX_TOKENS ? `après ${this.config.CHAT_MAX_TOKENS} tokens` : 'par la fenêtre de contexte';
        throw new Error(`réponse du modèle interrompue ${limit} (le modèle a bouclé)`);
      }
      return response;
    } catch (error) {
      throw this.wrap(error);
    }
  }

  /** Lit la réponse morceau par morceau et la recompose : texte, réflexion et appels d'outils. */
  private async streamChat(request: Omit<ChatRequest, 'stream'>, onContent: (text: string) => void): Promise<{ message: ChatMessage; done_reason?: string }> {
    let content = '';
    let thinking = '';
    const toolCalls: NonNullable<ChatMessage['tool_calls']> = [];
    let doneReason: string | undefined;
    for await (const chunk of await this.ollama.chat({ ...request, stream: true })) {
      if (chunk.message.thinking) thinking += chunk.message.thinking;
      if (chunk.message.tool_calls?.length) toolCalls.push(...chunk.message.tool_calls);
      if (chunk.message.content) {
        content += chunk.message.content;
        onContent(content);
      }
      if (chunk.done) doneReason = chunk.done_reason;
    }
    return {
      message: { role: 'assistant', content, ...(thinking && { thinking }), ...(toolCalls.length > 0 && { tool_calls: toolCalls }) },
      done_reason: doneReason,
    };
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
    return new TaskError(`Ollama : ${errorMessage(error)}`, true);
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

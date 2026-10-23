import Anthropic from '@anthropic-ai/sdk';
import { TaskError } from '../tasks/errors';
import { toolParameters, type ChatBackend, type ChatMessage, type ChatRequest } from './chat-backend';

type BetaMessageParam = Anthropic.Beta.Messages.BetaMessageParam;
type BetaContentBlock = Anthropic.Beta.Messages.BetaContentBlock;
type BetaToolResultBlockParam = Anthropic.Beta.Messages.BetaToolResultBlockParam;

/** Modèles qui acceptent le repli automatique côté serveur quand un filtre de sécurité refuse une demande. */
const SERVER_FALLBACK_MODELS = new Set(['claude-fable-5-1', 'claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5']);
const MAX_OUTPUT_TOKENS = 16_000;

/** Réflexion adaptative acceptée par modèle (lue une fois via l'API Models). */
const adaptiveThinking = new Map<string, boolean>();

/** Conversation avec Claude (clé de l'utilisateur), via l'API Messages. */
export class AnthropicChat implements ChatBackend {
  readonly label = 'Claude';
  readonly supportsThinking = true;
  private readonly client: Anthropic;
  /** Outils de la dernière requête : Claude les exige dès que l'historique contient des appels d'outils. */
  private lastTools: Anthropic.Beta.Messages.BetaTool[] = [];

  constructor(apiKey: string, readonly model: string) {
    this.client = new Anthropic({ apiKey, maxRetries: 2 });
  }

  async chat({ messages, tools, think }: ChatRequest, signal: AbortSignal): Promise<{ message: ChatMessage }> {
    const fallback = SERVER_FALLBACK_MODELS.has(this.model);
    if (tools?.length) {
      this.lastTools = tools.map((tool) => ({
        name: tool.function.name ?? '',
        description: tool.function.description,
        input_schema: toolParameters(tool) as Anthropic.Beta.Messages.BetaTool.InputSchema,
      }));
    }
    // Réponse finale forcée (sans outils) : on garde leurs définitions mais on interdit de les appeler.
    const forbidTools = !tools?.length && messages.some((message) => message.tool_calls?.length);
    try {
      const response = await this.client.beta.messages.create({
        model: this.model,
        max_tokens: MAX_OUTPUT_TOKENS,
        system: messages.filter((message) => message.role === 'system').map((message) => message.content).join('\n\n'),
        messages: toAnthropicMessages(messages),
        ...(tools?.length ? { tools: this.lastTools } : {}),
        ...(forbidTools && this.lastTools.length ? { tools: this.lastTools, tool_choice: { type: 'none' as const } } : {}),
        ...(think && (await this.supportsAdaptiveThinking(signal)) ? { thinking: { type: 'adaptive', display: 'summarized' } as const } : {}),
        ...(fallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
      }, { signal });

      if (response.stop_reason === 'refusal') {
        return { message: { role: 'assistant', content: "Claude a refusé de traiter cette demande." } };
      }
      return { message: fromAnthropicContent(response.content) };
    } catch (error) {
      throw wrapError(error, signal);
    }
  }

  private async supportsAdaptiveThinking(signal: AbortSignal): Promise<boolean> {
    if (!adaptiveThinking.has(this.model)) {
      try {
        const info = await this.client.models.retrieve(this.model, {}, { signal });
        adaptiveThinking.set(this.model, info.capabilities?.thinking.types.adaptive.supported ?? false);
      } catch {
        return false;
      }
    }
    return adaptiveThinking.get(this.model)!;
  }
}

/**
 * Historique Ollama → messages Claude. Les réponses de Claude sont renvoyées telles quelles (blocs de
 * réflexion signés compris) ; les résultats d'outils d'un même tour sont regroupés dans un seul message.
 */
export function toAnthropicMessages(messages: ChatMessage[]): BetaMessageParam[] {
  const result: BetaMessageParam[] = [];
  let pendingIds: string[] = [];
  let toolResults: BetaToolResultBlockParam[] = [];

  const flushToolResults = () => {
    if (toolResults.length) result.push({ role: 'user', content: toolResults });
    toolResults = [];
  };

  messages.forEach((message, index) => {
    if (message.role === 'system') return;
    if (message.role === 'tool') {
      toolResults.push({ type: 'tool_result', tool_use_id: pendingIds.shift() ?? `call_${index}`, content: message.content });
      return;
    }
    flushToolResults();
    if (message.role === 'assistant') {
      const content = (message.providerContent as BetaContentBlock[] | undefined) ?? [
        ...(message.content ? [{ type: 'text' as const, text: message.content }] : []),
        ...(message.tool_calls ?? []).map((call, position) => ({
          type: 'tool_use' as const,
          id: `call_${index}_${position}`,
          name: call.function.name,
          input: call.function.arguments,
        })),
      ];
      pendingIds = content.flatMap((block) => (block.type === 'tool_use' ? [block.id] : []));
      result.push({ role: 'assistant', content: content as BetaMessageParam['content'] });
      return;
    }
    result.push({ role: 'user', content: message.content });
  });
  flushToolResults();
  return result;
}

export function fromAnthropicContent(content: BetaContentBlock[]): ChatMessage {
  const text = content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('').trim();
  const thinking = content.flatMap((block) => (block.type === 'thinking' && block.thinking ? [block.thinking] : [])).join('\n').trim();
  const toolCalls = content.flatMap((block) => (block.type === 'tool_use' ? [{ function: { name: block.name, arguments: block.input as Record<string, unknown> } }] : []));
  return {
    role: 'assistant',
    content: text,
    ...(thinking ? { thinking } : {}),
    ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
    providerContent: content,
  };
}

/** Clé refusée ou demande invalide : inutile de réessayer. Limite de débit ou panne : la tâche est reprise plus tard. */
function wrapError(error: unknown, signal: AbortSignal): unknown {
  if (signal.aborted) return error;
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return new TaskError('Claude a refusé la clé d’API enregistrée dans vos réglages', false);
  }
  if (error instanceof Anthropic.NotFoundError) return new TaskError('Modèle Claude introuvable : choisissez-en un autre dans vos réglages', false);
  if (error instanceof Anthropic.BadRequestError) return new TaskError(`Claude a refusé la demande : ${error.message}`, false);
  if (error instanceof Anthropic.RateLimitError) return new TaskError('Limite de requêtes Claude atteinte, nouvel essai plus tard', true);
  if (error instanceof Anthropic.APIError) return new TaskError(`Claude est indisponible (${error.status ?? 'réseau'})`, true);
  return error;
}

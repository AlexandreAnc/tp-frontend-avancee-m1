import { TaskError } from '../tasks/errors';
import { toolParameters, type ChatBackend, type ChatMessage, type ChatRequest } from './chat-backend';

interface OpenAiToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

type OpenAiMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: OpenAiToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

interface CompletionResponse {
  choices?: { message: { content: string | null; tool_calls?: OpenAiToolCall[] }; finish_reason?: string }[];
  error?: { message?: string };
}

/** Conversation avec une API compatible OpenAI (ChatGPT, Mistral, Gemini…) et la clé de l'utilisateur. */
export class OpenAiCompatibleChat implements ChatBackend {
  readonly supportsThinking = false;

  constructor(
    readonly label: string,
    private readonly baseUrl: string,
    private readonly apiKey: string,
    readonly model: string,
  ) {}

  async chat({ messages, tools }: ChatRequest, signal: AbortSignal): Promise<{ message: ChatMessage }> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        signal,
        headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          messages: toOpenAiMessages(messages),
          ...(tools?.length
            ? { tools: tools.map((tool) => ({ type: 'function', function: { name: tool.function.name, description: tool.function.description, parameters: toolParameters(tool) } })) }
            : {}),
        }),
      });
    } catch (error) {
      if (signal.aborted) throw error;
      throw new TaskError(`${this.label} est injoignable`, true);
    }

    const body = await response.json().catch(() => ({})) as CompletionResponse;
    if (response.status === 401 || response.status === 403) throw new TaskError(`${this.label} a refusé la clé d’API enregistrée dans vos réglages`, false);
    if (response.status === 404) throw new TaskError(`Modèle ${this.model} introuvable chez ${this.label} : choisissez-en un autre dans vos réglages`, false);
    if (response.status === 429 || response.status >= 500) throw new TaskError(`${this.label} est momentanément indisponible (${response.status})`, true);
    if (!response.ok) throw new TaskError(`${this.label} a refusé la demande : ${body.error?.message ?? response.status}`, false);

    const choice = body.choices?.[0]?.message;
    if (!choice) throw new TaskError(`Réponse vide de ${this.label}`, true);
    return { message: fromOpenAiMessage(choice) };
  }
}

export function toOpenAiMessages(messages: ChatMessage[]): OpenAiMessage[] {
  const result: OpenAiMessage[] = [];
  let pendingIds: string[] = [];
  messages.forEach((message, index) => {
    if (message.role === 'tool') {
      result.push({ role: 'tool', tool_call_id: pendingIds.shift() ?? `call_${index}`, content: message.content });
    } else if (message.role === 'assistant') {
      const toolCalls = (message.providerContent as OpenAiToolCall[] | undefined) ?? (message.tool_calls ?? []).map((call, position) => ({
        id: `call_${index}_${position}`,
        type: 'function' as const,
        function: { name: call.function.name, arguments: JSON.stringify(call.function.arguments) },
      }));
      pendingIds = toolCalls.map((call) => call.id);
      result.push({ role: 'assistant', content: message.content || null, ...(toolCalls.length ? { tool_calls: toolCalls } : {}) });
    } else {
      result.push({ role: message.role === 'system' ? 'system' : 'user', content: message.content });
    }
  });
  return result;
}

export function fromOpenAiMessage(message: { content: string | null; tool_calls?: OpenAiToolCall[] }): ChatMessage {
  const toolCalls = message.tool_calls ?? [];
  return {
    role: 'assistant',
    content: (message.content ?? '').trim(),
    ...(toolCalls.length ? {
      // Arguments illisibles : objet vide, la validation de l'outil renverra l'erreur au modèle.
      tool_calls: toolCalls.map((call) => ({ function: { name: call.function.name, arguments: parseArguments(call.function.arguments) } })),
      providerContent: toolCalls,
    } : {}),
  };
}

function parseArguments(raw: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(raw || '{}');
    return value && typeof value === 'object' ? value as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

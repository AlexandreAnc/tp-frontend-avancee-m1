import type { H3Event } from 'h3';
import { getQuery, getRouterParam, readBody } from 'h3';
import { aiProviderSchema, type ExternalAiProvider } from '@app/shared';
import { z } from 'zod';
import { AppError } from './errors';

function parse<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new AppError('validation', 'Données invalides', z.flattenError(result.error));
  }
  return result.data;
}

export async function readValidatedBodyOrThrow<T extends z.ZodType>(event: H3Event, schema: T): Promise<z.infer<T>> {
  return parse(schema, await readBody(event));
}

export function getValidatedQueryOrThrow<T extends z.ZodType>(event: H3Event, schema: T): z.infer<T> {
  return parse(schema, getQuery(event));
}

export function getUuidParam(event: H3Event, name = 'id'): string {
  return parse(z.uuid(), getRouterParam(event, name));
}

/** Fournisseur d'IA externe dans l'URL (`/api/ai/keys/:provider`). */
export function getExternalAiProviderParam(event: H3Event): ExternalAiProvider {
  return parse(aiProviderSchema.exclude(['dashia']), getRouterParam(event, 'provider'));
}

export { parse as parseOrThrow };

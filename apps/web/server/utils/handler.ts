import { createError, defineEventHandler, type EventHandlerRequest, type H3Event } from 'h3';
import { APP_ERROR_CODES, AppError } from './errors';

/**
 * `defineEventHandler` qui traduit les `AppError` des services en réponse HTTP
 * `{ statusCode, message, data: { code, details } }`. Les autres erreurs restent des 500 génériques.
 */
export function defineAppHandler<T>(handler: (event: H3Event<EventHandlerRequest>) => T | Promise<T>) {
  return defineEventHandler(async (event) => {
    try {
      return await handler(event);
    } catch (error) {
      if (error instanceof AppError) {
        throw createError({
          statusCode: APP_ERROR_CODES[error.code],
          message: error.message,
          data: { code: error.code, details: error.details },
        });
      }
      throw error;
    }
  });
}

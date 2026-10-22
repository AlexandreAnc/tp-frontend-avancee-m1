import { AppError } from '../utils/errors';
import { defineAppHandler } from '../utils/handler';

// Sans cette route, une URL d'API inconnue renverrait le shell HTML de la SPA.
export default defineAppHandler(() => {
  throw new AppError('not_found', 'Route inconnue');
});

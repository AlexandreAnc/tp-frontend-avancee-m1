import { defineNitroPlugin } from 'nitropack/runtime';
import { contentSecurityPolicy } from '../utils/csp';

/**
 * Pose la Content Security Policy en tête de chaque page rendue : rendu serveur, page de l'app (SPA) et pages pré-rendues.
 * Pas en développement : Vite injecte ses propres scripts (rechargement à chaud).
 */
export default defineNitroPlugin((nitroApp) => {
  if (import.meta.dev) return;
  nitroApp.hooks.hook('render:html', (html) => {
    const page = [...html.head, ...html.bodyPrepend, ...html.body, ...html.bodyAppend].join('');
    const policy = contentSecurityPolicy(page).replace(/"/g, '&quot;');
    html.head.unshift(`<meta http-equiv="Content-Security-Policy" content="${policy}">`);
  });
});

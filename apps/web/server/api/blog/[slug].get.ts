import { getRouterParam } from 'h3';
import { getArticle } from '#shared/blog';
import { AppError } from '../../utils/errors';
import { defineAppHandler } from '../../utils/handler';

/** Article du blog (public) : la donnée chargée par la démo des modes de rendu, côté serveur (SSR, SSG) ou navigateur (CSR). */
export default defineAppHandler((event) => {
  const article = getArticle(getRouterParam(event, 'slug') ?? '');
  if (!article) throw new AppError('not_found', 'Article introuvable');
  return article;
});

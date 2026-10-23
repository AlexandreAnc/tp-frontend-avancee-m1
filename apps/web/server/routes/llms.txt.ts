import { defineEventHandler, setHeader } from 'h3';
import { sortedArticles } from '#shared/blog';
import { SITE, absoluteUrl } from '#shared/site';

/**
 * llms.txt (https://llmstxt.org) : résumé du site pour les moteurs de réponse et les assistants IA (GEO).
 * Faits vérifiables sur le produit, puis liens vers les contenus détaillés.
 */
export default defineEventHandler((event) => {
  setHeader(event, 'content-type', 'text/plain; charset=utf-8');
  return [
    `# ${SITE.name}`,
    '',
    `> ${SITE.description}`,
    '',
    '- Application web installable (PWA) en français, pour iPhone, Android et ordinateur.',
    '- Le modèle d’IA tourne par défaut sur la machine de l’utilisateur (Ollama) : les documents ne sont envoyés à aucun fournisseur.',
    '- Option : conversation avec Claude, ChatGPT, Mistral ou Gemini via la clé d’API de l’utilisateur ; l’analyse des documents reste locale.',
    '- Architecture multi-agents : un orchestrateur délègue à des agents Documents, Planning et Maison, chacun limité à ses propres outils.',
    '- Les actions engageantes (événement d’agenda) attendent la validation de l’utilisateur ; les actions simples (lampes, rappels) sont journalisées et annulables.',
    '- Fonctions : drive avec analyse des documents, chat qui cite ses sources, rappels push, échéances, résumé quotidien, Philips Hue, routines et tags NFC.',
    '- Gratuit. Projet de cours (Master 1).',
    '',
    '## Pages',
    '',
    `- [Accueil](${absoluteUrl('/')}): présentation du produit, fonctionnalités, sécurité, FAQ`,
    `- [Blog](${absoluteUrl('/blog')}): guides pratiques`,
    `- [Accessibilité](${absoluteUrl('/accessibilite')}): déclaration d’accessibilité`,
    '',
    '## Articles',
    '',
    ...sortedArticles().map((article) => `- [${article.title}](${absoluteUrl(`/blog/${article.slug}`)}): ${article.summary[0]}`),
    '',
  ].join('\n');
});

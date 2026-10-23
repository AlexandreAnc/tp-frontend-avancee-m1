---
name: add-agent-tool
description: Ajoute un outil à l'agent IA de DashIA (définition partagée, implémentation, attribution à un spécialiste, route serveur, tests). À utiliser pour « donne à l'agent la possibilité de… », « nouvel outil », ou un nouveau domaine de spécialiste.
---

# Ajouter un outil à l'agent

Un outil traverse trois couches. Les faire dans cet ordre.

## 1. Le contrat (`packages/shared/src/tools.ts`)

Ajouter l'entrée dans `toolDefinitions` : nom en `snake_case`, description en français **écrite pour le modèle** (quand l'utiliser, ce qu'elle fait, si c'est immédiat ou soumis à validation), schémas Zod d'entrée et de sortie. Chaque champ d'entrée a un `.describe()`.

Le nouvel outil doit appartenir à **un seul** spécialiste : l'ajouter à `SPECIALISTS.<nom>.tools` (`packages/shared/src/specialists.ts`). Nouveau domaine : nouveau spécialiste, avec ses règles dans `SPECIALIST_RULES` (`apps/agent/src/loop/prompts.ts`).

## 2. Le niveau de risque, si l'outil agit

Une action à effet de bord n'est jamais exécutée par l'agent : il la **demande** au serveur (`api.requestAction`).
- Ajouter le type d'action et son payload dans `packages/shared/src/actions.ts`, et son niveau dans `ACTION_RISK` :
  - `direct` : sans risque et annulable (lampes, rangement), exécutée et journalisée ;
  - `confirm` : validée par l'utilisateur (événement d'agenda) ;
  - `sensitive` : validée avec biométrie.
- Se demander : « si un document piégé fait appeler cet outil, que se passe-t-il ? ». Si la réponse inquiète, ce n'est pas `direct`.
- Exécution côté serveur dans `apps/web/server/connectors/registry.ts`.

## 3. L'implémentation (`apps/agent/src/tools/<nom>.ts`)

```ts
import { defineAgentTool } from './types';

export const myTool = defineAgentTool('my_tool', async (input, { api }) => api.myCall(input));
```

Puis l'enregistrer dans `tools` (`apps/agent/src/tools/index.ts`). L'appel réseau va dans `ApiClient` (`apps/agent/src/api/client.ts`), avec le schéma de réponse partagé.
Côté serveur, la route sous `server/api/agent/` utilise `requireTaskToken` (skill `scaffold-api-route`).

`PROTOCOL_VERSION` (`packages/shared/src/protocol.ts`) : l'incrémenter si un agent déjà déployé ne peut plus fonctionner avec le serveur.

## 4. Les tests

- `apps/agent/test/tools.test.ts` : arguments invalides refusés sans appel réseau, appel correct de l'API.
- `apps/agent/test/agent-loop.test.ts` : le spécialiste voit l'outil, les autres non.
- `apps/agent/test/prompt-injection.test.ts` : si l'outil agit, ajouter le cas « un document demande d'utiliser cet outil ».
- Serveur : test d'intégration de la route ou du service, isolation entre utilisateurs comprise.

## 5. Vérifier en vrai

Lancer l'agent (`pnpm dev`) et poser la question dans le chat : la timeline doit montrer la délégation au bon spécialiste puis l'appel de l'outil. Un test vert ne prouve pas que le modèle choisit l'outil : c'est la description qui le fait.

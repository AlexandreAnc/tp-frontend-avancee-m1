---
name: scaffold-api-route
description: Génère une nouvelle route API Nuxt/Nitro de DashIA avec son service, sa validation Zod et son test d'intégration, selon les conventions du projet. À utiliser pour « ajoute un endpoint », « crée une route pour… », ou toute nouvelle fonctionnalité serveur.
---

# Scaffolding d'une route API

Le code généré n'est qu'un point de départ : il est relu ligne à ligne, et le test doit échouer avant d'écrire le service (ou être vérifié en cassant volontairement le service).

## 1. Le service (`apps/web/server/services/<domaine>.ts`)

Toute la logique métier ici, testable sans HTTP. Chaque requête filtre par `userId`.

```ts
import { and, eq } from 'drizzle-orm';
import { db, schema } from '../db';
import { AppError } from '../utils/errors';

/** <Ce que fait la fonction, du point de vue de l'utilisateur.> */
export async function getThing(userId: string, thingId: string) {
  const [row] = await db.select().from(schema.things)
    .where(and(eq(schema.things.userId, userId), eq(schema.things.id, thingId)));
  if (!row) throw new AppError('not_found', 'Élément introuvable');
  return row;
}
```

Nouvelle table : la déclarer dans `server/db/schema/`, puis `pnpm --filter web db:generate` (migration générée, jamais écrite à la main).

## 2. La route (`apps/web/server/api/<chemin>.<méthode>.ts`)

Fine : session, validation, service. Rien d'autre.

```ts
import { z } from 'zod';
import { updateThing } from '../../services/things';
import { defineAppHandler } from '../../utils/handler';
import { requireUser } from '../../utils/session';
import { getUuidParam, readValidatedBodyOrThrow } from '../../utils/validation';

const bodySchema = z.object({
  name: z.string().trim().min(1).max(200),
});

export default defineAppHandler(async (event) => {
  const user = await requireUser(event);
  const { name } = await readValidatedBodyOrThrow(event, bodySchema);
  return { thing: await updateThing(user.id, getUuidParam(event), name) };
});
```

- Route appelée par l'agent : `requireTaskToken(event)` (`utils/task-auth`) à la place de `requireUser`, sous `server/api/agent/`.
- Limites et constantes partagées avec le front : dans `packages/shared`, jamais recopiées.
- Erreurs : `AppError(<code>, '<message en français>')`, codes dans `utils/errors.ts`.

## 3. Le test d'intégration (`apps/web/test/integration/<domaine>.test.ts`)

Sur la vraie base de test (`describe.skipIf(skipDb)`), au niveau du service. Toujours au moins : le cas nominal, une entrée refusée, et l'**isolation entre deux utilisateurs**.

```ts
import { describe, expect, it } from 'vitest';
import { getThing, updateThing } from '../../server/services/things';
import { createUser, skipDb } from './helpers';

describe.skipIf(skipDb)('things', () => {
  it('isole les données entre utilisateurs', async () => {
    const alice = await createUser();
    const bob = await createUser();
    const thing = await createThing(alice, 'à Alice');
    await expect(getThing(bob, thing.id)).rejects.toMatchObject({ code: 'not_found' });
  });
});
```

## 4. Le front

Appel avec `useFetch` / `$fetch` ; pour une URL dynamique, typer la réponse (`$fetch<unknown>(…) as …`) pour éviter l'erreur TS2321 des routes Nitro.

## 5. Avant de rendre la main

`pnpm lint`, `pnpm typecheck`, `pnpm test:coverage`. Mettre à jour `docs/README.md` si la fonctionnalité est visible.

import { Readable } from 'node:stream';
import { randomUUID } from 'node:crypto';
import { EMBEDDING_DIMENSIONS } from '@app/shared';
import { db, schema } from '../../server/db';

export const skipDb = process.env.SKIP_DB_TESTS === '1';

export async function createUser(name = 'Test'): Promise<string> {
  const id = randomUUID();
  await db.insert(schema.user).values({ id, name, email: `${id}@example.com` });
  return id;
}

export function textStream(content: string): Readable {
  return Readable.from([Buffer.from(content)]);
}

export function embedding(value: number): number[] {
  return Array.from({ length: EMBEDDING_DIMENSIONS }, (_, index) => (index === 0 ? value : 0.01));
}

export const sampleAnalysis = {
  documentType: 'facture',
  summary: 'Facture de test.',
  keyInfo: { dates: [], amounts: [], names: [] },
  suggestedActions: [],
};

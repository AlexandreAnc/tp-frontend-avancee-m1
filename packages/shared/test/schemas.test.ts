import { describe, expect, it } from 'vitest';
import {
  ALLOWED_MIME_TYPES,
  agentToServerMessageSchema,
  calendarEventPayloadSchema,
  EMBEDDING_DIMENSIONS,
  indexFileRequestSchema,
  isAllowedMimeType,
  MAX_FILE_SIZE_BYTES,
  MAX_STORAGE_BYTES_PER_USER,
  formatBytes,
  PROTOCOL_VERSION,
} from '../src';

describe('limites', () => {
  it('correspondent au cahier des charges', () => {
    expect(MAX_FILE_SIZE_BYTES).toBe(50 * 1024 * 1024);
    expect(MAX_STORAGE_BYTES_PER_USER).toBe(500 * 1024 * 1024);
    expect(ALLOWED_MIME_TYPES).toHaveLength(8);
    expect(isAllowedMimeType('application/pdf')).toBe(true);
    expect(isAllowedMimeType('image/heic')).toBe(true);
    expect(isAllowedMimeType('image/gif')).toBe(false);
    expect(isAllowedMimeType('application/zip')).toBe(false);
  });
});

describe('formatBytes', () => {
  it('affiche des unités lisibles en français', () => {
    expect(formatBytes(512)).toBe('512 o');
    expect(formatBytes(MAX_FILE_SIZE_BYTES)).toBe('50 Mo');
    expect(formatBytes(MAX_STORAGE_BYTES_PER_USER)).toBe('500 Mo');
    expect(formatBytes(1.5 * 1024 * 1024)).toBe('1,5 Mo');
  });
});

describe('calendarEventPayloadSchema', () => {
  it('exige des dates avec décalage horaire et une fin après le début', () => {
    expect(calendarEventPayloadSchema.safeParse({ title: 'A', start: '2026-11-14T09:00:00+01:00', end: '2026-11-14T10:00:00+01:00' }).success).toBe(true);
    expect(calendarEventPayloadSchema.safeParse({ title: 'A', start: '2026-11-14T09:00:00', end: '2026-11-14T10:00:00' }).success).toBe(false);
    expect(calendarEventPayloadSchema.safeParse({ title: 'A', start: '2026-11-14T10:00:00+01:00', end: '2026-11-14T09:00:00+01:00' }).success).toBe(false);
  });
});

describe('protocole', () => {
  it('valide hello et rejette un type de message inconnu', () => {
    const hello = {
      type: 'hello', protocolVersion: PROTOCOL_VERSION, agentKey: 'agk_abc', name: 'mac',
      chatModel: 'gemma4:26b', embedModel: 'bge-m3', concurrency: 1,
    };
    expect(agentToServerMessageSchema.safeParse(hello).success).toBe(true);
    expect(agentToServerMessageSchema.safeParse({ ...hello, agentKey: 'sans-prefixe' }).success).toBe(false);
    expect(agentToServerMessageSchema.safeParse({ type: 'sql', query: 'drop table files' }).success).toBe(false);
  });

  it('impose la dimension des embeddings', () => {
    const base = { embedModel: 'bge-m3', text: 't', analysis: { documentType: 'x', summary: 'y', keyInfo: { dates: [], amounts: [], names: [] }, suggestedActions: [] } };
    const chunk = (length: number) => ({ index: 0, content: 'c', embedding: Array.from({ length }, () => 0) });
    expect(indexFileRequestSchema.safeParse({ ...base, chunks: [chunk(EMBEDDING_DIMENSIONS)] }).success).toBe(true);
    expect(indexFileRequestSchema.safeParse({ ...base, chunks: [chunk(768)] }).success).toBe(false);
  });
});

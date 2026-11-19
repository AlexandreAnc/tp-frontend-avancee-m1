import { MAX_DRAFT_CHARS } from '@app/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDraftSender, DRAFT_INTERVAL_MS } from '../src/tasks/draft-sender';

describe('createDraftSender', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('n’envoie que le dernier texte de chaque intervalle', () => {
    const send = vi.fn();
    const drafts = createDraftSender(send);
    drafts.push('B');
    drafts.push('Bon');
    expect(send).not.toHaveBeenCalled();
    vi.advanceTimersByTime(DRAFT_INTERVAL_MS);
    expect(send.mock.calls).toEqual([['Bon']]);
    drafts.push('Bonjour');
    vi.advanceTimersByTime(DRAFT_INTERVAL_MS);
    expect(send.mock.calls).toEqual([['Bon'], ['Bonjour']]);
  });

  it('n’envoie pas deux fois le même texte, mais transmet l’effacement', () => {
    const send = vi.fn();
    const drafts = createDraftSender(send);
    drafts.push('Je regarde.');
    vi.advanceTimersByTime(DRAFT_INTERVAL_MS);
    drafts.push('Je regarde.');
    vi.advanceTimersByTime(DRAFT_INTERVAL_MS);
    drafts.push('');
    vi.advanceTimersByTime(DRAFT_INTERVAL_MS);
    expect(send.mock.calls).toEqual([['Je regarde.'], ['']]);
  });

  it('tronque un brouillon trop long pour le protocole', () => {
    const send = vi.fn();
    const drafts = createDraftSender(send);
    drafts.push('x'.repeat(MAX_DRAFT_CHARS + 10));
    vi.advanceTimersByTime(DRAFT_INTERVAL_MS);
    expect(send.mock.calls[0]![0]).toHaveLength(MAX_DRAFT_CHARS);
  });

  it('abandonne le brouillon en attente à l’arrêt', () => {
    const send = vi.fn();
    const drafts = createDraftSender(send);
    drafts.push('Bonjour');
    drafts.stop();
    vi.advanceTimersByTime(DRAFT_INTERVAL_MS * 2);
    expect(send).not.toHaveBeenCalled();
  });
});

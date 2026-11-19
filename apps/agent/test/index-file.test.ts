import { access, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { FileAnalysis } from '@app/shared';
import { describe, expect, it, vi } from 'vitest';
import type { ApiClient } from '../src/api/client';
import { ANALYSIS_SYSTEM_PROMPT } from '../src/loop/prompts';
import type { TaskContext } from '../src/tasks/context';
import { analyzeDocument, indexFile } from '../src/tasks/index-file';
import { fakeLlm } from './fakes';

const FILE_ID = '849fea72-3abd-4321-9ff7-00a5d3ee67cf';
const analysis: FileAnalysis = {
  documentType: 'facture',
  category: 'Factures',
  summary: 'Facture de plomberie de 340,50 EUR.',
  keyInfo: { dates: [{ label: 'Échéance', value: '30 novembre 2026', iso: '2026-11-30', isDeadline: true }], amounts: [{ label: 'Total', value: '340,50 EUR' }], names: ['Plomberie Martin'] },
  suggestedActions: [],
};

describe('analyzeDocument', () => {
  it('demande au modèle un JSON conforme au schéma, sans réflexion ni hasard', async () => {
    const { llm, chat } = fakeLlm([{ content: JSON.stringify(analysis) }]);
    await expect(analyzeDocument(llm, 'facture.pdf', 'Facture Plomberie Martin')).resolves.toEqual(analysis);
    expect(chat).toHaveBeenCalledWith(expect.objectContaining({
      messages: [
        { role: 'system', content: ANALYSIS_SYSTEM_PROMPT },
        { role: 'user', content: 'Nom du fichier : facture.pdf\n\nContenu :\nFacture Plomberie Martin' },
      ],
      format: expect.objectContaining({ type: 'object', required: expect.arrayContaining(['category', 'summary']) }),
      think: false,
      options: { temperature: 0 },
    }));
  });

  it('ne transmet que le début d’un long document', async () => {
    const { llm, chat } = fakeLlm([{ content: JSON.stringify(analysis) }]);
    await analyzeDocument(llm, 'long.txt', 'a'.repeat(20_000));
    const [request] = chat.mock.calls[0] as unknown as [{ messages: { content: string }[] }];
    expect(request.messages[1]!.content.endsWith(`${'a'.repeat(100)}\n[…]`)).toBe(true);
    expect(request.messages[1]!.content.length).toBeLessThan(16_100);
  });

  it('réessaie une fois une réponse invalide', async () => {
    const { llm, chat } = fakeLlm([{ content: 'Voici le JSON :' }, { content: JSON.stringify(analysis) }]);
    await expect(analyzeDocument(llm, 'f.pdf', 'texte')).resolves.toEqual(analysis);
    expect(chat).toHaveBeenCalledTimes(2);
  });

  it('échoue (réessayable) après deux réponses invalides, en citant la dernière erreur', async () => {
    const { llm, chat } = fakeLlm([{ content: '{}' }, { content: '{"documentType":""}' }]);
    await expect(analyzeDocument(llm, 'f.pdf', 'texte')).rejects.toMatchObject({ retryable: true, message: expect.stringContaining('Analyse du document invalide') });
    expect(chat).toHaveBeenCalledTimes(2);
  });
});

describe('indexFile', () => {
  function setup(content: string, signal = new AbortController().signal) {
    const { llm, embed } = fakeLlm([{ content: JSON.stringify(analysis) }]);
    let downloadedTo = '';
    const api = {
      downloadFile: vi.fn(async (_fileId: string, destination: string) => {
        downloadedTo = destination;
        await writeFile(destination, content);
      }),
      saveIndex: vi.fn(async () => ({ chunkCount: 1 })),
    };
    const context = { taskId: 't1', api: api as unknown as ApiClient, llm, timezone: 'Europe/Paris', signal, emitStep: vi.fn(), emitDraft: vi.fn() } satisfies TaskContext;
    const run = () => indexFile({ fileId: FILE_ID, fileName: 'facture.md', mimeType: 'text/markdown' }, context);
    const workDirRemoved = () => expect(access(dirname(downloadedTo))).rejects.toThrow();
    return { run, api, embed, workDirRemoved };
  }

  it('télécharge, découpe, calcule les embeddings, analyse puis envoie le tout au serveur', async () => {
    const { run, api, embed, workDirRemoved } = setup('Facture Plomberie Martin\n\nTotal : 340,50 EUR');
    await expect(run()).resolves.toEqual({ chunkCount: 1 });
    expect(api.downloadFile).toHaveBeenCalledWith(FILE_ID, expect.stringMatching(/agent-.*source$/));
    expect(embed).toHaveBeenCalledWith(['Facture Plomberie Martin\n\nTotal : 340,50 EUR']);
    expect(api.saveIndex).toHaveBeenCalledWith(FILE_ID, {
      embedModel: 'bge-m3',
      text: 'Facture Plomberie Martin\n\nTotal : 340,50 EUR',
      chunks: [{ index: 0, content: 'Facture Plomberie Martin\n\nTotal : 340,50 EUR', embedding: expect.any(Array) }],
      analysis,
    });
    await workDirRemoved();
  });

  it('refuse un document sans texte (non réessayable) et nettoie le dossier temporaire', async () => {
    const { run, api, workDirRemoved } = setup('  \n\n ');
    await expect(run()).rejects.toMatchObject({ retryable: false, message: expect.stringContaining('Aucun texte lisible') });
    expect(api.saveIndex).not.toHaveBeenCalled();
    await workDirRemoved();
  });

  it('s’arrête sans rien envoyer si la tâche est annulée pendant le traitement', async () => {
    const controller = new AbortController();
    const { run, api, embed, workDirRemoved } = setup('Texte', controller.signal);
    embed.mockImplementationOnce(async (texts: string[]) => {
      controller.abort(new Error('annulée'));
      return texts.map(() => []);
    });
    await expect(run()).rejects.toThrow('annulée');
    expect(api.saveIndex).not.toHaveBeenCalled();
    await workDirRemoved();
  });
});

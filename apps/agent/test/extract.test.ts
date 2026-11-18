import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { extractTextFromFile } from '../src/extract';
import { extractImage, IMAGE_TRANSCRIPTION_PROMPT } from '../src/extract/image';
import { extractPlainText } from '../src/extract/text';
import { extractXlsx } from '../src/extract/xlsx';
import type { LlmClient } from '../src/llm/ollama';
import { TaskError } from '../src/tasks/errors';
import { fakeLlm } from './fakes';

// Les bibliothèques de lecture sont simulées : on teste ce que l'agent fait de leur résultat.
const libs = vi.hoisted(() => ({
  extractRawText: vi.fn(),
  extractText: vi.fn(),
  readXlsxFile: vi.fn(),
  heicConvert: vi.fn(),
}));
vi.mock('mammoth', () => ({ default: { extractRawText: libs.extractRawText } }));
vi.mock('unpdf', () => ({ extractText: libs.extractText }));
vi.mock('read-excel-file/node', () => ({ default: libs.readXlsxFile }));
vi.mock('heic-convert', () => ({ default: libs.heicConvert }));

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

let dir: string;
beforeAll(async () => { dir = await mkdtemp(join(tmpdir(), 'agent-extract-')); });
afterAll(() => rm(dir, { recursive: true, force: true }));
beforeEach(() => { for (const lib of Object.values(libs)) lib.mockReset(); });

async function fileWith(content: string | Buffer) {
  const path = join(dir, `f-${Math.random().toString(36).slice(2)}`);
  await writeFile(path, content);
  return path;
}

const visionLlm = (content = 'Facture EDF 82 EUR') => {
  const fake = fakeLlm([{ content }]);
  Object.assign(fake.llm, { supportsVision: true });
  return fake;
};

describe('extractTextFromFile', () => {
  it('lit un texte brut en retirant le BOM et en normalisant les espaces', async () => {
    const path = await fileWith('﻿Titre\r\n\r\n\r\nLigne   1\t\n');
    await expect(extractTextFromFile(path, 'text/markdown', fakeLlm([]).llm)).resolves.toBe('Titre\n\nLigne 1');
  });

  it('refuse un type non pris en charge sans lire le fichier (non réessayable)', async () => {
    await expect(extractTextFromFile('/inexistant', 'application/zip', fakeLlm([]).llm))
      .rejects.toMatchObject({ retryable: false, message: 'Type de fichier non pris en charge : application/zip' });
  });

  it('extrait un PDF (toutes les pages fusionnées)', async () => {
    libs.extractText.mockResolvedValue({ text: 'Page 1\nPage 2' });
    const path = await fileWith('%PDF-1.7');
    await expect(extractTextFromFile(path, 'application/pdf', fakeLlm([]).llm)).resolves.toBe('Page 1\nPage 2');
    expect(libs.extractText).toHaveBeenCalledWith(expect.any(Uint8Array), { mergePages: true });
  });

  it('extrait le texte brut d’un document Word', async () => {
    libs.extractRawText.mockResolvedValue({ value: 'Bail  de location' });
    const path = await fileWith('PK');
    await expect(extractTextFromFile(path, DOCX, fakeLlm([]).llm)).resolves.toBe('Bail de location');
  });

  it('transforme un fichier corrompu en erreur non réessayable', async () => {
    libs.extractText.mockRejectedValue(new Error('Invalid PDF structure'));
    const path = await fileWith('pas un pdf');
    await expect(extractTextFromFile(path, 'application/pdf', fakeLlm([]).llm))
      .rejects.toMatchObject({ retryable: false, message: 'Lecture du fichier impossible : Invalid PDF structure' });
  });

  it('garde telle quelle une erreur déjà typée (modèle sans vision)', async () => {
    const path = await fileWith('jpeg');
    const error = await extractTextFromFile(path, 'image/jpeg', fakeLlm([]).llm).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(TaskError);
    expect((error as TaskError).message).toContain('ne lit pas les images');
  });

  it('confie une image au modèle vision avec son type', async () => {
    const { llm, chat } = visionLlm();
    const path = await fileWith('png-bytes');
    await expect(extractTextFromFile(path, 'image/png', llm)).resolves.toBe('Facture EDF 82 EUR');
    expect(chat).toHaveBeenCalledOnce();
    expect(libs.heicConvert).not.toHaveBeenCalled();
  });
});

describe('extractImage', () => {
  it('envoie l’image en base64 avec la consigne de transcription, sans réflexion', async () => {
    const { llm, chat } = visionLlm();
    await extractImage(Buffer.from('jpeg-bytes'), llm, 'image/jpeg');
    expect(chat).toHaveBeenCalledWith({
      messages: [
        { role: 'system', content: IMAGE_TRANSCRIPTION_PROMPT },
        { role: 'user', content: 'Voici le document.', images: [Buffer.from('jpeg-bytes').toString('base64')] },
      ],
      think: false,
      options: { temperature: 0 },
    });
  });

  it('convertit une photo HEIC d’iPhone en JPEG avant de la lire', async () => {
    libs.heicConvert.mockResolvedValue(new TextEncoder().encode('jpeg').buffer);
    const { llm, chat } = visionLlm();
    await extractImage(Buffer.from('heic-bytes'), llm, 'image/heic');
    expect(libs.heicConvert).toHaveBeenCalledWith({ buffer: Buffer.from('heic-bytes'), format: 'JPEG', quality: 0.9 });
    const [request] = chat.mock.calls[0] as unknown as [{ messages: { images?: string[] }[] }];
    expect(request.messages[1]!.images).toEqual([Buffer.from('jpeg').toString('base64')]);
  });

  it('refuse une image si le modèle de chat n’a pas la vision', async () => {
    const llm = { supportsVision: false, chatModel: 'qwen3:8b' } as LlmClient;
    await expect(extractImage(Buffer.from(''), llm, 'image/png'))
      .rejects.toMatchObject({ retryable: false, message: expect.stringContaining('Le modèle qwen3:8b ne lit pas les images') });
  });
});

describe('extractXlsx', () => {
  it('écrit chaque feuille en lignes « a | b », dates au format AAAA-MM-JJ, lignes vides retirées', async () => {
    libs.readXlsxFile.mockResolvedValue([
      { sheet: 'Budget', data: [['Poste', 'Montant', 'Date'], ['Loyer', 850, new Date('2026-11-05T00:00:00Z')], [null, undefined, ''], ['EDF', 82.5, null]] },
      { sheet: 'Vide', data: [] },
    ]);
    await expect(extractXlsx(Buffer.from('xlsx'))).resolves.toBe([
      '# Feuille « Budget »',
      'Poste | Montant | Date',
      'Loyer | 850 | 2026-11-05',
      'EDF | 82.5 |',
      '',
      '# Feuille « Vide »',
    ].join('\n'));
  });

  it('est utilisé pour les classeurs Excel', async () => {
    libs.readXlsxFile.mockResolvedValue([{ sheet: 'S', data: [['x']] }]);
    const path = await fileWith('PK');
    await expect(extractTextFromFile(path, XLSX, fakeLlm([]).llm)).resolves.toBe('# Feuille « S »\nx');
  });
});

describe('extractPlainText', () => {
  it('ne retire le BOM qu’en début de texte', () => {
    expect(extractPlainText(Buffer.from('a﻿b'))).toBe('a﻿b');
  });
});

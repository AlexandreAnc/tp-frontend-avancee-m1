import type { CpuInfo } from 'node:os';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createStatsSampler, parseVramUsage } from '../src/connection/stats';

const os = vi.hoisted(() => ({ cpus: vi.fn(), freemem: vi.fn(), totalmem: vi.fn() }));
const execFile = vi.hoisted(() => vi.fn());
vi.mock('node:os', () => os);
vi.mock('node:child_process', () => ({ execFile }));

const cpu = (busy: number, idle: number) => ({ times: { user: busy, nice: 0, sys: 0, irq: 0, idle } }) as CpuInfo;

/** `nvidia-smi` simulé (appel de style callback, transformé en promesse par l'agent). */
function nvidiaSmi(result: string | Error) {
  execFile.mockImplementation((_command: string, _args: string[], _options: unknown, callback: (error: Error | null, output?: { stdout: string }) => void) => {
    if (result instanceof Error) callback(result);
    else callback(null, { stdout: result });
  });
}

beforeEach(() => {
  execFile.mockReset();
  os.freemem.mockReturnValue(4);
  os.totalmem.mockReturnValue(16);
});

describe('parseVramUsage', () => {
  it('lit la première carte de la sortie de nvidia-smi', () => {
    expect(parseVramUsage('2048, 8192\n1024, 8192\n')).toBe(25);
    expect(parseVramUsage(' 8100 , 8192')).toBe(99);
  });

  it('renvoie null pour une sortie illisible ou une carte sans mémoire', () => {
    expect(parseVramUsage('')).toBeNull();
    expect(parseVramUsage('[N/A], [N/A]')).toBeNull();
    expect(parseVramUsage('100, 0')).toBeNull();
  });
});

describe('createStatsSampler', () => {
  it('calcule le CPU par différence entre deux mesures, et la RAM utilisée', async () => {
    os.cpus.mockReturnValueOnce([cpu(100, 900), cpu(100, 900)]).mockReturnValueOnce([cpu(400, 1000), cpu(100, 1100)]);
    nvidiaSmi('4096, 8192');
    const sample = createStatsSampler();
    // 300 unités occupées sur 600 écoulées.
    await expect(sample()).resolves.toEqual({ cpu: 50, ram: 75, vram: 50 });
  });

  it('renvoie 0 % de CPU sans temps écoulé', async () => {
    os.cpus.mockReturnValue([cpu(100, 900)]);
    nvidiaSmi('0, 8192');
    await expect(createStatsSampler()()).resolves.toMatchObject({ cpu: 0, vram: 0 });
  });

  it('cesse d’interroger le GPU quand nvidia-smi est absent (Mac)', async () => {
    os.cpus.mockReturnValue([cpu(100, 900)]);
    nvidiaSmi(new Error('ENOENT'));
    const sample = createStatsSampler();
    await expect(sample()).resolves.toMatchObject({ vram: null });
    await expect(sample()).resolves.toMatchObject({ vram: null });
    expect(execFile).toHaveBeenCalledOnce();
  });
});

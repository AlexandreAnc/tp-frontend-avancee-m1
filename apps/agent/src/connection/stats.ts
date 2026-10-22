import { execFile } from 'node:child_process';
import { cpus, freemem, totalmem } from 'node:os';
import { promisify } from 'node:util';
import type { AgentStats } from '@app/shared';

const run = promisify(execFile);

function cpuTimes() {
  return cpus().reduce((total, cpu) => {
    const busy = cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.irq;
    return { busy: total.busy + busy, all: total.all + busy + cpu.times.idle };
  }, { busy: 0, all: 0 });
}

const round = (value: number) => Math.round(Math.min(100, Math.max(0, value)));

/** VRAM utilisée (GPU NVIDIA). `null` quand elle n'est pas mesurable (Apple Silicon : mémoire unifiée). */
async function vramUsage(): Promise<number | null> {
  try {
    const { stdout } = await run('nvidia-smi', ['--query-gpu=memory.used,memory.total', '--format=csv,noheader,nounits'], { timeout: 2000 });
    const [used, total] = stdout.trim().split('\n')[0]!.split(',').map(Number);
    return used !== undefined && total ? round((used / total) * 100) : null;
  } catch {
    return null;
  }
}

/** Mesure la charge entre deux appels successifs (le CPU se calcule par différence). */
export function createStatsSampler() {
  let previous = cpuTimes();
  let gpuAvailable = true;

  return async function sample(): Promise<AgentStats> {
    const current = cpuTimes();
    const all = current.all - previous.all;
    const cpu = all > 0 ? round(((current.busy - previous.busy) / all) * 100) : 0;
    previous = current;

    const vram = gpuAvailable ? await vramUsage() : null;
    if (vram === null) gpuAvailable = false;
    return { cpu, ram: round((1 - freemem() / totalmem()) * 100), vram };
  };
}

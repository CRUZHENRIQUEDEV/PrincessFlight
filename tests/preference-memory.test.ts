// Versão: 1.0
import { describe, expect, it, vi } from 'vitest';
import { createPreferenceMemory } from '../src/presentation/preference-memory';
import type { StoredSettings } from '../src/infrastructure/flight-store';
import { sampleCriteria } from './fixtures';

describe('memória de preferências', () => {
  it('grava só a última alteração depois da pausa', async () => {
    vi.useFakeTimers();
    const saved: string[] = [];
    const memory = createPreferenceMemory(async (settings) => {
      saved.push(settings.criteria.originIata);
    }, 400);
    memory.schedule(settings('GRU'));
    memory.schedule(settings('SSA'));
    await vi.advanceTimersByTimeAsync(399);
    expect(saved).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(saved).toEqual(['SSA']);
    vi.useRealTimers();
  });

  it('grava na hora quando a aba vai fechar', async () => {
    vi.useFakeTimers();
    const saved: string[] = [];
    const memory = createPreferenceMemory(async (settings) => {
      saved.push(settings.criteria.originIata);
    }, 400);
    memory.schedule(settings('FOR'));
    await memory.flush();
    expect(saved).toEqual(['FOR']);
    await vi.advanceTimersByTimeAsync(400);
    expect(saved).toEqual(['FOR']);
    vi.useRealTimers();
  });
});

function settings(originIata: string): StoredSettings {
  return {
    token: 'token-de-teste',
    criteria: sampleCriteria({ originIata }),
    updatedAt: '2026-09-26T12:00:00Z',
  };
}

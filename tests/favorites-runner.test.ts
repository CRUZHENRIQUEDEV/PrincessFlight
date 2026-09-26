// Versão: 1.0
import { describe, expect, it } from 'vitest';
import { runFavoriteRound } from '../src/infrastructure/favorites-runner';
import type { FlightPriceProvider } from '../src/infrastructure/travelpayouts-client';

describe('rodada de favoritos', () => {
  it('consulta o menor preço sem perder o objeto da API', async () => {
    const provider: FlightPriceProvider = new class {
      private readonly alive = true;

      searchRouteMonth(): Promise<[]> {
        return Promise.resolve([]);
      }

      searchCheapest(): Promise<null> {
        if (!this.alive) throw new TypeError("Cannot read properties of undefined (reading 'requestCheapest')");
        return Promise.resolve(null);
      }
    }();
    const seen: string[] = [];
    const found = await runFavoriteRound({
      origin: 'BSB',
      destinations: ['MAD'],
      token: 'token-de-teste',
      provider,
      signal: new AbortController().signal,
      sleep: () => Promise.resolve(),
      delaySeconds: 2,
      now: () => '2026-09-26T14:00:00Z',
      onProgress: () => undefined,
      onRoute: (progress) => seen.push(progress.destination),
      onBatch: () => undefined,
    });
    expect(found).toEqual([]);
    expect(seen).toEqual(['MAD']);
  });
});

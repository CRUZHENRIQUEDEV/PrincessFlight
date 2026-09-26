// Versão: 1.1
import { describe, expect, it } from 'vitest';
import { runFavoriteRound } from '../src/infrastructure/favorites-runner';
import type { FlightPriceProvider } from '../src/infrastructure/travelpayouts-client';
import { sampleOffer } from './fixtures';

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

  it('usa o preço já salvo e não chama a API nessa rota', async () => {
    const calls: string[] = [];
    const provider: FlightPriceProvider = {
      searchRouteMonth: () => Promise.resolve([]),
      searchCheapest: (query) => {
        calls.push(query.destination);
        return Promise.resolve(null);
      },
    };
    const saved = sampleOffer({
      id: 'lis',
      origin: 'BSB',
      destination: 'LIS',
      price: 2100,
      fetchedAt: '2026-09-26T13:50:00Z',
    });
    const found = await runFavoriteRound({
      origin: 'BSB',
      destinations: ['LIS', 'MAD'],
      token: 'token-de-teste',
      provider,
      signal: new AbortController().signal,
      sleep: () => Promise.resolve(),
      delaySeconds: 2,
      now: () => '2026-09-26T14:00:00Z',
      knownOffers: () => [saved],
      freshForMs: 60 * 60 * 1000,
      onProgress: () => undefined,
      onRoute: () => undefined,
      onBatch: () => undefined,
    });
    expect(calls).toEqual(['MAD']);
    expect(found.map((offer) => offer.id)).toEqual(['lis']);
  });
});

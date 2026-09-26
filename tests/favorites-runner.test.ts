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
    expect(calls[0]).toBe('MAD');
    expect(calls).not.toContain('LIS');
    expect(found.map((offer) => offer.id)).toEqual(['lis']);
  });

  it('monta duas passagens quando a rota completa não está salva', async () => {
    const calls: string[] = [];
    const provider: FlightPriceProvider = {
      searchRouteMonth: () => Promise.resolve([]),
      searchCheapest: (query) => {
        calls.push(`${query.origin}-${query.destination}`);
        return Promise.resolve(null);
      },
    };
    const now = '2026-09-26T14:00:00Z';
    const home = sampleOffer({
      id: 'bsb-sao',
      origin: 'BSB',
      destination: 'SAO',
      originAirport: 'BSB',
      destinationAirport: 'GRU',
      price: 800,
      airline: 'G3',
      departureAt: '2026-11-10T10:00:00Z',
      returnAt: '2026-11-20T18:00:00Z',
      durationToMinutes: 120,
      durationBackMinutes: 120,
      link: 'https://www.aviasales.com/search/bsb-sao',
      fetchedAt: '2026-09-26T13:40:00Z',
    });
    const away = sampleOffer({
      id: 'sao-mad',
      origin: 'SAO',
      destination: 'MAD',
      originAirport: 'GRU',
      destinationAirport: 'MAD',
      price: 1400,
      airline: 'TP',
      departureAt: '2026-11-10T16:00:00Z',
      returnAt: '2026-11-20T10:00:00Z',
      durationToMinutes: 120,
      durationBackMinutes: 120,
      link: 'https://www.aviasales.com/search/sao-mad',
      fetchedAt: '2026-09-26T13:40:00Z',
    });
    const found = await runFavoriteRound({
      origin: 'BSB',
      destinations: ['MAD'],
      token: 'token-de-teste',
      provider,
      signal: new AbortController().signal,
      sleep: () => Promise.resolve(),
      delaySeconds: 2,
      now: () => now,
      knownOffers: () => [home, away],
      freshForMs: 60 * 60 * 1000,
      onProgress: () => undefined,
      onRoute: () => undefined,
      onBatch: () => undefined,
    });
    expect(found).toHaveLength(1);
    expect(found[0]?.price).toBe(2200);
    expect(found[0]?.selfConnect?.hub).toBe('SAO');
    expect(found[0]?.selfConnect?.home.price).toBe(800);
    expect(found[0]?.selfConnect?.away.price).toBe(1400);
    expect(calls.some((call) => call.endsWith('-SAO') || call.startsWith('SAO-'))).toBe(false);
  });
});

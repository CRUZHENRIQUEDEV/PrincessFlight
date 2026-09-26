// Versão: 1.0
import { describe, expect, it } from 'vitest';
import { runSearch } from '../src/infrastructure/search-runner';
import { TravelpayoutsError } from '../src/infrastructure/travelpayouts-error';
import type { FlightPriceProvider, RouteMonthQuery } from '../src/infrastructure/travelpayouts-client';
import type { RawTicket } from '../src/domain/types';
import { sampleAirports, sampleCriteria } from './fixtures';

describe('fila de busca', () => {
  it('consulta cada destino do mês e pausa entre as chamadas', async () => {
    const calls: string[] = [];
    const sleeps: number[] = [];
    const provider: FlightPriceProvider = {
      async searchRouteMonth(query: RouteMonthQuery): Promise<RawTicket[]> {
        calls.push(`${query.destination}:${query.month}`);
        return [ticket(query.destination)];
      },
    };
    const result = await runSearch({
      criteria: sampleCriteria({ states: ['BA', 'CE'] }),
      airports: sampleAirports(),
      token: 'token-de-teste',
      provider,
      signal: new AbortController().signal,
      sleep: async (milliseconds) => { sleeps.push(milliseconds); },
      now: () => '2026-09-26T12:00:00Z',
    });
    expect(calls).toEqual(['SSA:2026-11', 'FOR:2026-11']);
    expect(sleeps).toEqual([5000]);
    expect(result.status).toBe('done');
    expect(result.offers).toHaveLength(2);
    expect(result.offers[0].origin).toBe('GRU');
  });

  it('para na primeira falha de token', async () => {
    let calls = 0;
    const provider: FlightPriceProvider = {
      async searchRouteMonth(): Promise<RawTicket[]> {
        calls += 1;
        throw new TravelpayoutsError('Token recusado.', 401, 'auth');
      },
    };
    const result = await runSearch(options(provider));
    expect(result.status).toBe('error');
    expect(calls).toBe(1);
    expect(result.message).toMatch(/Token/);
  });

  it('interrompe quando a pausa é cancelada', async () => {
    let calls = 0;
    const provider: FlightPriceProvider = {
      async searchRouteMonth(): Promise<RawTicket[]> {
        calls += 1;
        return [];
      },
    };
    const result = await runSearch({
      ...options(provider),
      sleep: async () => { throw new DOMException('parada', 'AbortError'); },
    });
    expect(result.status).toBe('stopped');
    expect(calls).toBe(1);
  });
});

function options(provider: FlightPriceProvider) {
  return {
    criteria: sampleCriteria({ states: ['BA', 'CE'] }),
    airports: sampleAirports(),
    token: 'token-de-teste',
    provider,
    signal: new AbortController().signal,
    sleep: async () => undefined,
    now: () => '2026-09-26T12:00:00Z',
  };
}

function ticket(destination: string): RawTicket {
  return {
    origin: 'GRU',
    destination,
    originAirport: 'GRU',
    destinationAirport: destination,
    price: 900,
    currency: 'BRL',
    airline: 'AD',
    flightNumber: '10',
    departureAt: '2026-11-18T19:25:00-03:00',
    returnAt: '2026-11-25T05:55:00-03:00',
    transfers: 0,
    returnTransfers: 0,
    link: 'https://www.aviasales.com/search/exemplo',
  };
}

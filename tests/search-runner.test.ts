// Versão: 1.2
import { describe, expect, it } from 'vitest';
import { runSearch } from '../src/infrastructure/search-runner';
import { TravelpayoutsError } from '../src/infrastructure/travelpayouts-error';
import type { FlightPriceProvider, RouteMonthQuery } from '../src/infrastructure/travelpayouts-client';
import type { RawTicket } from '../src/domain/types';
import { sampleAirports, sampleCriteria, sampleOffer } from './fixtures';

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

  it('pula a API quando a mesma rota já está salva e ainda vale', async () => {
    const calls: string[] = [];
    const provider: FlightPriceProvider = {
      async searchRouteMonth(query: RouteMonthQuery): Promise<RawTicket[]> {
        calls.push(query.destination);
        return [ticket(query.destination)];
      },
    };
    const saved = sampleOffer({ id: 'salva', price: 640, fetchedAt: '2026-09-26T11:50:00Z' });
    const result = await runSearch({
      ...options(provider),
      knownOffers: () => [saved],
      freshForMs: 60 * 60 * 1000,
    });
    expect(calls).toEqual(['FOR']);
    expect(result.requestCount).toBe(1);
    expect(result.offers.map((offer) => offer.id)).toContain('salva');
  });

  it('consulta de novo quando o preço salvo já passou da janela', async () => {
    const calls: string[] = [];
    const provider: FlightPriceProvider = {
      async searchRouteMonth(query: RouteMonthQuery): Promise<RawTicket[]> {
        calls.push(query.destination);
        return [];
      },
    };
    const saved = sampleOffer({ fetchedAt: '2026-09-20T11:50:00Z' });
    await runSearch({
      ...options(provider),
      knownOffers: () => [saved],
      freshForMs: 60 * 60 * 1000,
    });
    expect(calls).toEqual(['SSA', 'FOR']);
  });

  it('quando o mês vem vazio, guarda o preço de qualquer data', async () => {
    const calls: string[] = [];
    const provider: FlightPriceProvider = {
      async searchRouteMonth(query: RouteMonthQuery): Promise<RawTicket[]> {
        calls.push(`mes:${query.destination}`);
        return [];
      },
      async searchCalendarMonth(query: RouteMonthQuery): Promise<RawTicket[]> {
        calls.push(`cal:${query.destination}`);
        return [];
      },
      async searchCheapest(query) {
        calls.push(`barato:${query.destination}`);
        return { ...ticket(query.destination), departureAt: '2026-12-02T10:00:00-03:00' };
      },
    };
    const result = await runSearch({
      ...options(provider),
      criteria: sampleCriteria({ states: ['BA'] }),
    });
    expect(calls).toEqual(['mes:SSA', 'cal:SSA', 'barato:SSA']);
    expect(result.requestCount).toBe(3);
    expect(result.offers[0]?.anyDate).toBe(true);
    expect(result.offers[0]?.destination).toBe('SSA');
  });

  it('não pede outra data quando o mês já tem preço', async () => {
    let cheapCalls = 0;
    const provider: FlightPriceProvider = {
      async searchRouteMonth(query: RouteMonthQuery): Promise<RawTicket[]> {
        return [ticket(query.destination)];
      },
      async searchCheapest() {
        cheapCalls += 1;
        return null;
      },
    };
    const result = await runSearch({
      ...options(provider),
      criteria: sampleCriteria({ states: ['BA'] }),
    });
    expect(cheapCalls).toBe(0);
    expect(result.offers[0]?.anyDate).toBeUndefined();
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

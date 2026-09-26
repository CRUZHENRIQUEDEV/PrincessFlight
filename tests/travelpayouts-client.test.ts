// Versão: 1.1
import { describe, expect, it, vi } from 'vitest';
import { buildPricesForDatesUrl, parsePricesBody, TravelpayoutsClient } from '../src/infrastructure/travelpayouts-client';
import { TravelpayoutsError } from '../src/infrastructure/travelpayouts-error';
import type { RouteMonthQuery } from '../src/infrastructure/travelpayouts-client';

const query: RouteMonthQuery = {
  token: 'token-de-teste',
  origin: 'GRU',
  destination: 'SSA',
  month: '2026-11',
  signal: new AbortController().signal,
};

describe('cliente Travelpayouts', () => {
  it('monta a URL em real, ida e volta', () => {
    const url = new URL(buildPricesForDatesUrl(query, 'https://api.travelpayouts.com/aviasales/v3/prices_for_dates'));
    expect(url.searchParams.get('currency')).toBe('brl');
    expect(url.searchParams.get('one_way')).toBe('false');
    expect(url.searchParams.get('origin')).toBe('GRU');
    expect(url.searchParams.get('token')).toBeNull();
  });

  it('guarda a origem pedida, mesmo quando a API devolve o código da cidade', () => {
    const tickets = parsePricesBody({
      success: true,
      currency: 'brl',
      data: [{
        origin: 'SAO',
        destination: 'SSA',
        origin_airport: 'GRU',
        destination_airport: 'SSA',
        price: 1032,
        airline: 'AD',
        flight_number: 4547,
        departure_at: '2026-11-18T19:25:00-03:00',
        return_at: '2026-11-25T05:55:00-03:00',
        transfers: 0,
        return_transfers: 0,
        link: '/search/GRU1811SSA',
      }],
    }, query);
    expect(tickets[0]).toMatchObject({
      origin: 'GRU',
      destination: 'SSA',
      price: 1032,
      currency: 'BRL',
      airline: 'AD',
      flightNumber: '4547',
      link: 'https://www.aviasales.com/search/GRU1811SSA',
    });
  });

  it('tenta de novo uma vez quando a API limita a taxa', async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(new Response('{}', { status: 429 }))
      .mockResolvedValueOnce(jsonResponse({ success: true, data: [], currency: 'brl' }));
    const client = new TravelpayoutsClient(fetchFn, async () => undefined, 'https://api.exemplo');
    await expect(client.searchRouteMonth(query)).resolves.toEqual([]);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('chama fetch com o this da janela', async () => {
    const original = globalThis.fetch;
    let receiver: unknown = 'unset';
    globalThis.fetch = function (this: unknown) {
      receiver = this;
      return Promise.resolve(jsonResponse({ success: true, data: [], currency: 'brl' }));
    } as typeof fetch;
    try {
      const client = new TravelpayoutsClient();
      await expect(client.searchRouteMonth(query)).resolves.toEqual([]);
      expect(receiver).toBe(globalThis);
    } finally {
      globalThis.fetch = original;
    }
  });

  it('não repete token recusado', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response('{}', { status: 401 }));
    const client = new TravelpayoutsClient(fetchFn, async () => undefined, 'https://api.exemplo');
    await expect(client.searchRouteMonth(query)).rejects.toBeInstanceOf(TravelpayoutsError);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

// Versão: 1.2
import { describe, expect, it, vi } from 'vitest';
import { buildPricesForDatesUrl, buildCalendarUrl, buildCheapUrl, cacheCityCode, calendarEndpoint, cheapEndpoint, parseCalendarBody, parseCheapBody, parsePricesBody, TravelpayoutsClient } from '../src/infrastructure/travelpayouts-client';
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
  it('escolhe o menor preço de ida e volta, sem data fixa', () => {
    const endpoint = cheapEndpoint('https://api.travelpayouts.com/aviasales/v3/prices_for_dates');
    expect(endpoint).toBe('https://api.travelpayouts.com/v1/prices/cheap');
    const url = new URL(buildCheapUrl(query, endpoint));
    expect(url.searchParams.get('currency')).toBe('brl');
    expect(url.searchParams.get('market')).toBe('br');
    expect(url.searchParams.has('departure_at')).toBe(false);
    const ticket = parseCheapBody({
      success: true,
      currency: 'brl',
      data: {
        SSA: {
          1: { price: 900, airline: 'G3', flight_number: 1404, departure_at: '2026-12-10T08:00:00-03:00', return_at: '2026-12-17T18:00:00-03:00' },
          0: { price: 700, airline: 'AD', flight_number: 22, departure_at: '2026-11-15T09:00:00-03:00', return_at: '2026-11-22T21:00:00-03:00' },
        },
      },
    }, query);
    expect(ticket?.price).toBe(700);
    expect(ticket?.airline).toBe('AD');
    expect(ticket?.link).toBe('https://www.aviasales.com/search/GRU1511SSA22111');
    expect(cacheCityCode('GIG')).toBe('RIO');
    const rio = parseCheapBody({
      success: true,
      currency: 'brl',
      data: {
        RIO: {
          0: { price: 450, airline: 'G3', flight_number: 1, departure_at: '2026-12-01T08:00:00-03:00', return_at: '2026-12-08T18:00:00-03:00', destination_airport: 'GIG' },
        },
      },
    }, { ...query, destination: 'GIG' });
    expect(rio?.price).toBe(450);
    expect(rio?.destination).toBe('GIG');
    expect(rio?.destinationAirport).toBe('GIG');
  });

  it('monta a URL em real, ida e volta', () => {
    const url = new URL(buildPricesForDatesUrl(query, 'https://api.travelpayouts.com/aviasales/v3/prices_for_dates'));
    expect(url.searchParams.get('currency')).toBe('brl');
    expect(url.searchParams.get('one_way')).toBe('false');
    expect(url.searchParams.get('origin')).toBe('GRU');
    expect(url.searchParams.get('token')).toBeNull();
    expect(url.searchParams.get('limit')).toBe('100');
    expect(url.searchParams.get('unique')).toBe('false');
  });

  it('sem preços normais pede só a tarifa mais barata', () => {
    const url = new URL(buildPricesForDatesUrl(
      { ...query, includeRegularPrices: false },
      'https://api.travelpayouts.com/aviasales/v3/prices_for_dates',
    ));
    expect(url.searchParams.get('limit')).toBe('1');
  });

  it('lê o calendário do mês quando os dias vêm num objeto', () => {
    const endpoint = calendarEndpoint('https://api.travelpayouts.com/aviasales/v3/prices_for_dates');
    const url = new URL(buildCalendarUrl(query, endpoint));
    expect(url.pathname).toBe('/v1/prices/calendar');
    expect(url.searchParams.get('depart_date')).toBe('2026-11');
    const tickets = parseCalendarBody({
      success: true,
      currency: 'brl',
      data: {
        '2026-11-04': {
          price: 890,
          airline: 'G3',
          flight_number: 12,
          departure_at: '2026-11-04T09:00:00-03:00',
          return_at: '2026-11-11T18:00:00-03:00',
          transfers: 0,
        },
      },
    }, query);
    expect(tickets[0]).toMatchObject({ price: 890, airline: 'G3', departureAt: '2026-11-04T09:00:00-03:00' });
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

  it('com preços normais lê a página seguinte quando a primeira vem cheia', async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(jsonResponse(pageBody(100)))
      .mockResolvedValueOnce(jsonResponse(pageBody(2, 100)));
    const client = new TravelpayoutsClient(fetchFn, async () => undefined, 'https://api.exemplo');
    const tickets = await client.searchRouteMonth({ ...query, includeRegularPrices: true });
    expect(tickets).toHaveLength(102);
    const second = new URL(String(fetchFn.mock.calls[1]?.[0]));
    expect(second.searchParams.get('page')).toBe('2');
  });
});

function pageBody(count: number, offset = 0): unknown {
  return {
    success: true,
    currency: 'brl',
    data: Array.from({ length: count }, (_, index) => ({
      price: 500 + offset + index,
      departure_at: '2026-11-18T19:25:00-03:00',
      airline: 'AD',
      flight_number: offset + index + 1,
    })),
  };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

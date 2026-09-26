// Versão: 1.0
import { describe, expect, it } from 'vitest';
import { freshOriginOffers, freshRouteOffers, offersOnRoute } from '../src/domain/known-offers';
import { sampleOffer } from './fixtures';

const NOW = '2026-09-26T12:00:00Z';
const HOUR = 60 * 60 * 1000;

describe('ofertas já salvas', () => {
  it('separa a rota e o mês da ida', () => {
    const stored = [
      sampleOffer({ id: 'ssa', destination: 'SSA', departureAt: '2026-11-18T19:25:00-03:00' }),
      sampleOffer({ id: 'ssa-dez', destination: 'SSA', departureAt: '2026-12-02T19:25:00-03:00' }),
      sampleOffer({ id: 'for', destination: 'FOR', departureAt: '2026-11-18T19:25:00-03:00' }),
    ];
    expect(offersOnRoute(stored, 'gru', 'SSA', '2026-11').map((offer) => offer.id)).toEqual(['ssa']);
    expect(offersOnRoute(stored, 'GRU', 'SSA').map((offer) => offer.id)).toEqual(['ssa', 'ssa-dez']);
  });

  it('devolve a rota recente e ignora a que já passou da janela', () => {
    const fresh = sampleOffer({ id: 'nova', fetchedAt: '2026-09-26T11:50:00Z' });
    const stale = sampleOffer({ id: 'velha', destination: 'FOR', fetchedAt: '2026-09-26T10:00:00Z' });
    expect(freshRouteOffers([fresh, stale], 'GRU', 'SSA', NOW, HOUR).map((offer) => offer.id)).toEqual(['nova']);
    expect(freshRouteOffers([stale], 'GRU', 'FOR', NOW, HOUR)).toEqual([]);
    expect(freshRouteOffers([fresh], 'GRU', 'SSA', NOW, 0)).toEqual([]);
  });

  it('reaproveita o mês inteiro quando a oferta mais nova ainda vale', () => {
    const stored = [
      sampleOffer({ id: 'antiga', fetchedAt: '2026-09-26T08:00:00Z', price: 700 }),
      sampleOffer({ id: 'nova', fetchedAt: '2026-09-26T11:50:00Z', price: 900, flightNumber: '2' }),
    ];
    const found = freshRouteOffers(stored, 'GRU', 'SSA', NOW, HOUR, '2026-11');
    expect(found.map((offer) => offer.id)).toEqual(['antiga', 'nova']);
  });

  it('lista o que saiu da mesma origem dentro da janela', () => {
    const stored = [
      sampleOffer({ id: 'ssa', fetchedAt: '2026-09-26T11:40:00Z' }),
      sampleOffer({ id: 'velha', destination: 'FOR', fetchedAt: '2026-09-20T11:40:00Z' }),
      sampleOffer({ id: 'outra', origin: 'BSB', destination: 'LIS', fetchedAt: '2026-09-26T11:40:00Z' }),
    ];
    expect(freshOriginOffers(stored, 'GRU', NOW, HOUR).map((offer) => offer.id)).toEqual(['ssa']);
  });
});

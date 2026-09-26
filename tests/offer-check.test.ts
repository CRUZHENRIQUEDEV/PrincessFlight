// Versão: 1.0
import { describe, expect, it } from 'vitest';
import { judgeOffer } from '../src/domain/offer-check';
import type { RawTicket } from '../src/domain/types';
import { sampleOffer } from './fixtures';

const ticket: RawTicket = {
  origin: 'GRU',
  destination: 'SSA',
  originAirport: 'GRU',
  destinationAirport: 'SSA',
  price: 1000,
  currency: 'BRL',
  airline: 'AD',
  flightNumber: '1',
  departureAt: '2026-11-18T19:25:00-03:00',
  returnAt: '2026-11-25T05:55:00-03:00',
  transfers: 0,
  returnTransfers: 0,
  link: 'https://www.aviasales.com/search/exemplo',
};

describe('validade da oferta', () => {
  it('reconhece o mesmo voo, o preço novo e a ausência', () => {
    const current = sampleOffer();
    expect(judgeOffer(current, [ticket], '2026-09-26T15:00:00Z').status).toBe('same');
    const changed = judgeOffer(current, [{ ...ticket, price: 880 }], '2026-09-26T15:00:00Z');
    expect(changed.status).toBe('changed');
    expect(changed.offer?.price).toBe(880);
    expect(judgeOffer(current, [{ ...ticket, flightNumber: '99' }], '2026-09-26T15:00:00Z').status).toBe('missing');
  });
});

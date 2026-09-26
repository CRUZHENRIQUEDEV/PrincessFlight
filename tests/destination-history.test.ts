// Versão: 1.0
import { describe, expect, it } from 'vitest';
import { buildDestinationHistory } from '../src/domain/destination-history';
import { sampleOffer } from './fixtures';

describe('histórico de preços do destino', () => {
  it('junta os preços conhecidos da mesma rota e ignora outro destino', () => {
    const opened = sampleOffer({ id: 'aberto', price: 900, departureAt: '2026-11-20T10:00:00-03:00', foundAt: '2026-09-26T15:00:00Z' });
    const history = buildDestinationHistory([
      sampleOffer({ id: 'outro', destination: 'REC', price: 100 }),
      sampleOffer({ id: 'cedo', price: 800, departureAt: '2026-11-18T08:00:00-03:00', foundAt: '2026-09-20' }),
      sampleOffer({ id: 'caro', price: 1200, departureAt: '2026-11-18T18:00:00-03:00', foundAt: '2026-09-21T12:00:00Z' }),
      opened,
    ], opened);
    expect(history.count).toBe(3);
    expect(history.departures).toEqual([
      { at: '2026-11-18', price: 800 },
      { at: '2026-11-20', price: 900 },
    ]);
    expect(history.observations.map((point) => point.price)).toEqual([800, 1200, 900]);
  });

  it('inclui a oferta aberta quando ela ainda não está no arquivo', () => {
    const opened = sampleOffer({ id: 'nova', fetchedAt: '2026-09-26T18:00:00Z' });
    const history = buildDestinationHistory([], opened);
    expect(history.count).toBe(1);
    expect(history.observations).toEqual([{ at: '2026-09-26T18:00:00Z', price: 1000 }]);
  });
});

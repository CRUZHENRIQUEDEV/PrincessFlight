// Versão: 1.0
import { describe, expect, it } from 'vitest';
import { buildPriceChartModel } from '../src/domain/price-series';
import type { Airport } from '../src/domain/types';
import { sampleOffer } from './fixtures';

const AIRPORTS: Airport[] = [
  airport('SSA', 'Salvador'),
  airport('IOS', 'Ilhéus'),
  airport('REC', 'Recife'),
  airport('FOR', 'Fortaleza'),
  airport('NAT', 'Natal'),
];

describe('séries de preço para os gráficos', () => {
  it('fica vazio sem ofertas', () => {
    expect(buildPriceChartModel([], AIRPORTS).bars).toEqual([]);
  });

  it('usa o menor preço de cada destino e ordena do mais barato', () => {
    const model = buildPriceChartModel([
      sampleOffer({ id: 'a', destination: 'SSA', price: 1200, isBargain: false }),
      sampleOffer({ id: 'b', destination: 'SSA', price: 800, isBargain: true }),
      sampleOffer({ id: 'c', destination: 'IOS', price: 900, isBargain: false }),
    ], AIRPORTS);
    expect(model.bars.map((bar) => [bar.city, bar.price, bar.isBargain])).toEqual([
      ['Salvador', 800, true],
      ['Ilhéus', 900, false],
    ]);
  });

  it('desenha uma linha por destino quando há poucos destinos', () => {
    const model = buildPriceChartModel([
      sampleOffer({ destination: 'SSA', price: 800, departureAt: '2026-11-18T19:25:00-03:00' }),
      sampleOffer({ destination: 'SSA', price: 700, departureAt: '2026-11-20T10:00:00-03:00' }),
      sampleOffer({ destination: 'IOS', price: 950, departureAt: '2026-11-18T08:00:00-03:00' }),
    ], AIRPORTS);
    expect(model.dates).toEqual(['18/11', '20/11']);
    expect(model.collapsedToCheapest).toBe(false);
    expect(model.lines).toEqual([
      { label: 'Ilhéus', prices: [950, null] },
      { label: 'Salvador', prices: [800, 700] },
    ]);
  });

  it('resume muitos destinos no menor preço de cada dia', () => {
    const offers = ['SSA', 'IOS', 'REC', 'FOR', 'NAT'].map((destination, index) => sampleOffer({
      id: destination,
      destination,
      price: 1000 + index * 10,
      departureAt: '2026-11-19T02:00:00Z',
    }));
    const model = buildPriceChartModel(offers, AIRPORTS);
    expect(model.collapsedToCheapest).toBe(true);
    expect(model.dates).toEqual(['18/11']);
    expect(model.lines).toEqual([{ label: 'Menor preço', prices: [1000] }]);
  });
});

function airport(iata: string, city: string): Airport {
  return {
    iata,
    city,
    name: city,
    state: 'BA',
    region: 'nordeste',
    country: 'BR',
    latitude: 0,
    longitude: 0,
    coastal: true,
  };
}

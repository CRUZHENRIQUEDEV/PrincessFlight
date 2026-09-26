// Versão: 1.1
import { describe, expect, it } from 'vitest';
import { applyOfferFilters, selectDestinations } from '../src/domain/filters';
import { median, markBargains } from '../src/domain/price-anomaly';
import { groupOffersByDestination, presentAnywhereOffers, presentFavoriteOffers, presentOffers } from '../src/domain/present-offers';
import { parseAirlines, parseCriteria } from '../src/domain/criteria';
import type { Airport, FlightOffer, HolidayWindow } from '../src/domain/types';
import { sampleAirports, sampleCriteria, sampleOffer } from './fixtures';

describe('mediana e barganha', () => {
  it('calcula mediana par e ímpar', () => {
    expect(median([100, 200, 300, 800])).toBe(250);
    expect(median([100, 200, 1000])).toBe(200);
  });

  it('marca só o preço até 70% da mediana do mesmo destino', () => {
    const offers = [
      sampleOffer({ id: 'a', destination: 'SSA', price: 100 }),
      sampleOffer({ id: 'b', destination: 'SSA', price: 1000 }),
      sampleOffer({ id: 'c', destination: 'REC', price: 100 }),
    ];
    const marked = markBargains(offers, 0.7);
    expect(marked.find((offer) => offer.id === 'a')?.isBargain).toBe(true);
    expect(marked.find((offer) => offer.id === 'b')?.isBargain).toBe(false);
    expect(marked.find((offer) => offer.id === 'c')?.isBargain).toBe(false);
  });
});

describe('agrupamento', () => {
  it('junta o mesmo destino e mantém a ordem da lista', () => {
    const offers = [
      sampleOffer({ id: 'barato', destination: 'SSA', price: 100 }),
      sampleOffer({ id: 'recife', destination: 'REC', price: 200 }),
      sampleOffer({ id: 'caro', destination: 'SSA', price: 300 }),
    ];
    const groups = groupOffersByDestination(offers);
    expect(groups.map((group) => group.map((offer) => offer.id))).toEqual([['barato', 'caro'], ['recife']]);
  });

  it('ordena qualquer destino pelo menor preço e marca quem fica abaixo da mediana geral', () => {
    const offers = [
      sampleOffer({ id: 'caro', destination: 'LIS', price: 4000 }),
      sampleOffer({ id: 'barato', destination: 'REC', price: 500 }),
      sampleOffer({ id: 'medio', destination: 'SSA', price: 1000 }),
      sampleOffer({ id: 'repetido', destination: 'REC', price: 900 }),
    ];
    const shown = presentAnywhereOffers(offers, 'GRU', 'price', 0.7);
    expect(shown.map((offer) => offer.id)).toEqual(['barato', 'medio', 'caro']);
    expect(shown[0]?.isBargain).toBe(true);
    expect(shown[2]?.isBargain).toBe(false);
    const recife = { ...sampleAirports()[1]!, iata: 'REC', city: 'Recife' };
    const abroad = presentAnywhereOffers(offers, 'GRU', 'price', 0.7, 'internacional', [...sampleAirports(), recife]);
    expect(abroad.map((offer) => offer.destination)).toEqual(['LIS']);
  });

  it('mostra só os destinos favoritos, em qualquer data', () => {
    const offers = [
      sampleOffer({ id: 'ssa', destination: 'SSA', price: 300, departureAt: '2026-12-02T10:00:00-03:00' }),
      sampleOffer({ id: 'rec', destination: 'REC', price: 100 }),
      sampleOffer({ id: 'outra', origin: 'BSB', destination: 'SSA', price: 50 }),
    ];
    expect(presentFavoriteOffers(offers, 'GRU', ['SSA']).map((offer) => offer.id)).toEqual(['ssa']);
  });
});

describe('filtros', () => {
  it('escolhe litoral, região, estado e internacional sem a origem', () => {
    const airports = sampleAirports();
    expect(codes(selectDestinations(airports, sampleCriteria()))).toEqual(['SSA', 'FOR']);
    expect(codes(selectDestinations(airports, sampleCriteria({ regions: ['nordeste'], coastalOnly: false })))).toEqual(['SSA', 'FOR']);
    expect(codes(selectDestinations(airports, sampleCriteria({ states: ['BA'] })))).toEqual(['SSA']);
    expect(codes(selectDestinations(airports, sampleCriteria({ scope: 'internacional', coastalOnly: false })))).toEqual(['LIS']);
  });

  it('filtra data, preço, companhia e ponte', () => {
    const windows: HolidayWindow[] = [{
      holidayDate: '2026-11-26',
      holidayName: 'Teste',
      departureDate: '2026-11-26',
      returnDate: '2026-11-29',
    }];
    const offers = [
      sampleOffer({ id: 'in', departureAt: '2026-11-18T10:00:00-03:00', price: 800, airline: 'AD' }),
      sampleOffer({ id: 'out', departureAt: '2026-12-02T10:00:00-03:00', price: 800, airline: 'AD' }),
      sampleOffer({ id: 'dear', departureAt: '2026-11-18T10:00:00-03:00', price: 5000, airline: 'AD' }),
      sampleOffer({ id: 'other', departureAt: '2026-11-18T10:00:00-03:00', price: 800, airline: 'G3' }),
    ];
    const criteria = sampleCriteria({ priceMax: 1000, airlines: ['AD'] });
    expect(applyOfferFilters(offers, criteria, []).map((offer) => offer.id)).toEqual(['in']);
    const holiday = applyOfferFilters(offers, sampleCriteria({ holidayBridgeOnly: true }), windows);
    expect(holiday).toEqual([]);
    const anyDate = applyOfferFilters(offers, sampleCriteria({ departureStart: '', departureEnd: '' }), []);
    expect(anyDate.map((offer) => offer.id)).toEqual(['in', 'out', 'dear', 'other']);
  });
});

describe('apresentação', () => {
  it('esconde outra origem e ordena a barganha primeiro', () => {
    const stored: FlightOffer[] = [
      sampleOffer({ id: 'caro', price: 1000 }),
      sampleOffer({ id: 'barato', price: 100 }),
      sampleOffer({ id: 'outra', origin: 'BSB', price: 50 }),
    ];
    const visible = presentOffers(stored, sampleCriteria({ states: ['BA'] }), sampleAirports());
    expect(visible.map((offer) => offer.id)).toEqual(['barato', 'caro']);
    expect(visible[0].isBargain).toBe(true);
  });

  it('só preços baixos esconde quem está na mediana ou acima', () => {
    const stored: FlightOffer[] = [
      sampleOffer({ id: 'caro', price: 900 }),
      sampleOffer({ id: 'medio', price: 180 }),
      sampleOffer({ id: 'barato', price: 100 }),
      sampleOffer({ id: 'for', destination: 'FOR', price: 800 }),
    ];
    const visible = presentOffers(
      stored,
      sampleCriteria({ coastalOnly: false, includeRegularPrices: false }),
      sampleAirports(),
    );
    expect(visible.map((offer) => offer.id)).toEqual(['barato', 'for']);
  });

  it('ordena as ofertas pela data de ida', () => {
    const stored: FlightOffer[] = [
      sampleOffer({ id: 'tarde', price: 100, departureAt: '2026-11-20T10:00:00-03:00' }),
      sampleOffer({ id: 'cedo', price: 900, departureAt: '2026-11-02T10:00:00-03:00' }),
    ];
    const visible = presentOffers(stored, sampleCriteria({ states: ['BA'], offerSort: 'date' }), sampleAirports());
    expect(visible.map((offer) => offer.id)).toEqual(['cedo', 'tarde']);
  });

  it('ordena pelo maior desconto abaixo da mediana', () => {
    const stored: FlightOffer[] = [
      sampleOffer({ id: 'caro', price: 1000, departureAt: '2026-11-10T10:00:00-03:00' }),
      sampleOffer({ id: 'medio', price: 800, departureAt: '2026-11-11T10:00:00-03:00' }),
      sampleOffer({ id: 'barato', price: 200, departureAt: '2026-11-12T10:00:00-03:00' }),
    ];
    const visible = presentOffers(stored, sampleCriteria({ states: ['BA'], offerSort: 'discount' }), sampleAirports());
    expect(visible.map((offer) => offer.id)).toEqual(['barato', 'medio', 'caro']);
  });
});

describe('critério', () => {
  it('normaliza companhias e rejeita pausa curta', () => {
    expect(parseAirlines('g3, ad la X, XXX')).toEqual(['G3', 'AD', 'LA']);
    const parsed = parseCriteria({
      originIata: 'gru',
      scope: 'nacional',
      regions: [],
      states: [],
      coastalOnly: true,
      departureStart: '2026-11-01',
      departureEnd: '2026-11-30',
      tripLengthDays: '',
      holidayBridgeOnly: false,
      priceMin: '',
      priceMax: '1500',
      bargainRatioPercent: '70',
      airlinesText: 'ad',
      delayBetweenCallsSeconds: '1',
      repeatEveryMinutes: '',
      bargainsOnly: false,
      includeRegularPrices: true,
      offerSort: 'price',
    });
    expect(parsed.criteria.originIata).toBe('GRU');
    expect(parsed.criteria.priceMax).toBe(1500);
    expect(parsed.criteria.repeatEveryMinutes).toBe(0);
    expect(parsed.fieldError).toMatch(/2 segundos/);
  });
});

function codes(airports: readonly Airport[]): string[] {
  return airports.map((airport) => airport.iata);
}

// Versão: 1.4
import type { Airport, FlightOffer, SearchCriteria } from '../src/domain/types';

export function sampleCriteria(overrides: Partial<SearchCriteria> = {}): SearchCriteria {
  return {
    originIata: 'GRU',
    scope: 'nacional',
    regions: [],
    states: [],
    coastalOnly: true,
    departureStart: '2026-11-01',
    departureEnd: '2026-11-30',
    tripLengthDays: null,
    holidayBridgeOnly: false,
    priceMin: null,
    priceMax: null,
    bargainRatio: 0.7,
    airlines: [],
    delayBetweenCallsSeconds: 5,
    repeatEveryMinutes: 0,
    bargainsOnly: false,
    includeRegularPrices: true,
    offerSort: 'price',
    ...overrides,
  };
}

export function sampleOffer(overrides: Partial<FlightOffer> = {}): FlightOffer {
  return {
    id: 'ssa-1',
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
    fetchedAt: '2026-09-26T12:00:00Z',
    isBargain: false,
    referencePrice: null,
    gapRatio: null,
    ...overrides,
  };
}

export function sampleAirports(): Airport[] {
  return [
    airport('GRU', 'São Paulo', 'SP', 'sudeste', 'BR', false),
    airport('SSA', 'Salvador', 'BA', 'nordeste', 'BR', true),
    airport('FOR', 'Fortaleza', 'CE', 'nordeste', 'BR', true),
    airport('BSB', 'Brasília', 'DF', 'centro-oeste', 'BR', false),
    airport('LIS', 'Lisboa', 'PT', 'internacional', 'PT', false),
  ];
}

function airport(
  iata: string,
  city: string,
  state: string,
  region: Airport['region'],
  country: string,
  coastal: boolean,
): Airport {
  return { iata, city, name: city, state, region, country, latitude: 0, longitude: 0, coastal };
}

// Versão: 1.4
import { matchesBridgeTrip } from './holiday-windows';
import { calendarDay, daysBetween } from './iso-date';
import type { Airport, FlightOffer, HolidayWindow, SearchCriteria } from './types';

export function selectDestinations(
  airports: readonly Airport[],
  criteria: Pick<SearchCriteria, 'originIata' | 'scope' | 'regions' | 'states' | 'coastalOnly'>,
): Airport[] {
  return airports.filter((airport) => matchesDestination(airport, criteria));
}

export function applyOfferFilters(
  offers: readonly FlightOffer[],
  criteria: SearchCriteria,
  windows: readonly HolidayWindow[],
): FlightOffer[] {
  return offers.filter((offer) => keepsOffer(offer, criteria, windows));
}

/** O mês veio vazio. Este preço é o único do cache e pode cair fora do período. */
export function anyDateWarning(): string {
  return 'Único preço no cache do Aviasales Brasil, em outra data. Não segue o período desta pesquisa.';
}

function keepsOffer(
  offer: FlightOffer,
  criteria: SearchCriteria,
  windows: readonly HolidayWindow[],
): boolean {
  if (!matchesPrice(offer, criteria) || !matchesAirline(offer, criteria)) return false;
  if (offer.anyDate) return true;
  return matchesDate(offer, criteria)
    && matchesTripLength(offer, criteria.tripLengthDays)
    && matchesHoliday(offer, criteria, windows);
}

function matchesDestination(
  airport: Airport,
  criteria: Pick<SearchCriteria, 'originIata' | 'scope' | 'regions' | 'states' | 'coastalOnly'>,
): boolean {
  if (airport.iata === criteria.originIata) return false;
  if (criteria.scope === 'internacional') return airport.country !== 'BR';
  if (airport.country !== 'BR') return false;
  if (criteria.coastalOnly && !airport.coastal) return false;
  if (criteria.regions.length > 0 && !criteria.regions.includes(airport.region)) return false;
  if (criteria.states.length > 0 && !criteria.states.includes(airport.state)) return false;
  return true;
}

function matchesDate(offer: FlightOffer, criteria: SearchCriteria): boolean {
  if (criteria.holidayBridgeOnly) return true;
  if (!criteria.departureStart && !criteria.departureEnd) return true;
  const day = calendarDay(offer.departureAt);
  if (!day || !criteria.departureStart || !criteria.departureEnd) return false;
  return day >= criteria.departureStart && day <= criteria.departureEnd;
}

/** Vazio aceita qualquer estadia. Com duração, a volta precisa cair exatamente nesses dias. */
export function matchesTripLength(offer: FlightOffer, days: number | null | undefined): boolean {
  const wanted = normalizeTripLength(days);
  if (wanted === null) return true;
  return stayDays(offer) === wanted;
}

export function cheapestByDepartureDay(
  offers: readonly FlightOffer[],
  originIata: string,
  tripLengthDays: number | null | undefined,
): Map<string, number> {
  const origin = originIata.toUpperCase();
  const prices = new Map<string, number>();
  for (const offer of offers) {
    if (offer.origin !== origin || !matchesTripLength(offer, tripLengthDays)) continue;
    const day = calendarDay(offer.departureAt);
    if (!day) continue;
    const current = prices.get(day);
    if (current === undefined || offer.price < current) prices.set(day, offer.price);
  }
  return prices;
}

function stayDays(offer: FlightOffer): number | null {
  const start = calendarDay(offer.departureAt);
  const end = calendarDay(offer.returnAt ?? '');
  if (!start || !end) return null;
  return daysBetween(start, end);
}

export function normalizeTripLength(days: number | null | undefined): number | null {
  if (typeof days !== 'number' || !Number.isFinite(days) || days < 1) return null;
  return Math.min(60, Math.floor(days));
}

function matchesHoliday(
  offer: FlightOffer,
  criteria: SearchCriteria,
  windows: readonly HolidayWindow[],
): boolean {
  if (!criteria.holidayBridgeOnly) return true;
  return windows.some((window) => matchesBridgeTrip(offer, window));
}

function matchesPrice(offer: FlightOffer, criteria: SearchCriteria): boolean {
  if (criteria.priceMin !== null && offer.price < criteria.priceMin) return false;
  if (criteria.priceMax !== null && offer.price > criteria.priceMax) return false;
  return true;
}

function matchesAirline(offer: FlightOffer, criteria: SearchCriteria): boolean {
  if (criteria.airlines.length === 0) return true;
  return criteria.airlines.includes(offer.airline.toUpperCase());
}

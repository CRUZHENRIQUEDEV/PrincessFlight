// Versão: 1.0
import { calendarDay } from './iso-date';
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
  return offers.filter((offer) =>
    matchesDate(offer, criteria)
    && matchesHoliday(offer, criteria, windows)
    && matchesPrice(offer, criteria)
    && matchesAirline(offer, criteria),
  );
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
  const day = calendarDay(offer.departureAt);
  if (!day || !criteria.departureStart || !criteria.departureEnd) return false;
  return day >= criteria.departureStart && day <= criteria.departureEnd;
}

function matchesHoliday(
  offer: FlightOffer,
  criteria: SearchCriteria,
  windows: readonly HolidayWindow[],
): boolean {
  if (!criteria.holidayBridgeOnly) return true;
  const day = calendarDay(offer.departureAt);
  return windows.some((window) => day >= window.departureDate && day <= window.returnDate);
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

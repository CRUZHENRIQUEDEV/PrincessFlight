// Versão: 1.3
import { applyOfferFilters } from './filters';
import { markBargains } from './price-anomaly';
import { buildSearchPlan } from './search-plan';
import type { Airport, FlightOffer, SearchCriteria } from './types';

export function presentOffers(
  stored: readonly FlightOffer[],
  criteria: SearchCriteria,
  airports: readonly Airport[],
): FlightOffer[] {
  const plan = buildSearchPlan(criteria, airports);
  const allowed = new Set(plan.destinations.map((airport) => airport.iata));
  const inScope = stored.filter((offer) => offer.origin === criteria.originIata && allowed.has(offer.destination));
  const filtered = applyOfferFilters(inScope, criteria, plan.windows);
  const marked = markBargains(filtered, criteria.bargainRatio);
  const pool = criteria.includeRegularPrices === false ? lowPrices(marked) : marked;
  const visible = criteria.bargainsOnly ? pool.filter((offer) => offer.isBargain) : pool;
  const compare = criteria.offerSort === 'date' ? compareByDate : compareByPrice;
  return [...visible].sort(compare);
}

export function cheapestByDestination(offers: readonly FlightOffer[]): Map<string, FlightOffer> {
  const cheapest = new Map<string, FlightOffer>();
  for (const offer of offers) {
    const current = cheapest.get(offer.destination);
    if (!current || offer.price < current.price) cheapest.set(offer.destination, offer);
  }
  return cheapest;
}

function lowPrices(offers: readonly FlightOffer[]): FlightOffer[] {
  return offers.filter((offer) => offer.gapRatio === null || offer.gapRatio > 0);
}

function compareByPrice(left: FlightOffer, right: FlightOffer): number {
  if (left.price !== right.price) return left.price - right.price;
  return left.departureAt.localeCompare(right.departureAt);
}

function compareByDate(left: FlightOffer, right: FlightOffer): number {
  if (left.departureAt !== right.departureAt) return left.departureAt.localeCompare(right.departureAt);
  return left.price - right.price;
}

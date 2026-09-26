// Versão: 1.0
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
  const visible = criteria.bargainsOnly ? marked.filter((offer) => offer.isBargain) : marked;
  return [...visible].sort(compareOffers);
}

export function cheapestByDestination(offers: readonly FlightOffer[]): Map<string, FlightOffer> {
  const cheapest = new Map<string, FlightOffer>();
  for (const offer of offers) {
    const current = cheapest.get(offer.destination);
    if (!current || offer.price < current.price) cheapest.set(offer.destination, offer);
  }
  return cheapest;
}

function compareOffers(left: FlightOffer, right: FlightOffer): number {
  if (left.isBargain !== right.isBargain) return left.isBargain ? -1 : 1;
  if (left.price !== right.price) return left.price - right.price;
  return left.destination.localeCompare(right.destination);
}

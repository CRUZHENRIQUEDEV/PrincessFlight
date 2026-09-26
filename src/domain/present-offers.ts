// Versão: 1.6
import { applyOfferFilters } from './filters';
import { markBargains } from './price-anomaly';
import { buildSearchPlan } from './search-plan';
import type { Airport, FlightOffer, OfferSort, SearchCriteria } from './types';

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
  return [...visible].sort(compareOffers(criteria.offerSort));
}

export function presentFavoriteOffers(
  stored: readonly FlightOffer[],
  originIata: string,
  destinations: readonly string[],
  sort: OfferSort = 'price',
  bargainRatio = 0.7,
): FlightOffer[] {
  const origin = originIata.toUpperCase();
  const allowed = new Set(destinations.map((code) => code.toUpperCase()));
  const visible = stored.filter((offer) => offer.origin === origin && allowed.has(offer.destination));
  return markBargains(visible, bargainRatio).sort(compareOffers(sort));
}

export function groupOffersByDestination(offers: readonly FlightOffer[]): FlightOffer[][] {
  const order: string[] = [];
  const groups = new Map<string, FlightOffer[]>();
  for (const offer of offers) {
    const current = groups.get(offer.destination);
    if (!current) {
      order.push(offer.destination);
      groups.set(offer.destination, [offer]);
      continue;
    }
    current.push(offer);
  }
  return order.map((destination) => groups.get(destination) ?? []);
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

function compareOffers(sort: OfferSort): (left: FlightOffer, right: FlightOffer) => number {
  if (sort === 'date') return compareByDate;
  if (sort === 'discount') return compareByDiscount;
  return compareByPrice;
}

function compareByDiscount(left: FlightOffer, right: FlightOffer): number {
  const gap = discountRank(right) - discountRank(left);
  if (gap !== 0) return gap;
  if (left.price !== right.price) return left.price - right.price;
  return left.departureAt.localeCompare(right.departureAt);
}

function discountRank(offer: FlightOffer): number {
  return offer.gapRatio ?? Number.NEGATIVE_INFINITY;
}

function compareByPrice(left: FlightOffer, right: FlightOffer): number {
  if (left.price !== right.price) return left.price - right.price;
  return left.departureAt.localeCompare(right.departureAt);
}

function compareByDate(left: FlightOffer, right: FlightOffer): number {
  if (left.departureAt !== right.departureAt) return left.departureAt.localeCompare(right.departureAt);
  return left.price - right.price;
}

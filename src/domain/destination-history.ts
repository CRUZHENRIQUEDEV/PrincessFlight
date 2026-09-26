// Versão: 1.0
import { calendarDay } from './iso-date';
import { priceFoundAt } from './offer';
import type { FlightOffer } from './types';

export interface HistoryPrice {
  at: string;
  price: number;
}

export interface DestinationHistory {
  currency: string;
  count: number;
  departures: HistoryPrice[];
  observations: HistoryPrice[];
}

/** Preços já guardados para a mesma origem e o mesmo destino. */
export function buildDestinationHistory(stored: readonly FlightOffer[], offer: FlightOffer): DestinationHistory {
  const origin = offer.origin.toUpperCase();
  const destination = offer.destination.toUpperCase();
  const mine = stored.filter((item) => item.origin.toUpperCase() === origin && item.destination.toUpperCase() === destination);
  if (!mine.some((item) => item.id === offer.id)) mine.push(offer);
  return {
    currency: offer.currency || mine[0]?.currency || 'BRL',
    count: mine.length,
    departures: cheapestByDay(mine),
    observations: [...mine]
      .map((item) => ({ at: observedAt(item), price: item.price }))
      .sort((left, right) => left.at.localeCompare(right.at) || left.price - right.price),
  };
}

function cheapestByDay(offers: readonly FlightOffer[]): HistoryPrice[] {
  const cheapest = new Map<string, number>();
  for (const offer of offers) {
    const day = calendarDay(offer.departureAt);
    if (!day) continue;
    const current = cheapest.get(day);
    if (current === undefined || offer.price < current) cheapest.set(day, offer.price);
  }
  return [...cheapest.entries()]
    .map(([at, price]) => ({ at, price }))
    .sort((left, right) => left.at.localeCompare(right.at));
}

function observedAt(offer: FlightOffer): string {
  return priceFoundAt(offer) || offer.fetchedAt;
}

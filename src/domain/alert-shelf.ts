// Versão: 1.0
import type { FlightOffer, RawTicket } from './types';

export type PriceValidity = 'saved' | 'same' | 'changed' | 'missing';

export interface StoredAlert {
  key: string;
  offer: FlightOffer;
  savedAt: string;
  checkedAt: string | null;
  validity: PriceValidity;
  livePrice: number | null;
}

const SHELF_LIMIT = 200;

export function flightKey(offer: Pick<FlightOffer, 'origin' | 'destination' | 'departureAt' | 'returnAt' | 'airline' | 'flightNumber'>): string {
  return [offer.origin, offer.destination, offer.departureAt, offer.returnAt ?? '', offer.airline, offer.flightNumber].join('|');
}

export function rememberAlerts(current: readonly StoredAlert[], fresh: readonly FlightOffer[], now: string): StoredAlert[] {
  const next = current.map((item) => ({ ...item }));
  for (const offer of fresh) {
    const key = flightKey(offer);
    const index = next.findIndex((item) => item.key === key);
    if (index < 0) {
      next.unshift({ key, offer, savedAt: now, checkedAt: null, validity: 'saved', livePrice: null });
      continue;
    }
    next[index] = mergeKnown(next[index], offer, now);
  }
  return next.slice(0, SHELF_LIMIT);
}

export function applyLiveQuote(item: StoredAlert, tickets: readonly RawTicket[], now: string): StoredAlert {
  const match = tickets.find((ticket) => sameFlight(item.offer, ticket));
  if (!match) return { ...item, checkedAt: now, validity: 'missing', livePrice: null };
  const same = match.price === item.offer.price;
  return {
    ...item,
    checkedAt: now,
    validity: same ? 'same' : 'changed',
    livePrice: match.price,
    offer: same ? item.offer : { ...item.offer, price: match.price, fetchedAt: now },
  };
}

export function validityLabel(item: StoredAlert, priceLabel: string): string {
  if (item.validity === 'same') return 'Preço confirmado agora';
  if (item.validity === 'changed') return `Mudou para ${priceLabel}`;
  if (item.validity === 'missing') return 'Não apareceu na consulta';
  return 'Ainda não conferida';
}

function mergeKnown(item: StoredAlert, offer: FlightOffer, now: string): StoredAlert {
  if (item.offer.price === offer.price) return { ...item, offer };
  return { ...item, offer, checkedAt: now, validity: 'changed', livePrice: offer.price };
}

function sameFlight(offer: FlightOffer, ticket: RawTicket): boolean {
  return ticket.origin.toUpperCase() === offer.origin
    && ticket.destination.toUpperCase() === offer.destination
    && ticket.airline.toUpperCase() === offer.airline
    && String(ticket.flightNumber) === offer.flightNumber
    && ticket.departureAt === offer.departureAt;
}

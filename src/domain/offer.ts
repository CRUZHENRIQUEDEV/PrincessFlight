// Versão: 1.3
import type { FlightOffer, RawTicket } from './types';

export function toFlightOffer(ticket: RawTicket, fetchedAt: string): FlightOffer {
  const normalized = normalizeTicket(ticket);
  return {
    id: createOfferId(normalized),
    origin: normalized.origin,
    destination: normalized.destination,
    originAirport: normalized.originAirport,
    destinationAirport: normalized.destinationAirport,
    price: normalized.price,
    currency: normalized.currency || 'BRL',
    airline: normalized.airline,
    flightNumber: normalized.flightNumber,
    departureAt: normalized.departureAt,
    returnAt: normalized.returnAt,
    transfers: normalized.transfers,
    returnTransfers: normalized.returnTransfers,
    link: normalized.link,
    foundAt: normalized.foundAt || searchDateFromLink(normalized.link),
    durationToMinutes: normalized.durationToMinutes ?? null,
    durationBackMinutes: normalized.durationBackMinutes ?? null,
    fetchedAt,
    isBargain: false,
    referencePrice: null,
    gapRatio: null,
  };
}

/** Momento em que o preço foi achado numa busca do Aviasales. */
export function priceFoundAt(offer: Pick<FlightOffer, 'foundAt' | 'link'>): string | null {
  if (offer.foundAt) return offer.foundAt;
  return searchDateFromLink(offer.link);
}

/** A data da busca às vezes só vem dentro do link, no formato DDMMAAAA. */
export function searchDateFromLink(link: string): string | null {
  const match = /[?&]search_date=(\d{2})(\d{2})(\d{4})/.exec(link);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 2000) return null;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function normalizeTicket(ticket: RawTicket): RawTicket {
  return {
    ...ticket,
    origin: ticket.origin.toUpperCase(),
    destination: ticket.destination.toUpperCase(),
    originAirport: ticket.originAirport.toUpperCase(),
    destinationAirport: ticket.destinationAirport.toUpperCase(),
    currency: ticket.currency.toUpperCase(),
    airline: ticket.airline.toUpperCase(),
  };
}

function createOfferId(ticket: RawTicket): string {
  return [
    ticket.origin,
    ticket.destination,
    ticket.departureAt,
    ticket.returnAt ?? '',
    ticket.airline,
    ticket.flightNumber,
    String(ticket.price),
  ].join('|');
}

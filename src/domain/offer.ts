// Versão: 1.2
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
    durationToMinutes: normalized.durationToMinutes ?? null,
    durationBackMinutes: normalized.durationBackMinutes ?? null,
    fetchedAt,
    isBargain: false,
    referencePrice: null,
    gapRatio: null,
  };
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

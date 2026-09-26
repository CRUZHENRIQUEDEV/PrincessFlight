// Versão: 1.1
import { calendarDay } from './iso-date';
import { toFlightOffer } from './offer';
import type { FlightOffer, RawTicket } from './types';

export type OfferVerdictStatus = 'same' | 'changed' | 'missing';

export interface OfferVerdict {
  status: OfferVerdictStatus;
  offer: FlightOffer | null;
}

/** Compara o voo guardado com o que a API devolveu agora. */
export function judgeOffer(current: FlightOffer, tickets: readonly RawTicket[], now: string): OfferVerdict {
  const live = tickets.map((ticket) => toFlightOffer(ticket, now)).find((item) => sameFlight(item, current));
  if (!live) return { status: 'missing', offer: null };
  if (live.price === current.price) {
    return { status: 'same', offer: { ...current, fetchedAt: now, link: live.link || current.link, foundAt: live.foundAt ?? current.foundAt } };
  }
  return { status: 'changed', offer: live };
}

export function departureMonth(departureAt: string): string {
  return calendarDay(departureAt).slice(0, 7);
}

function sameFlight(left: FlightOffer, right: FlightOffer): boolean {
  if (left.origin !== right.origin || left.destination !== right.destination) return false;
  if (left.airline !== right.airline) return false;
  if (!sameNumber(left.flightNumber, right.flightNumber)) return false;
  return calendarDay(left.departureAt) === calendarDay(right.departureAt)
    && calendarDay(left.returnAt ?? '') === calendarDay(right.returnAt ?? '');
}

function sameNumber(left: string, right: string): boolean {
  if (!left || !right) return left === right;
  return left.toUpperCase() === right.toUpperCase();
}

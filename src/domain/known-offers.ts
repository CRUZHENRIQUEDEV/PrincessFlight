// Versão: 1.0
import { calendarDay } from './iso-date';
import type { FlightOffer } from './types';

/** Ofertas já salvas da mesma origem e do mesmo destino. O mês limita a ida, quando a busca pede um mês. */
export function offersOnRoute(
  stored: readonly FlightOffer[],
  origin: string,
  destination: string,
  month?: string,
): FlightOffer[] {
  const from = origin.trim().toUpperCase();
  const to = destination.trim().toUpperCase();
  return stored.filter((offer) => {
    if (offer.origin.toUpperCase() !== from || offer.destination.toUpperCase() !== to) return false;
    if (!month) return true;
    return calendarDay(offer.departureAt).slice(0, 7) === month;
  });
}

/**
 * Reaproveita a rota se a oferta mais nova ainda está dentro da janela.
 * Fora dela, a consulta volta para a API.
 */
export function freshRouteOffers(
  stored: readonly FlightOffer[],
  origin: string,
  destination: string,
  now: string,
  freshForMs: number,
  month?: string,
): FlightOffer[] {
  const matches = offersOnRoute(stored, origin, destination, month);
  if (matches.length === 0 || freshForMs <= 0) return [];
  const newest = matches.reduce((best, offer) => (offer.fetchedAt > best ? offer.fetchedAt : best), '');
  const age = Date.parse(now) - Date.parse(newest);
  if (!Number.isFinite(age) || age >= freshForMs) return [];
  return matches.map((offer) => ({ ...offer }));
}

/** Ofertas recentes que saem da mesma origem, para a busca de qualquer destino. */
export function freshOriginOffers(
  stored: readonly FlightOffer[],
  origin: string,
  now: string,
  freshForMs: number,
): FlightOffer[] {
  if (freshForMs <= 0) return [];
  const from = origin.trim().toUpperCase();
  return stored
    .filter((offer) => offer.origin.toUpperCase() === from)
    .filter((offer) => {
      const age = Date.parse(now) - Date.parse(offer.fetchedAt);
      return Number.isFinite(age) && age < freshForMs;
    })
    .map((offer) => ({ ...offer }));
}

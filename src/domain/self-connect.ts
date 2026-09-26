// Versão: 1.0
import { cityCode } from './connection-hubs';
import { calendarDay } from './iso-date';
import { priceFoundAt } from './offer';
import type { ConnectLeg, FlightOffer, SelfConnect } from './types';

/** Folga mínima entre a chegada e a saída da outra passagem. */
export const SELF_CONNECT_BUFFER_MINUTES = 180;

export interface HubPair {
  hub: string;
  home: ConnectLeg;
  away: ConnectLeg;
}

/** Escolhe a soma mais barata em que a segunda passagem sai depois da primeira, na ida e na volta. */
export function assembleSelfConnect(
  origin: string,
  destination: string,
  pairs: readonly HubPair[],
  fetchedAt: string,
): FlightOffer | null {
  const from = origin.trim().toUpperCase();
  const to = destination.trim().toUpperCase();
  let best: FlightOffer | null = null;
  for (const pair of pairs) {
    const offer = combine(from, to, pair, fetchedAt);
    if (!offer) continue;
    if (!best || offer.price < best.price) best = offer;
  }
  return best;
}

export function legFromOffer(offer: FlightOffer): ConnectLeg | null {
  if (!offer.returnAt || offer.selfConnect) return null;
  return {
    origin: offer.origin,
    destination: offer.destination,
    originAirport: offer.originAirport,
    destinationAirport: offer.destinationAirport,
    price: offer.price,
    currency: offer.currency,
    airline: offer.airline,
    flightNumber: offer.flightNumber,
    departureAt: offer.departureAt,
    returnAt: offer.returnAt,
    transfers: offer.transfers,
    returnTransfers: offer.returnTransfers,
    durationToMinutes: offer.durationToMinutes ?? null,
    durationBackMinutes: offer.durationBackMinutes ?? null,
    link: offer.link,
    foundAt: priceFoundAt(offer),
  };
}

/** Pernas recentes da mesma cidade, sem contar uma montagem que já é duas passagens. */
export function freshLegs(
  stored: readonly FlightOffer[],
  origin: string,
  destination: string,
  now: string,
  freshForMs: number,
): FlightOffer[] {
  if (freshForMs <= 0) return [];
  const from = cityCode(origin);
  const to = cityCode(destination);
  const matches = stored.filter((offer) =>
    !offer.selfConnect
    && cityCode(offer.origin) === from
    && cityCode(offer.destination) === to
    && Boolean(offer.returnAt),
  );
  if (matches.length === 0) return [];
  const newest = matches.reduce((best, offer) => (offer.fetchedAt > best ? offer.fetchedAt : best), '');
  const age = Date.parse(now) - Date.parse(newest);
  if (!Number.isFinite(age) || age >= freshForMs) return [];
  return matches.map((offer) => ({ ...offer }));
}

export function selfConnectWarning(hubCity: string): string {
  return `Duas passagens separadas, com escala em ${hubCity}. Um atraso na primeira não segura a segunda.`;
}

function combine(origin: string, destination: string, pair: HubPair, fetchedAt: string): FlightOffer | null {
  const hub = cityCode(pair.hub);
  const home = pair.home;
  const away = pair.away;
  if (!samePlace(home.origin, origin) || !samePlace(home.destination, hub)) return null;
  if (!samePlace(away.origin, hub) || !samePlace(away.destination, destination)) return null;
  if (samePlace(hub, origin) || samePlace(hub, destination)) return null;
  if (home.currency.toUpperCase() !== away.currency.toUpperCase()) return null;
  if (!connects(home.departureAt, home.durationToMinutes, away.departureAt)) return null;
  if (!connects(away.returnAt, away.durationBackMinutes, home.returnAt)) return null;
  const price = roundMoney(home.price + away.price);
  const selfConnect: SelfConnect = { hub, home, away };
  return {
    id: ['self', origin, destination, hub, home.departureAt, away.departureAt, String(price)].join('|'),
    origin,
    destination,
    originAirport: home.originAirport || home.origin,
    destinationAirport: away.destinationAirport || away.destination,
    price,
    currency: home.currency || 'BRL',
    airline: '',
    flightNumber: '',
    departureAt: home.departureAt,
    returnAt: home.returnAt,
    transfers: home.transfers + away.transfers + 1,
    returnTransfers: home.returnTransfers + away.returnTransfers + 1,
    link: away.link || home.link,
    foundAt: laterStamp(home.foundAt, away.foundAt),
    durationToMinutes: addMinutes(home.durationToMinutes, away.durationToMinutes),
    durationBackMinutes: addMinutes(away.durationBackMinutes, home.durationBackMinutes),
    fetchedAt,
    isBargain: false,
    referencePrice: null,
    gapRatio: null,
    selfConnect,
  };
}

function connects(departureAt: string, durationMinutes: number | null, nextDepartureAt: string): boolean {
  if (durationMinutes !== null && durationMinutes > 0) {
    const left = Date.parse(departureAt);
    const right = Date.parse(nextDepartureAt);
    if (Number.isNaN(left) || Number.isNaN(right)) return false;
    const arrival = left + durationMinutes * 60_000;
    return right >= arrival + SELF_CONNECT_BUFFER_MINUTES * 60_000;
  }
  const firstDay = calendarDay(departureAt);
  const secondDay = calendarDay(nextDepartureAt);
  return firstDay !== '' && secondDay !== '' && secondDay > firstDay;
}

function samePlace(left: string, right: string): boolean {
  return cityCode(left) === cityCode(right);
}

function addMinutes(left: number | null, right: number | null): number | null {
  if (left === null || right === null) return null;
  return left + right;
}

function laterStamp(left: string | null, right: string | null): string | null {
  if (left && right) return left > right ? left : right;
  return left ?? right;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

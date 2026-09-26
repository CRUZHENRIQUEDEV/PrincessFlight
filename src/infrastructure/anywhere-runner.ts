// Versão: 1.1
import { freshOriginOffers } from '../domain/known-offers';
import { mergeOffers } from '../domain/offer-archive';
import { toFlightOffer } from '../domain/offer';
import type { FlightOffer } from '../domain/types';
import type { FlightPriceProvider } from './travelpayouts-client';

export interface AnywhereRoundOptions {
  origin: string;
  token: string;
  provider: FlightPriceProvider;
  signal: AbortSignal;
  now: () => string;
  knownOffers?: () => readonly FlightOffer[];
  freshForMs?: number;
}

/** Uma chamada: o menor preço de ida e volta de cada destino já guardado no cache. */
export async function runAnywhereRound(options: AnywhereRoundOptions): Promise<FlightOffer[]> {
  const provider = options.provider;
  if (!provider.searchAnywhere) return [];
  const tickets = await provider.searchAnywhere({
    token: options.token,
    origin: options.origin,
    signal: options.signal,
  });
  const remote = tickets.map((ticket) => toFlightOffer(ticket, options.now()));
  const local = freshOriginOffers(options.knownOffers?.() ?? [], options.origin, options.now(), options.freshForMs ?? 0);
  return mergeOffers(local, remote);
}

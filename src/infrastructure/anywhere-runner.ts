// Versão: 1.0
import { toFlightOffer } from '../domain/offer';
import type { FlightOffer } from '../domain/types';
import type { FlightPriceProvider } from './travelpayouts-client';

export interface AnywhereRoundOptions {
  origin: string;
  token: string;
  provider: FlightPriceProvider;
  signal: AbortSignal;
  now: () => string;
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
  return tickets.map((ticket) => toFlightOffer(ticket, options.now()));
}

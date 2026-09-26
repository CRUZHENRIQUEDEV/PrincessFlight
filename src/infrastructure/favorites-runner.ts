// Versão: 1.3
import { freshRouteOffers } from '../domain/known-offers';
import { toFlightOffer } from '../domain/offer';
import type { FlightOffer, RawTicket } from '../domain/types';
import { cacheCityCode, type FlightPriceProvider } from './travelpayouts-client';

export interface FavoriteProgress {
  destination: string;
  completedCalls: number;
  totalCalls: number;
  ticketCount: number;
  reused: boolean;
}

export interface FavoriteRoundOptions {
  origin: string;
  destinations: readonly string[];
  token: string;
  provider: FlightPriceProvider;
  signal: AbortSignal;
  sleep: (milliseconds: number, signal: AbortSignal) => Promise<void>;
  delaySeconds: number;
  now: () => string;
  knownOffers?: () => readonly FlightOffer[];
  freshForMs?: number;
  onProgress: (done: number, total: number, destination: string) => void;
  onRoute: (progress: FavoriteProgress) => void;
  onBatch: (offers: FlightOffer[]) => void;
}

export async function runFavoriteRound(options: FavoriteRoundOptions): Promise<FlightOffer[]> {
  if (!options.provider.searchCheapest) throw new Error('Consulta de menor preço indisponível.');
  const found: FlightOffer[] = [];
  const total = options.destinations.length;
  let apiCalls = 0;
  for (let index = 0; index < total; index += 1) {
    if (options.signal.aborted) throw new DOMException('A busca foi interrompida.', 'AbortError');
    const destination = options.destinations[index].toUpperCase();
    options.onProgress(index, total, destination);
    const local = freshRouteOffers(
      options.knownOffers?.() ?? [],
      options.origin,
      destination,
      options.now(),
      options.freshForMs ?? 0,
    );
    const batch = local.length > 0 ? local : await readFromApi(options, destination, apiCalls);
    if (local.length === 0) apiCalls += 1;
    found.push(...batch);
    options.onRoute({
      destination,
      completedCalls: index + 1,
      totalCalls: total,
      ticketCount: batch.length,
      reused: local.length > 0,
    });
    if (batch.length > 0) options.onBatch(batch);
  }
  return found;
}

async function readFromApi(
  options: FavoriteRoundOptions,
  destination: string,
  apiCalls: number,
): Promise<FlightOffer[]> {
  if (apiCalls > 0) await options.sleep(Math.max(2, options.delaySeconds) * 1000, options.signal);
  const ticket = await readCheapest(options, destination);
  return ticket ? [toFlightOffer(ticket, options.now())] : [];
}

async function readCheapest(options: FavoriteRoundOptions, destination: string): Promise<RawTicket | null> {
  const provider = options.provider;
  if (!provider.searchCheapest) return null;
  const query = {
    token: options.token,
    origin: options.origin,
    destination,
    signal: options.signal,
  };
  const direct = await provider.searchCheapest(query);
  if (direct) return direct;
  const city = cacheCityCode(destination);
  if (city === destination) return null;
  await options.sleep(Math.max(2, options.delaySeconds) * 1000, options.signal);
  const pooled = await provider.searchCheapest({ ...query, destination: city });
  if (!pooled) return null;
  return { ...pooled, destination };
}

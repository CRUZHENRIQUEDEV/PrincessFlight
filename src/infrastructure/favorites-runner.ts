// Versão: 1.2
import { toFlightOffer } from '../domain/offer';
import type { FlightOffer, RawTicket } from '../domain/types';
import { cacheCityCode, type FlightPriceProvider } from './travelpayouts-client';

export interface FavoriteProgress {
  destination: string;
  completedCalls: number;
  totalCalls: number;
  ticketCount: number;
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
  onProgress: (done: number, total: number, destination: string) => void;
  onRoute: (progress: FavoriteProgress) => void;
  onBatch: (offers: FlightOffer[]) => void;
}

export async function runFavoriteRound(options: FavoriteRoundOptions): Promise<FlightOffer[]> {
  if (!options.provider.searchCheapest) throw new Error('Consulta de menor preço indisponível.');
  const found: FlightOffer[] = [];
  const total = options.destinations.length;
  for (let index = 0; index < total; index += 1) {
    if (options.signal.aborted) throw new DOMException('A busca foi interrompida.', 'AbortError');
    const destination = options.destinations[index].toUpperCase();
    options.onProgress(index, total, destination);
    if (index > 0) await options.sleep(Math.max(2, options.delaySeconds) * 1000, options.signal);
    const ticket = await readCheapest(options, destination);
    const batch = ticket ? [toFlightOffer(ticket, options.now())] : [];
    found.push(...batch);
    options.onRoute({ destination, completedCalls: index + 1, totalCalls: total, ticketCount: batch.length });
    if (batch.length > 0) options.onBatch(batch);
  }
  return found;
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

// Versão: 1.4
import { connectionHubs, cityCode } from '../domain/connection-hubs';
import { freshRouteOffers } from '../domain/known-offers';
import { toFlightOffer } from '../domain/offer';
import { assembleSelfConnect, freshLegs, legFromOffer, type HubPair } from '../domain/self-connect';
import type { FlightOffer, RawTicket } from '../domain/types';
import { cacheCityCode, type FlightPriceProvider } from './travelpayouts-client';

export interface FavoriteProgress {
  destination: string;
  completedCalls: number;
  totalCalls: number;
  ticketCount: number;
  reused: boolean;
  via: string | null;
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
  onProgress: (done: number, total: number, destination: string, hub?: string) => void;
  onRoute: (progress: FavoriteProgress) => void;
  onBatch: (offers: FlightOffer[]) => void;
}

export async function runFavoriteRound(options: FavoriteRoundOptions): Promise<FlightOffer[]> {
  if (!options.provider.searchCheapest) throw new Error('Consulta de menor preço indisponível.');
  const found: FlightOffer[] = [];
  const total = options.destinations.length;
  const legCache = new Map<string, FlightOffer[]>();
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
    let batch = local;
    let reused = local.length > 0;
    if (batch.length === 0) {
      batch = await readFromApi(options, destination, apiCalls);
      apiCalls += 1;
      reused = false;
    }
    let via: string | null = null;
    if (batch.length === 0) {
      const built = await assembleFromHubs(options, destination, index, legCache);
      if (built) {
        batch = [built];
        via = built.selfConnect?.hub ?? null;
      }
    }
    found.push(...batch);
    options.onRoute({
      destination,
      completedCalls: index + 1,
      totalCalls: total,
      ticketCount: batch.length,
      reused,
      via,
    });
    if (batch.length > 0) options.onBatch(batch);
  }
  return found;
}

async function assembleFromHubs(
  options: FavoriteRoundOptions,
  destination: string,
  index: number,
  legCache: Map<string, FlightOffer[]>,
): Promise<FlightOffer | null> {
  const pairs: HubPair[] = [];
  for (const hub of connectionHubs(options.origin, destination)) {
    if (options.signal.aborted) throw new DOMException('A busca foi interrompida.', 'AbortError');
    const homes = await legsFor(options, options.origin, hub, index, destination, hub, legCache);
    if (homes.length === 0) continue;
    const aways = await legsFor(options, hub, destination, index, destination, hub, legCache);
    for (const home of homes) {
      for (const away of aways) {
        const homeLeg = legFromOffer(home);
        const awayLeg = legFromOffer(away);
        if (homeLeg && awayLeg) pairs.push({ hub, home: homeLeg, away: awayLeg });
      }
    }
  }
  return assembleSelfConnect(options.origin, destination, pairs, options.now());
}

async function legsFor(
  options: FavoriteRoundOptions,
  origin: string,
  destination: string,
  index: number,
  favorite: string,
  hub: string,
  legCache: Map<string, FlightOffer[]>,
): Promise<FlightOffer[]> {
  const local = freshLegs(
    options.knownOffers?.() ?? [],
    origin,
    destination,
    options.now(),
    options.freshForMs ?? 0,
  );
  if (local.length > 0) return local;
  const key = `${cityCode(origin)}|${cityCode(destination)}`;
  if (legCache.has(key)) return legCache.get(key) ?? [];
  if (!options.provider.searchCheapest) return [];
  await options.sleep(Math.max(2, options.delaySeconds) * 1000, options.signal);
  if (options.signal.aborted) throw new DOMException('A busca foi interrompida.', 'AbortError');
  options.onProgress(index, options.destinations.length, favorite, hub);
  const ticket = await options.provider.searchCheapest({
    token: options.token,
    origin: cityCode(origin),
    destination: cityCode(destination),
    signal: options.signal,
  });
  const offers = ticket?.returnAt ? [toFlightOffer({ ...ticket, origin: cityCode(origin), destination: cityCode(destination) }, options.now())] : [];
  legCache.set(key, offers);
  return offers;
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

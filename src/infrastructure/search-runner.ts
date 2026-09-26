// Versão: 1.4
import { freshRouteOffers } from '../domain/known-offers';
import { toFlightOffer } from '../domain/offer';
import { buildSearchPlan } from '../domain/search-plan';
import type { Airport, FlightOffer, RawTicket, SearchCriteria } from '../domain/types';
import { isAbortError } from './delay';
import { isTravelpayoutsError, type TravelpayoutsErrorCode } from './travelpayouts-error';
import type { FlightPriceProvider } from './travelpayouts-client';

const FATAL: ReadonlySet<TravelpayoutsErrorCode> = new Set(['auth', 'network']);

export interface SearchProgress {
  completedCalls: number;
  totalCalls: number;
  destination: string;
  month: string;
}

export interface RouteError {
  destination: string;
  month: string;
  message: string;
}

export interface RunResult {
  status: 'done' | 'stopped' | 'error';
  offers: FlightOffer[];
  requestCount: number;
  errors: RouteError[];
  message: string | null;
}

export interface RunSearchOptions {
  criteria: SearchCriteria;
  airports: readonly Airport[];
  token: string;
  provider: FlightPriceProvider;
  signal: AbortSignal;
  sleep: (milliseconds: number, signal: AbortSignal) => Promise<void>;
  now: () => string;
  knownOffers?: () => readonly FlightOffer[];
  freshForMs?: number;
  onProgress?: (progress: SearchProgress) => void;
  onBatch?: (offers: FlightOffer[]) => void;
  onRoute?: (report: RouteReport) => void;
}

export interface RouteReport {
  completedCalls: number;
  totalCalls: number;
  destination: string;
  month: string;
  foundNow: number;
  totalOffers: number;
  cheapest: FlightOffer | null;
  error: string | null;
  reused: boolean;
}

interface FetchOutcome {
  kind: 'ok' | 'error' | 'stop';
  status?: 'stopped' | 'error';
  message: string | null;
  reused: boolean;
}

export async function runSearch(options: RunSearchOptions): Promise<RunResult> {
  const plan = buildSearchPlan(options.criteria, options.airports);
  const kept: FlightOffer[] = [];
  const seen = new Set<string>();
  const errors: RouteError[] = [];
  let requestCount = 0;
  const pairs = plan.destinations.flatMap((destination) =>
    plan.months.map((month) => ({ destination: destination.iata, month })),
  );

  for (let index = 0; index < pairs.length; index += 1) {
    if (options.signal.aborted) return finish('stopped', kept, requestCount, errors, null);
    const pair = pairs[index];
    options.onProgress?.({
      completedCalls: index,
      totalCalls: pairs.length,
      destination: pair.destination,
      month: pair.month,
    });
    const before = kept.length;
    const outcome = await fetchPair(options, pair.destination, pair.month, kept, seen);
    if (!outcome.reused) requestCount += 1;
    if (outcome.kind === 'error' && outcome.message) {
      errors.push({ destination: pair.destination, month: pair.month, message: outcome.message });
    }
    options.onRoute?.(routeReport(pair, index + 1, pairs.length, kept, before, outcome));
    options.onBatch?.([...kept]);
    if (outcome.kind === 'stop') return finish(outcome.status ?? 'stopped', kept, requestCount, errors, outcome.message);
    const paused = await pauseBeforeNext(options, index, pairs.length, kept, requestCount, errors, outcome.reused);
    if (paused) return paused;
  }

  const message = errors.length > 0 ? `${errors.length} chamadas falharam.` : null;
  return finish('done', kept, requestCount, errors, message);
}

async function collectTickets(
  options: RunSearchOptions,
  destination: string,
  month: string,
): Promise<RawTicket[]> {
  const query = {
    token: options.token,
    origin: options.criteria.originIata,
    destination,
    month,
    signal: options.signal,
    includeRegularPrices: true,
  };
  const listed = await options.provider.searchRouteMonth(query);
  if (listed.length > 0 || !options.provider.searchCalendarMonth) return listed;
  return options.provider.searchCalendarMonth(query);
}

async function fetchPair(
  options: RunSearchOptions,
  destination: string,
  month: string,
  kept: FlightOffer[],
  seen: Set<string>,
): Promise<FetchOutcome> {
  const local = freshRouteOffers(
    options.knownOffers?.() ?? [],
    options.criteria.originIata,
    destination,
    options.now(),
    options.freshForMs ?? 0,
    month,
  );
  if (local.length > 0) {
    keepNew(local, kept, seen);
    return { kind: 'ok', message: null, reused: true };
  }
  try {
    const tickets = await collectTickets(options, destination, month);
    keepNew(tickets.map((ticket) => toFlightOffer(ticket, options.now())), kept, seen);
    return { kind: 'ok', message: null, reused: false };
  } catch (error) {
    return outcomeFromError(error);
  }
}

function keepNew(offers: readonly FlightOffer[], kept: FlightOffer[], seen: Set<string>): void {
  for (const offer of offers) {
    if (seen.has(offer.id)) continue;
    seen.add(offer.id);
    kept.push(offer);
  }
}

function outcomeFromError(error: unknown): FetchOutcome {
  if (isAbortError(error)) return { kind: 'stop', status: 'stopped', message: null, reused: false };
  if (isTravelpayoutsError(error) && FATAL.has(error.code)) {
    return { kind: 'stop', status: 'error', message: error.message, reused: false };
  }
  const message = isTravelpayoutsError(error) ? error.message : 'Falha ao consultar esta rota.';
  return { kind: 'error', message, reused: false };
}

async function pauseBeforeNext(
  options: RunSearchOptions,
  index: number,
  total: number,
  kept: FlightOffer[],
  requestCount: number,
  errors: RouteError[],
  reused: boolean,
): Promise<RunResult | null> {
  if (reused || index >= total - 1) return null;
  try {
    await options.sleep(options.criteria.delayBetweenCallsSeconds * 1000, options.signal);
    return null;
  } catch (error) {
    if (isAbortError(error)) return finish('stopped', kept, requestCount, errors, null);
    throw error;
  }
}

function routeReport(
  pair: { destination: string; month: string },
  completedCalls: number,
  totalCalls: number,
  kept: readonly FlightOffer[],
  before: number,
  outcome: FetchOutcome,
): RouteReport {
  const added = kept.slice(before);
  return {
    completedCalls,
    totalCalls,
    destination: pair.destination,
    month: pair.month,
    foundNow: added.length,
    totalOffers: kept.length,
    cheapest: cheapestOf(added),
    error: outcome.kind === 'error' ? outcome.message : null,
    reused: outcome.reused,
  };
}

function cheapestOf(offers: readonly FlightOffer[]): FlightOffer | null {
  return offers.reduce<FlightOffer | null>((best, offer) => {
    if (!best || offer.price < best.price) return offer;
    return best;
  }, null);
}

function finish(
  status: RunResult['status'],
  kept: FlightOffer[],
  requestCount: number,
  errors: RouteError[],
  message: string | null,
): RunResult {
  return { status, offers: [...kept], requestCount, errors: [...errors], message };
}

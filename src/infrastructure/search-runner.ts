// Versão: 1.0
import { toFlightOffer } from '../domain/offer';
import { buildSearchPlan } from '../domain/search-plan';
import type { Airport, FlightOffer, SearchCriteria } from '../domain/types';
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
  onProgress?: (progress: SearchProgress) => void;
  onBatch?: (offers: FlightOffer[]) => void;
}

interface FetchOutcome {
  kind: 'ok' | 'error' | 'stop';
  status?: 'stopped' | 'error';
  message: string | null;
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
    const outcome = await fetchPair(options, pair.destination, pair.month, kept, seen);
    requestCount += 1;
    if (outcome.kind === 'error' && outcome.message) {
      errors.push({ destination: pair.destination, month: pair.month, message: outcome.message });
    }
    options.onBatch?.([...kept]);
    if (outcome.kind === 'stop') return finish(outcome.status ?? 'stopped', kept, requestCount, errors, outcome.message);
    const paused = await pauseBeforeNext(options, index, pairs.length, kept, requestCount, errors);
    if (paused) return paused;
  }

  const message = errors.length > 0 ? `${errors.length} chamadas falharam.` : null;
  return finish('done', kept, requestCount, errors, message);
}

async function fetchPair(
  options: RunSearchOptions,
  destination: string,
  month: string,
  kept: FlightOffer[],
  seen: Set<string>,
): Promise<FetchOutcome> {
  try {
    const tickets = await options.provider.searchRouteMonth({
      token: options.token,
      origin: options.criteria.originIata,
      destination,
      month,
      signal: options.signal,
    });
    for (const ticket of tickets) {
      const offer = toFlightOffer(ticket, options.now());
      if (seen.has(offer.id)) continue;
      seen.add(offer.id);
      kept.push(offer);
    }
    return { kind: 'ok', message: null };
  } catch (error) {
    return outcomeFromError(error);
  }
}

function outcomeFromError(error: unknown): FetchOutcome {
  if (isAbortError(error)) return { kind: 'stop', status: 'stopped', message: null };
  if (isTravelpayoutsError(error) && FATAL.has(error.code)) {
    return { kind: 'stop', status: 'error', message: error.message };
  }
  const message = isTravelpayoutsError(error) ? error.message : 'Falha ao consultar esta rota.';
  return { kind: 'error', message };
}

async function pauseBeforeNext(
  options: RunSearchOptions,
  index: number,
  total: number,
  kept: FlightOffer[],
  requestCount: number,
  errors: RouteError[],
): Promise<RunResult | null> {
  if (index >= total - 1) return null;
  try {
    await options.sleep(options.criteria.delayBetweenCallsSeconds * 1000, options.signal);
    return null;
  } catch (error) {
    if (isAbortError(error)) return finish('stopped', kept, requestCount, errors, null);
    throw error;
  }
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

// Versão: 1.2
import { AIRPORTS } from '../data/airports';
import { mergeOffers } from '../domain/offer-archive';
import { validateSearch } from '../domain/criteria';
import { refreshEveryMinutes, type SavedSearch } from '../domain/saved-search';
import { buildSearchPlan } from '../domain/search-plan';
import type { FlightOffer } from '../domain/types';
import { delay, isAbortError } from '../infrastructure/delay';
import { runSearch, type RouteReport } from '../infrastructure/search-runner';
import type { FlightPriceProvider } from '../infrastructure/travelpayouts-client';
import { describeConsulting, describeRoute } from './search-feedback';

export interface SearchUpdate {
  offers?: FlightOffer[];
  lastStatus?: string;
  running?: boolean;
  keepAlive?: boolean;
  progress?: { done: number; total: number } | null;
}

export interface SearchDeskDeps {
  provider: FlightPriceProvider;
  readToken(): string;
  getSearch(id: string): SavedSearch | undefined;
  patch(id: string, update: SearchUpdate): void;
  isActive(id: string): boolean;
  setStatus(message: string, isError: boolean): void;
  setFresh(ids: readonly string[]): void;
  note(message: string): void;
  onDeals(search: SavedSearch, offers: readonly FlightOffer[]): void;
}

export interface SearchDesk {
  run(id: string, mode: 'once' | 'monitor'): Promise<void>;
  stop(id: string): void;
  isRunning(id: string): boolean;
}

export function createSearchDesk(deps: SearchDeskDeps): SearchDesk {
  const controllers = new Map<string, AbortController>();
  const generations = new Map<string, number>();

  return {
    isRunning: (id) => controllers.has(id),
    stop(id): void {
      controllers.get(id)?.abort();
    },
    run: (id, mode) => start(deps, controllers, generations, id, mode),
  };
}

async function start(
  deps: SearchDeskDeps,
  controllers: Map<string, AbortController>,
  generations: Map<string, number>,
  id: string,
  mode: 'once' | 'monitor',
): Promise<void> {
  const search = deps.getSearch(id);
  if (!search) return;
  const refusal = refusalMessage(search, deps.readToken());
  if (refusal) {
    deps.patch(id, { lastStatus: refusal, running: false });
    if (deps.isActive(id)) deps.setStatus(refusal, true);
    return;
  }
  const generation = (generations.get(id) ?? 0) + 1;
  generations.set(id, generation);
  const stale = () => generations.get(id) !== generation;
  controllers.get(id)?.abort();
  const controller = new AbortController();
  controllers.set(id, controller);
  announceStart(deps, id, mode);
  try {
    await runRounds(deps, id, mode, controller.signal, stale);
  } catch (error) {
    if (stale()) return;
    reportFailure(deps, id, error);
  } finally {
    if (controllers.get(id) === controller) controllers.delete(id);
    if (!stale() && deps.getSearch(id)?.running) deps.patch(id, { running: false, progress: null });
  }
}

function refusalMessage(search: SavedSearch, token: string): string | null {
  const plan = buildSearchPlan(search.criteria, AIRPORTS);
  const error = validateSearch(search.criteria, plan, token);
  return error;
}

function announceStart(deps: SearchDeskDeps, id: string, mode: 'once' | 'monitor'): void {
  const search = deps.getSearch(id);
  if (!search) return;
  const plan = buildSearchPlan(search.criteria, AIRPORTS);
  const started = `Busca iniciada · ${plan.destinations.length} destinos · ${plan.callCount} chamadas.`;
  deps.patch(id, {
    running: true,
    keepAlive: mode === 'monitor',
    progress: { done: 0, total: plan.callCount },
    lastStatus: started,
  });
  if (!deps.isActive(id)) return;
  deps.setFresh([]);
  deps.setStatus(started, false);
  deps.note(started);
}

function reportFailure(deps: SearchDeskDeps, id: string, error: unknown): void {
  const aborted = isAbortError(error);
  const message = aborted ? 'Busca interrompida.' : error instanceof Error ? error.message : 'Falha na busca.';
  deps.patch(id, { lastStatus: message, running: false, progress: null });
  if (deps.isActive(id)) deps.setStatus(message, !aborted);
}

async function runRounds(
  deps: SearchDeskDeps,
  id: string,
  mode: 'once' | 'monitor',
  signal: AbortSignal,
  stale: () => boolean,
): Promise<void> {
  do {
    const search = deps.getSearch(id);
    if (!search || stale()) return;
    const outcome = await oneRound(deps, search, signal, stale, mode === 'once');
    if (stale() || outcome === 'stop' || mode === 'once') return;
    await delay(refreshEveryMinutes(search.criteria.repeatEveryMinutes) * 60_000, signal);
  } while (!signal.aborted);
}

async function oneRound(
  deps: SearchDeskDeps,
  search: SavedSearch,
  signal: AbortSignal,
  stale: () => boolean,
  closing: boolean,
): Promise<'continue' | 'stop'> {
  const plan = buildSearchPlan(search.criteria, AIRPORTS);
  const error = validateSearch(search.criteria, plan, deps.readToken());
  if (error) return halt(deps, search.id, error, true, stale);
  const result = await runSearch({
    criteria: search.criteria,
    airports: AIRPORTS,
    token: deps.readToken(),
    provider: deps.provider,
    signal,
    sleep: delay,
    now: () => new Date().toISOString(),
    onProgress: (progress) => {
      if (stale()) return;
      showConsulting(deps, search.id, progress.completedCalls, progress.totalCalls, progress.destination, progress.month);
    },
    onRoute: (report) => {
      if (stale()) return;
      showRoute(deps, search.id, report);
    },
    onBatch: (batch) => {
      if (stale()) return;
      showBatch(deps, search.id, batch);
    },
  });
  if (stale()) return 'stop';
  if (result.status === 'error') return halt(deps, search.id, result.message ?? 'Falha na busca.', true, stale);
  if (result.status === 'stopped' || signal.aborted) return halt(deps, search.id, 'Busca interrompida.', false, stale);
  conclude(deps, search, result.offers, result.message, closing);
  return 'continue';
}

function halt(
  deps: SearchDeskDeps,
  id: string,
  message: string,
  isError: boolean,
  stale: () => boolean,
): 'stop' {
  if (stale()) return 'stop';
  deps.patch(id, { lastStatus: message, running: false, progress: null });
  if (deps.isActive(id)) deps.setStatus(message, isError);
  return 'stop';
}

function conclude(
  deps: SearchDeskDeps,
  search: SavedSearch,
  offers: FlightOffer[],
  message: string | null,
  closing: boolean,
): void {
  const failNote = message ? ` ${message}` : '';
  const minutes = refreshEveryMinutes(search.criteria.repeatEveryMinutes);
  const text = closing
    ? `Busca concluída · ${offers.length} ofertas.${failNote}`
    : `Rodada concluída · ${offers.length} ofertas.${failNote} Próxima em ${minutes} min.`;
  const stored = deps.getSearch(search.id)?.offers ?? [];
  const merged = mergeOffers(stored, offers);
  deps.patch(search.id, { offers: merged, lastStatus: text });
  if (!deps.isActive(search.id)) return;
  deps.setStatus(text, false);
  deps.note(text);
}

function showConsulting(
  deps: SearchDeskDeps,
  id: string,
  done: number,
  total: number,
  destination: string,
  month: string,
): void {
  const airport = AIRPORTS.find((item) => item.iata === destination);
  const line = describeConsulting({ completedCalls: done, totalCalls: total, city: airport?.city ?? destination, month });
  deps.patch(id, { progress: { done, total }, lastStatus: line });
  if (deps.isActive(id)) deps.setStatus(line, false);
}

function showRoute(deps: SearchDeskDeps, id: string, report: RouteReport): void {
  const airport = AIRPORTS.find((item) => item.iata === report.destination);
  const line = describeRoute({ ...report, city: airport?.city ?? report.destination });
  deps.patch(id, { progress: { done: report.completedCalls, total: report.totalCalls }, lastStatus: line });
  if (!deps.isActive(id)) return;
  deps.setStatus(line, false);
  deps.note(line);
}

function showBatch(deps: SearchDeskDeps, id: string, batch: FlightOffer[]): void {
  const stored = deps.getSearch(id)?.offers ?? [];
  const fresh = batch.filter((offer) => !stored.some((item) => item.id === offer.id)).map((offer) => offer.id);
  if (deps.isActive(id) && fresh.length > 0) deps.setFresh(fresh);
  const merged = mergeOffers(stored, batch);
  deps.patch(id, { offers: merged });
  const search = deps.getSearch(id);
  if (search) deps.onDeals(search, batch);
}

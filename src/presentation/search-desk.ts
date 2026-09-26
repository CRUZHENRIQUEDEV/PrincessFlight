// Versão: 1.6
import { AIRPORTS } from '../data/airports';
import { mergeOffers } from '../domain/offer-archive';
import { validateSearch } from '../domain/criteria';
import { refreshEveryMinutes, rescheduleRound, type SavedSearch } from '../domain/saved-search';
import { buildSearchPlan } from '../domain/search-plan';
import type { FlightOffer } from '../domain/types';
import { delay, isAbortError } from '../infrastructure/delay';
import { runAnywhereRound } from '../infrastructure/anywhere-runner';
import { runFavoriteRound } from '../infrastructure/favorites-runner';
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
  if (search.mode === 'favorites' && search.favoriteDestinations.length === 0) {
    const message = 'Adicione um destino favorito. A busca pega a ida e a volta mais baratas, em qualquer data.';
    deps.patch(id, { lastStatus: message, running: false });
    if (deps.isActive(id)) deps.setStatus(message, false);
    return;
  }
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
  if (search.mode === 'favorites' || search.mode === 'anywhere') {
    if (!token.trim()) return 'Cole o token da Travelpayouts. Ele fica salvo só neste navegador.';
    if (!search.criteria.originIata) return 'Escolha a origem.';
    return null;
  }
  const plan = buildSearchPlan(search.criteria, AIRPORTS);
  return validateSearch(search.criteria, plan, token);
}

function announceStart(deps: SearchDeskDeps, id: string, mode: 'once' | 'monitor'): void {
  const search = deps.getSearch(id);
  if (!search) return;
  if (search.mode === 'favorites') {
    const total = search.favoriteDestinations.length;
    publishStart(deps, id, mode, total, `Busca iniciada · ${total} destinos favoritos · ${total} chamadas.`);
    return;
  }
  if (search.mode === 'anywhere') {
    publishStart(deps, id, mode, 1, 'Busca iniciada · qualquer destino · qualquer data · 1 chamada.');
    return;
  }
  const plan = buildSearchPlan(search.criteria, AIRPORTS);
  publishStart(deps, id, mode, plan.callCount, `Busca iniciada · ${plan.destinations.length} destinos · ${plan.callCount} chamadas.`);
}

function publishStart(
  deps: SearchDeskDeps,
  id: string,
  mode: 'once' | 'monitor',
  total: number,
  started: string,
): void {
  deps.patch(id, {
    running: true,
    keepAlive: mode === 'monitor',
    progress: { done: 0, total },
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
    await waitForNextRound(deps, id, signal);
  } while (!signal.aborted);
}

async function oneRound(
  deps: SearchDeskDeps,
  search: SavedSearch,
  signal: AbortSignal,
  stale: () => boolean,
  closing: boolean,
): Promise<'continue' | 'stop'> {
  if (search.mode === 'favorites') return favoriteRound(deps, search, signal, stale, closing);
  if (search.mode === 'anywhere') return anywhereRound(deps, search, signal, stale, closing);
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

async function anywhereRound(
  deps: SearchDeskDeps,
  search: SavedSearch,
  signal: AbortSignal,
  stale: () => boolean,
  closing: boolean,
): Promise<'continue' | 'stop'> {
  const line = 'Consultando o cache · qualquer destino · qualquer data';
  deps.patch(search.id, { progress: { done: 0, total: 1 }, lastStatus: line });
  if (deps.isActive(search.id)) deps.setStatus(line, false);
  try {
    const found = await runAnywhereRound({
      origin: search.criteria.originIata,
      token: deps.readToken(),
      provider: deps.provider,
      signal,
      now: () => new Date().toISOString(),
    });
    if (stale()) return 'stop';
    if (signal.aborted) return halt(deps, search.id, 'Busca interrompida.', false, stale);
    const note = found.length === 0
      ? '1 de 1 · qualquer destino · nenhum preço guardado; a API só devolve tarifas que alguém já buscou'
      : `1 de 1 · qualquer destino · ${found.length} preços no cache`;
    deps.note(note);
    conclude(deps, search, found, null, closing);
    return 'continue';
  } catch (error) {
    if (stale()) return 'stop';
    if (isAbortError(error)) return halt(deps, search.id, 'Busca interrompida.', false, stale);
    const message = error instanceof Error ? error.message : 'Falha na busca.';
    return halt(deps, search.id, message, true, stale);
  }
}

function favoriteRound(
  deps: SearchDeskDeps,
  search: SavedSearch,
  signal: AbortSignal,
  stale: () => boolean,
  closing: boolean,
): Promise<'continue' | 'stop'> {
  return runFavoriteRound({
    origin: search.criteria.originIata,
    destinations: search.favoriteDestinations,
    token: deps.readToken(),
    provider: deps.provider,
    signal,
    sleep: delay,
    delaySeconds: search.criteria.delayBetweenCallsSeconds,
    now: () => new Date().toISOString(),
    onProgress: (done, total, destination) => {
      if (stale()) return;
      showConsulting(deps, search.id, done, total, destination, 'qualquer data');
    },
    onRoute: (progress) => {
      if (stale()) return;
      const airport = AIRPORTS.find((item) => item.iata === progress.destination);
      const city = airport?.city ?? progress.destination;
      const found = progress.ticketCount === 0
        ? 'nenhum preço guardado; a API só devolve tarifas que alguém já buscou'
        : 'menor preço encontrado';
      const line = `${progress.completedCalls} de ${progress.totalCalls} · ${city} · qualquer data · ${found}`;
      deps.patch(search.id, { progress: { done: progress.completedCalls, total: progress.totalCalls }, lastStatus: line });
      if (!deps.isActive(search.id)) return;
      deps.setStatus(line, false);
      deps.note(line);
    },
    onBatch: (batch) => {
      if (stale()) return;
      showBatch(deps, search.id, batch);
    },
  }).then((found) => {
    if (stale()) return 'stop' as const;
    if (signal.aborted) return halt(deps, search.id, 'Busca interrompida.', false, stale);
    conclude(deps, search, found, null, closing);
    return 'continue' as const;
  }).catch((error: unknown) => {
    if (stale()) return 'stop' as const;
    if (isAbortError(error)) return halt(deps, search.id, 'Busca interrompida.', false, stale);
    const message = error instanceof Error ? error.message : 'Falha na busca.';
    return halt(deps, search.id, message, true, stale);
  });
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
  const current = deps.getSearch(search.id) ?? search;
  const minutes = refreshEveryMinutes(current.criteria.repeatEveryMinutes);
  const count = offers.length === 1 ? '1 oferta' : `${offers.length} ofertas`;
  const text = closing
    ? `Busca concluída · ${count}.${failNote}`
    : `Rodada concluída · ${count}.${failNote} Próxima em ${minutes} min.`;
  const stored = deps.getSearch(search.id)?.offers ?? [];
  const merged = mergeOffers(stored, offers);
  deps.patch(search.id, { offers: merged, lastStatus: text });
  if (!deps.isActive(search.id)) return;
  deps.setStatus(text, false);
  deps.note(text);
}

const ROUND_CHECK_MS = 1_000;

async function waitForNextRound(deps: SearchDeskDeps, id: string, signal: AbortSignal): Promise<void> {
  let minutes = roundMinutes(deps, id);
  let endsAt = Date.now() + minutes * 60_000;
  while (!signal.aborted) {
    const scheduled = rescheduleRound(Date.now(), endsAt, minutes, roundMinutes(deps, id));
    if (scheduled.minutes !== minutes) {
      minutes = scheduled.minutes;
      endsAt = scheduled.endsAt;
      const text = `Próxima rodada em ${minutes} min.`;
      deps.patch(id, { lastStatus: text });
      if (deps.isActive(id)) deps.setStatus(text, false);
    }
    const left = endsAt - Date.now();
    if (left <= 0) return;
    await delay(Math.min(left, ROUND_CHECK_MS), signal);
  }
}

function roundMinutes(deps: SearchDeskDeps, id: string): number {
  return refreshEveryMinutes(deps.getSearch(id)?.criteria.repeatEveryMinutes ?? 0);
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

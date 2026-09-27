// Versão: 2.0
import { AIRPORTS } from '../data/airports';
import { placeOf } from '../data/places';
import { freshRouteOffers } from '../domain/known-offers';
import { mergeOffers } from '../domain/offer-archive';
import { rollDatesToTomorrow, searchOrigins, validateSearch } from '../domain/criteria';
import { refreshEveryMinutes, rescheduleRound, type SavedSearch } from '../domain/saved-search';
import { buildSearchPlan, countOriginCalls } from '../domain/search-plan';
import type { FlightOffer, SearchCriteria } from '../domain/types';
import { delay, isAbortError } from '../infrastructure/delay';
import { runAnywhereRound } from '../infrastructure/anywhere-runner';
import { runFavoriteRound } from '../infrastructure/favorites-runner';
import { runSearch, type RouteReport } from '../infrastructure/search-runner';
import type { FlightPriceProvider } from '../infrastructure/travelpayouts-client';
import { describeConsulting, describeRoute } from './search-feedback';

export interface SearchUpdate {
  offers?: FlightOffer[];
  criteria?: SearchCriteria;
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
  knownOffers?: () => readonly FlightOffer[];
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
  const loaded = deps.getSearch(id);
  if (!loaded) return;
  const search = withFutureDates(loaded);
  if (search !== loaded) deps.patch(id, { criteria: search.criteria });
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

function withFutureDates(search: SavedSearch): SavedSearch {
  if (search.mode !== 'filters') return search;
  const dates = rollDatesToTomorrow(search.criteria.departureStart, search.criteria.departureEnd);
  if (dates.departureStart === search.criteria.departureStart && dates.departureEnd === search.criteria.departureEnd) {
    return search;
  }
  return { ...search, criteria: { ...search.criteria, ...dates } };
}

function refusalMessage(search: SavedSearch, token: string): string | null {
  if (search.mode === 'favorites' || search.mode === 'anywhere') {
    if (!token.trim()) return 'Cole o token da Travelpayouts. Ele fica salvo só neste navegador.';
    if (searchOrigins(search.criteria).length === 0) return 'Escolha a origem.';
    return null;
  }
  const plan = buildSearchPlan(search.criteria, AIRPORTS);
  return validateSearch(search.criteria, plan, token);
}

function announceStart(deps: SearchDeskDeps, id: string, mode: 'once' | 'monitor'): void {
  const search = deps.getSearch(id);
  if (!search) return;
  const known = deps.knownOffers?.() ?? [];
  const now = new Date().toISOString();
  const origins = searchOrigins(search.criteria);
  if (search.mode === 'favorites') {
    const pairs = favoritePairs(search);
    const saved = countFreshFavorites(search, known, now);
    publishStart(deps, id, mode, pairs, startLine(pairs, pairs, saved, 'trechos de favoritos'));
    return;
  }
  if (search.mode === 'anywhere') {
    const calls = Math.max(1, origins.length);
    publishStart(deps, id, mode, calls, `Busca iniciada · qualquer destino · qualquer data · ${calls} ${calls === 1 ? 'chamada' : 'chamadas'}.`);
    return;
  }
  const counted = countOriginCalls(search.criteria, AIRPORTS);
  const saved = countFreshPairs(search, known, now);
  const label = origins.length > 1 ? 'origens' : 'destinos';
  const amount = origins.length > 1 ? origins.length : counted.destinations;
  publishStart(deps, id, mode, counted.calls, startLine(amount, counted.calls, saved, label));
}

function favoriteFound(ticketCount: number, reused: boolean, via: string | null): string {
  if (ticketCount === 0) return 'nenhum preço guardado; a API só devolve tarifas que alguém já buscou';
  if (via) return `duas passagens separadas, escala em ${placeName(via)}`;
  if (reused) return 'preço já salvo neste navegador';
  return 'menor preço encontrado';
}

function placeName(code: string): string {
  return AIRPORTS.find((item) => item.iata === code)?.city ?? placeOf(code)?.city ?? code;
}

function startLine(destinations: number, calls: number, saved: number, label: string): string {
  if (saved <= 0) return `Busca iniciada · ${destinations} ${label} · ${calls} chamadas.`;
  const kept = saved === 1 ? '1 já salva neste navegador' : `${saved} já salvas neste navegador`;
  return `Busca iniciada · ${destinations} ${label} · ${kept} · ${Math.max(0, calls - saved)} chamadas.`;
}

function favoritePairs(search: SavedSearch): number {
  return searchOrigins(search.criteria)
    .reduce((total, origin) => total + search.favoriteDestinations.filter((code) => code !== origin).length, 0);
}

function countFreshFavorites(search: SavedSearch, known: readonly FlightOffer[], now: string): number {
  const freshForMs = refreshEveryMinutes(search.criteria.repeatEveryMinutes) * 60_000;
  return searchOrigins(search.criteria).reduce((total, origin) => total + search.favoriteDestinations.filter((destination) =>
    destination !== origin && freshRouteOffers(known, origin, destination, now, freshForMs).length > 0,
  ).length, 0);
}

function countFreshPairs(search: SavedSearch, known: readonly FlightOffer[], now: string): number {
  const freshForMs = refreshEveryMinutes(search.criteria.repeatEveryMinutes) * 60_000;
  return searchOrigins(search.criteria).reduce((total, origin) => {
    const plan = buildSearchPlan({ ...search.criteria, originIata: origin }, AIRPORTS);
    const fresh = plan.destinations.flatMap((airport) => plan.months.filter((month) =>
      freshRouteOffers(known, origin, airport.iata, now, freshForMs, month).length > 0,
    ));
    return total + fresh.length;
  }, 0);
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
  const current = withFutureDates(search);
  if (current !== search) deps.patch(search.id, { criteria: current.criteria });
  const plan = buildSearchPlan(current.criteria, AIRPORTS);
  const error = validateSearch(current.criteria, plan, deps.readToken());
  if (error) return halt(deps, search.id, error, true, stale);
  const origins = searchOrigins(current.criteria);
  const collected: FlightOffer[] = [];
  let note: string | null = null;
  for (let index = 0; index < origins.length; index += 1) {
    if (stale() || signal.aborted) return halt(deps, search.id, 'Busca interrompida.', false, stale);
    const paused = await pauseBetweenOrigins(index, current.criteria.delayBetweenCallsSeconds, signal);
    if (paused === 'stop') return halt(deps, search.id, 'Busca interrompida.', false, stale);
    const origin = origins[index] ?? current.criteria.originIata;
    const result = await runSearch({
      criteria: { ...current.criteria, originIata: origin },
      airports: AIRPORTS,
      token: deps.readToken(),
      provider: deps.provider,
      signal,
      sleep: delay,
      now: () => new Date().toISOString(),
      knownOffers: () => deps.knownOffers?.() ?? [],
      freshForMs: refreshEveryMinutes(search.criteria.repeatEveryMinutes) * 60_000,
      onProgress: (progress) => {
        if (stale()) return;
        showConsulting(deps, search.id, progress.completedCalls, progress.totalCalls, routeCity(origin, progress.destination, origins.length), progress.month);
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
    collected.push(...result.offers);
    if (result.message) note = result.message;
  }
  conclude(deps, search, collected, note, closing);
  return 'continue';
}

async function pauseBetweenOrigins(index: number, seconds: number, signal: AbortSignal): Promise<'stop' | 'go'> {
  if (index === 0) return 'go';
  try {
    await delay(seconds * 1000, signal);
    return 'go';
  } catch (error) {
    if (isAbortError(error)) return 'stop';
    throw error;
  }
}

function routeCity(origin: string, destination: string, originCount: number): string {
  const city = AIRPORTS.find((item) => item.iata === destination)?.city ?? destination;
  if (originCount < 2) return destination;
  return `${placeName(origin)} → ${city}`;
}

async function anywhereRound(
  deps: SearchDeskDeps,
  search: SavedSearch,
  signal: AbortSignal,
  stale: () => boolean,
  closing: boolean,
): Promise<'continue' | 'stop'> {
  const origins = searchOrigins(search.criteria);
  const line = origins.length > 1
    ? `Consultando o cache · ${origins.length} origens · qualquer destino · qualquer data`
    : 'Consultando o cache · qualquer destino · qualquer data';
  deps.patch(search.id, { progress: { done: 0, total: origins.length }, lastStatus: line });
  if (deps.isActive(search.id)) deps.setStatus(line, false);
  try {
    const found: FlightOffer[] = [];
    for (let index = 0; index < origins.length; index += 1) {
      const paused = await pauseBetweenOrigins(index, search.criteria.delayBetweenCallsSeconds, signal);
      if (paused === 'stop') return halt(deps, search.id, 'Busca interrompida.', false, stale);
      const batch = await runAnywhereRound({
        origin: origins[index] ?? search.criteria.originIata,
        token: deps.readToken(),
        provider: deps.provider,
        signal,
        now: () => new Date().toISOString(),
        knownOffers: () => deps.knownOffers?.() ?? [],
        freshForMs: refreshEveryMinutes(search.criteria.repeatEveryMinutes) * 60_000,
      });
      found.push(...batch);
    }
    if (stale()) return 'stop';
    if (signal.aborted) return halt(deps, search.id, 'Busca interrompida.', false, stale);
    const note = found.length === 0
      ? `${origins.length} de ${origins.length} · qualquer destino · nenhum preço guardado; a API só devolve tarifas que alguém já buscou`
      : `${origins.length} de ${origins.length} · qualquer destino · ${found.length} preços no cache`;
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

async function favoriteRound(
  deps: SearchDeskDeps,
  search: SavedSearch,
  signal: AbortSignal,
  stale: () => boolean,
  closing: boolean,
): Promise<'continue' | 'stop'> {
  const origins = searchOrigins(search.criteria);
  const found: FlightOffer[] = [];
  try {
    for (let index = 0; index < origins.length; index += 1) {
      const origin = origins[index] ?? search.criteria.originIata;
      const destinations = search.favoriteDestinations.filter((code) => code !== origin);
      if (destinations.length === 0) continue;
      const paused = await pauseBetweenOrigins(index, search.criteria.delayBetweenCallsSeconds, signal);
      if (paused === 'stop') return halt(deps, search.id, 'Busca interrompida.', false, stale);
      const batch = await runFavoriteRound({
        origin,
        destinations,
        token: deps.readToken(),
        provider: deps.provider,
        signal,
        sleep: delay,
        delaySeconds: search.criteria.delayBetweenCallsSeconds,
        now: () => new Date().toISOString(),
        knownOffers: () => deps.knownOffers?.() ?? [],
        freshForMs: refreshEveryMinutes(search.criteria.repeatEveryMinutes) * 60_000,
        onProgress: (done, total, destination, hub) => {
          if (stale()) return;
          const month = hub ? `qualquer data · escala em ${placeName(hub)}` : 'qualquer data';
          showConsulting(deps, search.id, done, total, routeCity(origin, destination, origins.length), month);
        },
        onRoute: (progress) => {
          if (stale()) return;
          const city = routeCity(origin, progress.destination, origins.length);
          const label = city.includes('→') ? city : (AIRPORTS.find((item) => item.iata === progress.destination)?.city ?? city);
          const text = favoriteFound(progress.ticketCount, progress.reused, progress.via);
          const line = `${progress.completedCalls} de ${progress.totalCalls} · ${label} · qualquer data · ${text}`;
          deps.patch(search.id, { progress: { done: progress.completedCalls, total: progress.totalCalls }, lastStatus: line });
          if (!deps.isActive(search.id)) return;
          deps.setStatus(line, false);
          deps.note(line);
        },
        onBatch: (offers) => {
          if (stale()) return;
          showBatch(deps, search.id, offers);
        },
      });
      found.push(...batch);
    }
  } catch (error) {
    if (stale()) return 'stop';
    if (isAbortError(error)) return halt(deps, search.id, 'Busca interrompida.', false, stale);
    const message = error instanceof Error ? error.message : 'Falha na busca.';
    return halt(deps, search.id, message, true, stale);
  }
  if (stale()) return 'stop';
  if (signal.aborted) return halt(deps, search.id, 'Busca interrompida.', false, stale);
  conclude(deps, search, found, null, closing);
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
  const city = destination.includes('→') ? destination : airport?.city ?? destination;
  const line = describeConsulting({ completedCalls: done, totalCalls: total, city, month });
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

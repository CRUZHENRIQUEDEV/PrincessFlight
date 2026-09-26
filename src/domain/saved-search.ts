// Versão: 1.6
import { createDefaultAlertRules, type AlertRules } from './alert-rules';
import type { FlightOffer, SearchCriteria } from './types';

export const FAVORITES_SEARCH_NAME = 'Destinos favoritos';

export const FAVORITES_EMPTY_STATUS = 'Adicione um destino favorito. A busca pega a ida e a volta mais baratas, em qualquer data.';

export type SearchMode = 'filters' | 'favorites';

export interface SearchProgress {
  done: number;
  total: number;
}

export interface SavedSearch {
  id: string;
  name: string;
  mode: SearchMode;
  favoriteDestinations: string[];
  criteria: SearchCriteria;
  alertRules: AlertRules;
  offers: FlightOffer[];
  notes: string;
  updatedAt: string;
  lastStatus: string;
  running: boolean;
  keepAlive: boolean;
  progress: SearchProgress | null;
}

export function createSavedSearch(
  name: string,
  criteria: SearchCriteria,
  alertRules: AlertRules,
  now: string,
): SavedSearch {
  return {
    id: `search-${crypto.randomUUID()}`,
    name,
    mode: 'filters',
    favoriteDestinations: [],
    criteria: structuredClone(criteria),
    alertRules: structuredClone(alertRules),
    offers: [],
    notes: '',
    updatedAt: now,
    lastStatus: 'Pronta para buscar.',
    running: false,
    keepAlive: false,
    progress: null,
  };
}

export function favoritesCriteria(originIata: string): SearchCriteria {
  return {
    originIata: originIata.trim().toUpperCase() || 'GRU',
    scope: 'nacional',
    regions: [],
    states: [],
    coastalOnly: false,
    departureStart: '',
    departureEnd: '',
    tripLengthDays: null,
    holidayBridgeOnly: false,
    priceMin: null,
    priceMax: null,
    bargainRatio: 0.7,
    airlines: [],
    delayBetweenCallsSeconds: 2,
    repeatEveryMinutes: 0,
    bargainsOnly: false,
    includeRegularPrices: true,
    offerSort: 'price',
  };
}

export function createFavoritesSearch(originIata: string, now: string): SavedSearch {
  const search = createSavedSearch(FAVORITES_SEARCH_NAME, favoritesCriteria(originIata), createDefaultAlertRules(), now);
  return { ...search, mode: 'favorites', lastStatus: FAVORITES_EMPTY_STATUS };
}

export function normalizeSavedSearch(search: SavedSearch): SavedSearch {
  const mode = search.mode === 'favorites' ? 'favorites' : 'filters';
  const codes = Array.isArray(search.favoriteDestinations) ? search.favoriteDestinations : [];
  return {
    ...search,
    mode,
    favoriteDestinations: [...new Set(codes.map((code) => code.trim().toUpperCase()).filter((code) => /^[A-Z]{3}$/.test(code)))],
    notes: typeof search.notes === 'string' ? search.notes : '',
  };
}

/** Garante a pesquisa de favoritos no topo. Não duplica se ela já existe. */
export function ensureFavoritesSearch(
  searches: readonly SavedSearch[],
  originIata: string,
  now: string,
): SavedSearch[] {
  const normalized = searches.map((search) => normalizeSavedSearch(search));
  const favorites = normalized.find((search) => search.mode === 'favorites');
  const rest = normalized.filter((search) => search.mode !== 'favorites');
  if (!favorites) return [createFavoritesSearch(originIata, now), ...rest];
  return [favorites, ...rest];
}

export function withFavoriteDestination(search: SavedSearch, iata: string, included: boolean): SavedSearch {
  const code = iata.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code) || code === search.criteria.originIata) return search;
  const current = search.favoriteDestinations;
  const next = included
    ? [...new Set([...current, code])]
    : current.filter((item) => item !== code);
  return { ...search, favoriteDestinations: next };
}

export function nextSearchName(searches: readonly Pick<SavedSearch, 'name'>[]): string {
  const numbers = searches.map((search) => /^Pesquisa (\d+)$/.exec(search.name)?.[1]).map((value) => Number(value) || 0);
  return `Pesquisa ${Math.max(0, ...numbers) + 1}`;
}

export function withSearch(searches: readonly SavedSearch[], next: SavedSearch): SavedSearch[] {
  const exists = searches.some((search) => search.id === next.id);
  if (!exists) return [...searches, next];
  return searches.map((search) => (search.id === next.id ? next : search));
}

export function withoutSearch(searches: readonly SavedSearch[], id: string): SavedSearch[] {
  return searches.filter((search) => search.id !== id);
}

/** 0 no formulário vira este intervalo, para o preço continuar sendo atualizado. */
export const BACKGROUND_REFRESH_MINUTES = 15;

export function refreshEveryMinutes(repeatEveryMinutes: number): number {
  return repeatEveryMinutes >= 1 ? repeatEveryMinutes : BACKGROUND_REFRESH_MINUTES;
}

/** Se o intervalo mudou, a próxima rodada passa a contar a partir de agora. */
export function rescheduleRound(
  now: number,
  endsAt: number,
  previousMinutes: number,
  nextMinutes: number,
): { minutes: number; endsAt: number } {
  if (nextMinutes === previousMinutes) return { minutes: previousMinutes, endsAt };
  return { minutes: nextMinutes, endsAt: now + nextMinutes * 60_000 };
}

export function searchCounter(offerCount: number, progress: SearchProgress | null): string {
  const offers = offerCount === 1 ? '1 oferta' : `${offerCount} ofertas`;
  if (!progress || progress.total === 0) return offers;
  return `${offers} · ${progress.done} de ${progress.total}`;
}

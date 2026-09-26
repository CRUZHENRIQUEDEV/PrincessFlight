// Versão: 1.1
import type { AlertRules } from './alert-rules';
import type { FlightOffer, SearchCriteria } from './types';

export interface SearchProgress {
  done: number;
  total: number;
}

export interface SavedSearch {
  id: string;
  name: string;
  criteria: SearchCriteria;
  alertRules: AlertRules;
  offers: FlightOffer[];
  updatedAt: string;
  lastStatus: string;
  running: boolean;
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
    criteria: structuredClone(criteria),
    alertRules: structuredClone(alertRules),
    offers: [],
    updatedAt: now,
    lastStatus: 'Pronta para buscar.',
    running: false,
    progress: null,
  };
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
  if (searches.length <= 1) return [...searches];
  return searches.filter((search) => search.id !== id);
}

export function searchCounter(offerCount: number, progress: SearchProgress | null): string {
  const offers = offerCount === 1 ? '1 oferta' : `${offerCount} ofertas`;
  if (!progress || progress.total === 0) return offers;
  return `${offers} · ${progress.done} de ${progress.total}`;
}

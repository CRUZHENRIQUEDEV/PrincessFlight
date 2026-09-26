// Versão: 1.0
import { describe, expect, it } from 'vitest';
import { createDefaultAlertRules } from '../src/domain/alert-rules';
import { createSavedSearch, ensureFavoritesSearch, ensurePinnedSearches, nextSearchName, normalizeSavedSearch, refreshEveryMinutes, rescheduleRound, searchCounter, withFavoriteDestination, withoutSearch } from '../src/domain/saved-search';
import { sampleCriteria } from './fixtures';

describe('pesquisas salvas', () => {
  it('numera o próximo perfil e permite excluir a última pesquisa', () => {
    const rules = createDefaultAlertRules();
    const first = createSavedSearch('Pesquisa 1', sampleCriteria(), rules, '2026-09-26T12:00:00Z');
    expect(nextSearchName([first])).toBe('Pesquisa 2');
    expect(withoutSearch([first], first.id)).toEqual([]);
    expect(refreshEveryMinutes(0)).toBe(15);
    expect(refreshEveryMinutes(5)).toBe(5);
    expect(rescheduleRound(1_000, 61_000, 1, 1)).toEqual({ minutes: 1, endsAt: 61_000 });
    expect(rescheduleRound(1_000, 61_000, 1, 20).endsAt).toBe(1_000 + 20 * 60_000);
    expect(searchCounter(4, { done: 2, total: 3 })).toBe('4 ofertas · 2 de 3');
    expect(first.notes).toBe('');
    expect(normalizeSavedSearch({ ...first, notes: 'levar a mala pequena' }).notes).toBe('levar a mala pequena');
    const legacy = { ...first, notes: undefined as unknown as string };
    expect(normalizeSavedSearch(legacy).notes).toBe('');
    const favorites = ensureFavoritesSearch([first], 'BSB', '2026-09-26T12:00:00Z');
    expect(favorites[0].mode).toBe('favorites');
    expect(favorites[0].name).toBe('Destinos favoritos');
    expect(favorites[1].id).toBe(first.id);
    expect(ensureFavoritesSearch(favorites, 'BSB', '2026-09-26T12:00:00Z')).toHaveLength(2);
    const pinned = ensurePinnedSearches([first], 'BSB', '2026-09-26T12:00:00Z');
    expect(pinned.map((search) => search.mode)).toEqual(['favorites', 'anywhere', 'filters']);
    expect(pinned[1].name).toBe('Voos baratos');
    expect(ensurePinnedSearches(pinned, 'BSB', '2026-09-26T12:00:00Z')).toHaveLength(3);
    const withSalvador = withFavoriteDestination(favorites[0], 'ssa', true);
    expect(withSalvador.favoriteDestinations).toEqual(['SSA']);
    expect(withFavoriteDestination(withSalvador, 'BSB', true).favoriteDestinations).toEqual(['SSA']);
  });
});

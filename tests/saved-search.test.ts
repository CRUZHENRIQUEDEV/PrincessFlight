// Versão: 1.0
import { describe, expect, it } from 'vitest';
import { createDefaultAlertRules } from '../src/domain/alert-rules';
import { createSavedSearch, nextSearchName, refreshEveryMinutes, searchCounter, withoutSearch } from '../src/domain/saved-search';
import { sampleCriteria } from './fixtures';

describe('pesquisas salvas', () => {
  it('numera o próximo perfil e permite excluir a última pesquisa', () => {
    const rules = createDefaultAlertRules();
    const first = createSavedSearch('Pesquisa 1', sampleCriteria(), rules, '2026-09-26T12:00:00Z');
    expect(nextSearchName([first])).toBe('Pesquisa 2');
    expect(withoutSearch([first], first.id)).toEqual([]);
    expect(refreshEveryMinutes(0)).toBe(15);
    expect(refreshEveryMinutes(5)).toBe(5);
    expect(searchCounter(4, { done: 2, total: 3 })).toBe('4 ofertas · 2 de 3');
  });
});

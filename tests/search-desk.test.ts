// Versão: 1.0
import { describe, expect, it } from 'vitest';
import { createDefaultAlertRules } from '../src/domain/alert-rules';
import { createSavedSearch } from '../src/domain/saved-search';
import { createSearchDesk } from '../src/presentation/search-desk';
import type { FlightPriceProvider, RouteMonthQuery } from '../src/infrastructure/travelpayouts-client';
import { sampleCriteria } from './fixtures';

describe('mesa de pesquisas', () => {
  it('parar uma pesquisa deixa a outra terminar', async () => {
    const rules = createDefaultAlertRules();
    const held = createSavedSearch('Pesquisa 1', sampleCriteria({ states: ['SE'] }), rules, '2026-09-26T12:00:00Z');
    const free = createSavedSearch('Pesquisa 2', sampleCriteria({ states: ['AL'] }), rules, '2026-09-26T12:00:00Z');
    const searches = [held, free];
    let gate: ((error: Error) => void) | null = null;
    const provider: FlightPriceProvider = {
      searchRouteMonth(query: RouteMonthQuery) {
        if (query.destination !== 'AJU') return Promise.resolve([]);
        return new Promise((_resolve, reject) => {
          const fail = () => reject(new DOMException('A busca foi interrompida.', 'AbortError'));
          if (query.signal.aborted) fail();
          else query.signal.addEventListener('abort', fail, { once: true });
          gate = fail;
        });
      },
    };
    const desk = createSearchDesk({
      provider,
      readToken: () => 'token-de-teste',
      getSearch: (id) => searches.find((search) => search.id === id),
      patch: (id, update) => {
        const index = searches.findIndex((search) => search.id === id);
        if (index < 0) return;
        searches[index] = { ...searches[index], ...update };
      },
      isActive: (id) => id === held.id,
      setStatus: () => undefined,
      setFresh: () => undefined,
      note: () => undefined,
      onDeals: () => undefined,
    });

    const heldRun = desk.run(held.id, 'once');
    const freeRun = desk.run(free.id, 'once');
    await freeRun;
    expect(desk.isRunning(free.id)).toBe(false);
    expect(searches.find((search) => search.id === free.id)?.lastStatus).toMatch(/concluída/);
    expect(desk.isRunning(held.id)).toBe(true);
    desk.stop(held.id);
    await heldRun;
    expect(gate).not.toBeNull();
    expect(searches.find((search) => search.id === held.id)?.lastStatus).toMatch(/interrompida/);
    expect(desk.isRunning(free.id)).toBe(false);
  });
});

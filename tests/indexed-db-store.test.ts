// Versão: 1.1
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { IndexedDbFlightStore } from '../src/infrastructure/indexed-db-store';
import { createSavedSearch } from '../src/domain/saved-search';
import { createDefaultAlertRules } from '../src/domain/alert-rules';
import { sampleCriteria, sampleOffer } from './fixtures';

describe('IndexedDB', () => {
  it('grava e relê token, filtros e ofertas', async () => {
    const store = await IndexedDbFlightStore.open(`princess-flight-${Math.random()}`);
    expect(await store.getSettings()).toBeNull();
    expect(await store.getOffers()).toEqual([]);
    const settings = {
      token: 'token-de-teste',
      criteria: sampleCriteria(),
      updatedAt: '2026-09-26T12:00:00Z',
    };
    await store.saveSettings(settings);
    await store.saveOffers([sampleOffer()]);
    expect(await store.getSettings()).toEqual(settings);
    expect(await store.getOffers()).toEqual([sampleOffer()]);
    await store.saveHeardIds(['oferta-1', 'oferta-2']);
    expect(await store.getHeardIds()).toEqual(['oferta-1', 'oferta-2']);
    const search = createSavedSearch('Pesquisa 1', sampleCriteria(), createDefaultAlertRules(), '2026-09-26T12:00:00Z');
    await store.saveSearch(search);
    expect(await store.getSearches()).toEqual([search]);
    await store.deleteSearch(search.id);
    expect(await store.getSearches()).toEqual([]);
    store.close();
  });
});

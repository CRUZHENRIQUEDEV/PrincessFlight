// Versão: 1.3
import type { StoredAlert } from '../domain/alert-shelf';
import type { SavedSearch } from '../domain/saved-search';
import type { FlightOffer } from '../domain/types';
import type { FlightStore, StoredSettings } from './flight-store';

interface SettingsRow extends StoredSettings {
  id: 'app';
}

interface OffersRow {
  id: 'current';
  offers: FlightOffer[];
}

interface HeardRow {
  id: 'heard';
  offerIds: string[];
}

interface ShelfRow {
  id: 'shelf';
  items: StoredAlert[];
}

/** O token fica neste banco local. Não entra no repositório nem no build. */
export class IndexedDbFlightStore implements FlightStore {
  private constructor(private readonly db: IDBDatabase) {}

  static open(name = 'princess-flight', factory: IDBFactory | undefined = globalThis.indexedDB): Promise<IndexedDbFlightStore> {
    if (!factory) return Promise.reject(new Error('IndexedDB indisponível'));
    return new Promise((resolve, reject) => {
      const request = factory.open(name, 3);
      request.onupgradeneeded = () => upgrade(request.result);
      request.onsuccess = () => resolve(new IndexedDbFlightStore(request.result));
      request.onerror = () => reject(request.error ?? new Error('Falha ao abrir o IndexedDB'));
    });
  }

  close(): void {
    this.db.close();
  }

  async getSettings(): Promise<StoredSettings | null> {
    const row = await this.get<SettingsRow>('settings', 'app');
    if (!row) return null;
    return {
      token: row.token,
      criteria: row.criteria,
      updatedAt: row.updatedAt,
      alertRules: row.alertRules,
    };
  }

  async saveSettings(settings: StoredSettings): Promise<void> {
    const row: SettingsRow = { id: 'app', ...settings };
    await this.put('settings', row);
  }

  async getOffers(): Promise<FlightOffer[]> {
    const row = await this.get<OffersRow>('offers', 'current');
    return row?.offers ?? [];
  }

  async saveOffers(offers: FlightOffer[]): Promise<void> {
    const row: OffersRow = { id: 'current', offers };
    await this.put('offers', row);
  }

  async getHeardIds(): Promise<string[]> {
    const row = await this.get<HeardRow>('settings', 'heard');
    return row?.offerIds ?? [];
  }

  async saveHeardIds(ids: readonly string[]): Promise<void> {
    const row: HeardRow = { id: 'heard', offerIds: [...ids] };
    await this.put('settings', row);
  }

  async getAlertShelf(): Promise<StoredAlert[]> {
    const row = await this.get<ShelfRow>('settings', 'shelf');
    return row?.items ?? [];
  }

  async saveAlertShelf(items: readonly StoredAlert[]): Promise<void> {
    const row: ShelfRow = { id: 'shelf', items: [...items] };
    await this.put('settings', row);
  }

  async getSearches(): Promise<SavedSearch[]> {
    const transaction = this.db.transaction('searches', 'readonly');
    const request = transaction.objectStore('searches').getAll();
    return requestToPromise<SavedSearch[]>(request);
  }

  async saveSearch(search: SavedSearch): Promise<void> {
    await this.put('searches', search);
  }

  async deleteSearch(id: string): Promise<void> {
    const transaction = this.db.transaction('searches', 'readwrite');
    transaction.objectStore('searches').delete(id);
    await transactionDone(transaction);
  }

  private get<T>(storeName: string, key: string): Promise<T | undefined> {
    const transaction = this.db.transaction(storeName, 'readonly');
    const request = transaction.objectStore(storeName).get(key);
    return requestToPromise<T | undefined>(request);
  }

  private async put(storeName: string, value: SettingsRow | OffersRow | HeardRow | ShelfRow | SavedSearch): Promise<void> {
    const transaction = this.db.transaction(storeName, 'readwrite');
    transaction.objectStore(storeName).put(value);
    await transactionDone(transaction);
  }
}

function upgrade(db: IDBDatabase): void {
  if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'id' });
  if (!db.objectStoreNames.contains('offers')) db.createObjectStore('offers', { keyPath: 'id' });
  if (!db.objectStoreNames.contains('searches')) db.createObjectStore('searches', { keyPath: 'id' });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Falha no IndexedDB'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Falha no IndexedDB'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Transação abortada'));
  });
}

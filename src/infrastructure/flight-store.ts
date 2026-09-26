// Versão: 1.3
import type { AlertRules } from '../domain/alert-rules';
import type { StoredAlert } from '../domain/alert-shelf';
import type { SavedSearch } from '../domain/saved-search';
import type { FlightOffer, SearchCriteria } from '../domain/types';

export interface StoredSettings {
  token: string;
  criteria: SearchCriteria;
  updatedAt: string;
  alertRules?: AlertRules;
  activeSearchId?: string;
}

export interface FlightStore {
  getSettings(): Promise<StoredSettings | null>;
  saveSettings(settings: StoredSettings): Promise<void>;
  getOffers(): Promise<FlightOffer[]>;
  saveOffers(offers: FlightOffer[]): Promise<void>;
  getHeardIds(): Promise<string[]>;
  saveHeardIds(ids: readonly string[]): Promise<void>;
  getAlertShelf(): Promise<StoredAlert[]>;
  saveAlertShelf(items: readonly StoredAlert[]): Promise<void>;
  getSearches(): Promise<SavedSearch[]>;
  saveSearch(search: SavedSearch): Promise<void>;
  deleteSearch(id: string): Promise<void>;
}

export class MemoryFlightStore implements FlightStore {
  private settings: StoredSettings | null = null;
  private offers: FlightOffer[] = [];
  private heardIds: string[] = [];
  private shelf: StoredAlert[] = [];
  private searches: SavedSearch[] = [];

  async getSettings(): Promise<StoredSettings | null> {
    return this.settings ? structuredClone(this.settings) : null;
  }

  async saveSettings(settings: StoredSettings): Promise<void> {
    this.settings = structuredClone(settings);
  }

  async getOffers(): Promise<FlightOffer[]> {
    return structuredClone(this.offers);
  }

  async saveOffers(offers: FlightOffer[]): Promise<void> {
    this.offers = structuredClone(offers);
  }

  async getHeardIds(): Promise<string[]> {
    return [...this.heardIds];
  }

  async saveHeardIds(ids: readonly string[]): Promise<void> {
    this.heardIds = [...ids];
  }

  async getAlertShelf(): Promise<StoredAlert[]> {
    return structuredClone(this.shelf);
  }

  async saveAlertShelf(items: readonly StoredAlert[]): Promise<void> {
    this.shelf = items.map((item) => structuredClone(item));
  }

  async getSearches(): Promise<SavedSearch[]> {
    return this.searches.map((search) => structuredClone(search));
  }

  async saveSearch(search: SavedSearch): Promise<void> {
    const clone = structuredClone(search);
    const index = this.searches.findIndex((item) => item.id === clone.id);
    if (index < 0) this.searches.push(clone);
    else this.searches[index] = clone;
  }

  async deleteSearch(id: string): Promise<void> {
    this.searches = this.searches.filter((search) => search.id !== id);
  }
}

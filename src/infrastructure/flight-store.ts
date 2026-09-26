// Versão: 1.1
import type { AlertRules } from '../domain/alert-rules';
import type { FlightOffer, SearchCriteria } from '../domain/types';

export interface StoredSettings {
  token: string;
  criteria: SearchCriteria;
  updatedAt: string;
  alertRules?: AlertRules;
}

export interface FlightStore {
  getSettings(): Promise<StoredSettings | null>;
  saveSettings(settings: StoredSettings): Promise<void>;
  getOffers(): Promise<FlightOffer[]>;
  saveOffers(offers: FlightOffer[]): Promise<void>;
  getHeardIds(): Promise<string[]>;
  saveHeardIds(ids: readonly string[]): Promise<void>;
}

export class MemoryFlightStore implements FlightStore {
  private settings: StoredSettings | null = null;
  private offers: FlightOffer[] = [];
  private heardIds: string[] = [];

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
}

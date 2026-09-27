// Versão: 2.0
import { calendarDay } from '../domain/iso-date';
import { searchDateFromLink } from '../domain/offer';
import type { RawTicket } from '../domain/types';
import { delay, isAbortError } from './delay';
import { TravelpayoutsError } from './travelpayouts-error';

const DEV_ENDPOINT = '/tp-api/aviasales/v3/prices_for_dates';
const PROD_ENDPOINT = 'https://princess-flight.cruzhenriquedev.workers.dev/aviasales/v3/prices_for_dates';

export interface RouteMonthQuery {
  token: string;
  origin: string;
  destination: string;
  month: string;
  signal: AbortSignal;
  includeRegularPrices?: boolean;
}

export interface FlightPriceProvider {
  searchRouteMonth(query: RouteMonthQuery): Promise<RawTicket[]>;
  searchCalendarMonth?(query: RouteMonthQuery): Promise<RawTicket[]>;
  searchCheapest?(query: CheapQuery): Promise<RawTicket | null>;
  searchAnywhere?(query: AnywhereQuery): Promise<RawTicket[]>;
}

export interface CheapQuery {
  token: string;
  origin: string;
  destination: string;
  signal: AbortSignal;
}

export interface AnywhereQuery {
  token: string;
  origin: string;
  signal: AbortSignal;
}

export function resolveEndpoint(isDev: boolean): string {
  return isDev ? DEV_ENDPOINT : PROD_ENDPOINT;
}

const REGULAR_PAGE_SIZE = 100;
const CHEAPEST_PAGE_SIZE = 1;
const MAX_REGULAR_PAGES = 3;

export function buildPricesForDatesUrl(query: RouteMonthQuery, endpoint: string, page = 1): string {
  const regular = query.includeRegularPrices !== false;
  const params = new URLSearchParams({
    origin: query.origin,
    destination: query.destination,
    departure_at: query.month,
    one_way: 'false',
    sorting: 'price',
    limit: String(regular ? REGULAR_PAGE_SIZE : CHEAPEST_PAGE_SIZE),
    page: String(page),
    currency: 'brl',
    market: 'br',
    direct: 'false',
    unique: 'false',
  });
  return `${endpoint}?${params.toString()}`;
}

export function calendarEndpoint(pricesEndpoint: string): string {
  return pricesEndpoint.replace('/aviasales/v3/prices_for_dates', '/v1/prices/calendar');
}

export function cheapEndpoint(pricesEndpoint: string): string {
  return pricesEndpoint.replace('/aviasales/v3/prices_for_dates', '/v1/prices/cheap');
}

export function anywhereEndpoint(pricesEndpoint: string): string {
  return pricesEndpoint.replace('/aviasales/v3/prices_for_dates', '/v1/city-directions');
}

export function buildAnywhereUrl(query: AnywhereQuery, endpoint: string): string {
  const params = new URLSearchParams({
    origin: cacheCityCode(query.origin),
    currency: 'brl',
    market: 'br',
  });
  return `${endpoint}?${params.toString()}`;
}

export function buildCheapUrl(query: CheapQuery, endpoint: string): string {
  const params = new URLSearchParams({
    origin: query.origin,
    destination: query.destination,
    currency: 'brl',
    market: 'br',
  });
  return `${endpoint}?${params.toString()}`;
}

export function buildCalendarUrl(query: RouteMonthQuery, endpoint: string): string {
  const params = new URLSearchParams({
    origin: query.origin,
    destination: query.destination,
    depart_date: query.month,
    calendar_type: 'departure_date',
    currency: 'brl',
    market: 'br',
  });
  return `${endpoint}?${params.toString()}`;
}

export class TravelpayoutsClient implements FlightPriceProvider {
  constructor(
    private readonly fetchFn: typeof fetch = globalThis.fetch.bind(globalThis),
    private readonly sleep: (milliseconds: number, signal: AbortSignal) => Promise<void> = delay,
    private readonly endpoint = resolveEndpoint(import.meta.env.DEV),
  ) {}

  async searchRouteMonth(query: RouteMonthQuery): Promise<RawTicket[]> {
    try {
      return await this.request(query);
    } catch (error) {
      if (!(error instanceof TravelpayoutsError) || error.code !== 'rate') throw error;
      await this.sleep(2_000, query.signal);
      return this.request(query);
    }
  }

  async searchCheapest(query: CheapQuery): Promise<RawTicket | null> {
    try {
      return await this.requestCheapest(query);
    } catch (error) {
      if (!(error instanceof TravelpayoutsError) || error.code !== 'rate') throw error;
      await this.sleep(2_000, query.signal);
      return this.requestCheapest(query);
    }
  }

  async searchAnywhere(query: AnywhereQuery): Promise<RawTicket[]> {
    try {
      return await this.requestAnywhere(query);
    } catch (error) {
      if (!(error instanceof TravelpayoutsError) || error.code !== 'rate') throw error;
      await this.sleep(2_000, query.signal);
      return this.requestAnywhere(query);
    }
  }

  async searchCalendarMonth(query: RouteMonthQuery): Promise<RawTicket[]> {
    const response = await this.fetchCalendar(query);
    if (response.status === 401 || response.status === 403) {
      throw new TravelpayoutsError('Token recusado. Confira em Perfil → API token.', response.status, 'auth');
    }
    if (!response.ok) return [];
    return parseCalendarBody(await readBody(response), query);
  }

  private async request(query: RouteMonthQuery): Promise<RawTicket[]> {
    const regular = query.includeRegularPrices !== false;
    const pageSize = regular ? REGULAR_PAGE_SIZE : CHEAPEST_PAGE_SIZE;
    const maxPages = regular ? MAX_REGULAR_PAGES : 1;
    const tickets: RawTicket[] = [];
    for (let page = 1; page <= maxPages; page += 1) {
      const batch = await this.requestPage(query, page);
      tickets.push(...batch);
      if (batch.length < pageSize) break;
    }
    return tickets;
  }

  private async requestPage(query: RouteMonthQuery, page: number): Promise<RawTicket[]> {
    const response = await this.fetchResponse(query, page);
    if (response.status === 429) throw new TravelpayoutsError('Limite de chamadas da Travelpayouts.', 429, 'rate');
    if (response.status === 401 || response.status === 403) {
      throw new TravelpayoutsError('Token recusado. Confira em Perfil → API token.', response.status, 'auth');
    }
    if (!response.ok) throw new TravelpayoutsError('A Travelpayouts recusou a consulta.', response.status, 'api');
    const body = await readBody(response);
    return parsePricesBody(body, query);
  }

  private async fetchResponse(query: RouteMonthQuery, page: number): Promise<Response> {
    return this.fetchUrl(buildPricesForDatesUrl(query, this.endpoint, page), query);
  }

  private async requestAnywhere(query: AnywhereQuery): Promise<RawTicket[]> {
    const response = await this.fetchUrl(buildAnywhereUrl(query, anywhereEndpoint(this.endpoint)), query);
    if (response.status === 429) throw new TravelpayoutsError('Limite de chamadas da Travelpayouts.', 429, 'rate');
    if (response.status === 401 || response.status === 403) {
      throw new TravelpayoutsError('Token recusado. Confira em Perfil → API token.', response.status, 'auth');
    }
    if (!response.ok) throw new TravelpayoutsError('A Travelpayouts recusou a consulta.', response.status, 'api');
    return parseAnywhereBody(await readBody(response), query.origin);
  }

  private async requestCheapest(query: CheapQuery): Promise<RawTicket | null> {
    const response = await this.fetchUrl(buildCheapUrl(query, cheapEndpoint(this.endpoint)), query);
    if (response.status === 429) throw new TravelpayoutsError('Limite de chamadas da Travelpayouts.', 429, 'rate');
    if (response.status === 401 || response.status === 403) {
      throw new TravelpayoutsError('Token recusado. Confira em Perfil → API token.', response.status, 'auth');
    }
    if (!response.ok) throw new TravelpayoutsError('A Travelpayouts recusou a consulta.', response.status, 'api');
    return parseCheapBody(await readBody(response), query);
  }

  private async fetchCalendar(query: RouteMonthQuery): Promise<Response> {
    return this.fetchUrl(buildCalendarUrl(query, calendarEndpoint(this.endpoint)), query);
  }

  private async fetchUrl(url: string, query: { token: string; signal: AbortSignal }): Promise<Response> {
    try {
      return await this.fetchFn(url, {
        signal: query.signal,
        cache: 'no-store',
        headers: { 'X-Access-Token': query.token },
      });
    } catch (error) {
      if (isAbortError(error)) throw error;
      throw new TravelpayoutsError(this.networkMessage(), null, 'network');
    }
  }

  private networkMessage(): string {
    if (this.endpoint.includes('workers.dev')) return 'A ponte de produção não respondeu. Tente de novo em instantes.';
    if (this.endpoint.startsWith('http')) {
      return 'A Travelpayouts não autoriza chamada direta do navegador. Rode npm run dev neste computador, que faz a ponte para a API.';
    }
    return 'Falha de rede ao consultar a Travelpayouts.';
  }
}

export function parsePricesBody(body: unknown, query: RouteMonthQuery): RawTicket[] {
  const record = asRecord(body);
  if (!record) throw new TravelpayoutsError('Resposta inválida da Travelpayouts.', null, 'api');
  if (record.success === false) {
    const message = text(record.error) || 'A Travelpayouts recusou a consulta.';
    const code = /token|unauthor/i.test(message) ? 'auth' : 'api';
    throw new TravelpayoutsError(clip(message), null, code);
  }
  const currency = text(record.currency).toUpperCase() || 'BRL';
  return rowsFromData(record.data)
    .map((row) => toTicket(row, query, currency))
    .filter((ticket): ticket is RawTicket => ticket !== null);
}

export function parseCheapBody(body: unknown, query: CheapQuery): RawTicket | null {
  const record = asRecord(body);
  if (!record) throw new TravelpayoutsError('Resposta inválida da Travelpayouts.', null, 'api');
  if (record.success === false) {
    const message = text(record.error) || 'A Travelpayouts recusou a consulta.';
    const code = /token|unauthor/i.test(message) ? 'auth' : 'api';
    throw new TravelpayoutsError(clip(message), null, code);
  }
  const data = asRecord(record.data);
  const destination = query.destination.toUpperCase();
  const bucket = cheapBucket(data, destination);
  if (!bucket) return null;
  const currency = text(record.currency).toUpperCase() || 'BRL';
  const route: RouteMonthQuery = { ...query, month: '' };
  let best: RawTicket | null = null;
  for (const [stops, value] of Object.entries(bucket)) {
    const row = asRecord(value);
    if (!row) continue;
    const ticket = toTicket({ ...row, transfers: row.transfers ?? stopCount(stops) }, route, currency);
    if (!ticket) continue;
    const priced = { ...ticket, link: ticket.link || roundTripLink(ticket) };
    if (!best || priced.price < best.price) best = priced;
  }
  return best;
}

export function parseAnywhereBody(body: unknown, origin: string): RawTicket[] {
  const record = asRecord(body);
  if (!record) throw new TravelpayoutsError('Resposta inválida da Travelpayouts.', null, 'api');
  if (record.success === false) {
    const message = text(record.error) || 'A Travelpayouts recusou a consulta.';
    const code = /token|unauthor/i.test(message) ? 'auth' : 'api';
    throw new TravelpayoutsError(clip(message), null, code);
  }
  const data = asRecord(record.data);
  if (!data) return [];
  const currency = text(record.currency).toUpperCase() || 'BRL';
  const home = origin.trim().toUpperCase();
  const city = cacheCityCode(home);
  const tickets: RawTicket[] = [];
  for (const [code, value] of Object.entries(data)) {
    const row = asRecord(value);
    if (!row) continue;
    const destination = (text(row.destination) || code).toUpperCase();
    if (!destination || destination === home || destination === city) continue;
    const route: RouteMonthQuery = { token: '', origin: home, destination, month: '', signal: new AbortController().signal };
    const ticket = toTicket(row, route, currency);
    if (!ticket) continue;
    tickets.push({ ...ticket, link: ticket.link || roundTripLink(ticket) });
  }
  return tickets.sort((left, right) => left.price - right.price);
}

function cheapBucket(data: Record<string, unknown> | null, destination: string): Record<string, unknown> | null {
  if (!data) return null;
  const named = asRecord(data[destination]);
  if (named) return named;
  const city = cacheCityCode(destination);
  const byCity = city === destination ? null : asRecord(data[city]);
  if (byCity) return byCity;
  const buckets = Object.values(data).map((value) => asRecord(value)).filter((value) => value !== null);
  return buckets.length === 1 ? buckets[0] : null;
}

/** Aeroportos cujo cache da Travelpayouts fica no código da cidade. */
export function cacheCityCode(iata: string): string {
  const code = iata.trim().toUpperCase();
  const city: Record<string, string> = {
    GIG: 'RIO',
    SDU: 'RIO',
    GRU: 'SAO',
    CGH: 'SAO',
    VCP: 'SAO',
    CNF: 'BHZ',
    PLU: 'BHZ',
  };
  return city[code] ?? code;
}

function stopCount(stops: string): number {
  const parsed = Number(stops);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function roundTripLink(ticket: RawTicket): string {
  const go = compactDay(ticket.departureAt);
  const back = compactDay(ticket.returnAt ?? '');
  if (!go || !back) return '';
  return `https://www.aviasales.com/search/${ticket.origin}${go}${ticket.destination}${back}1`;
}

function compactDay(iso: string): string {
  const day = calendarDay(iso);
  const [, month, date] = day.split('-');
  if (!month || !date) return '';
  return `${date}${month}`;
}

export function parseCalendarBody(body: unknown, query: RouteMonthQuery): RawTicket[] {
  const record = asRecord(body);
  if (!record || record.success === false) return [];
  const currency = text(record.currency).toUpperCase() || 'BRL';
  return calendarRows(record.data)
    .map((row) => toTicket(row, query, currency))
    .filter((ticket): ticket is RawTicket => ticket !== null);
}

function calendarRows(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  const record = asRecord(data);
  return record ? Object.values(record) : [];
}

function toTicket(value: unknown, query: RouteMonthQuery, currency: string): RawTicket | null {
  const row = asRecord(value);
  if (!row) return null;
  const price = numberValue(row.price);
  const departureAt = text(row.departure_at);
  if (price === null || price <= 0 || !departureAt) return null;
  const returnAt = text(row.return_at);
  const link = absoluteLink(text(row.link), query.token);
  return {
    origin: query.origin.toUpperCase(),
    destination: query.destination.toUpperCase(),
    originAirport: text(row.origin_airport).toUpperCase() || query.origin.toUpperCase(),
    destinationAirport: text(row.destination_airport).toUpperCase() || query.destination.toUpperCase(),
    price,
    currency,
    airline: text(row.airline).toUpperCase(),
    flightNumber: text(row.flight_number),
    departureAt,
    returnAt: returnAt || null,
    transfers: numberValue(row.transfers) ?? 0,
    returnTransfers: numberValue(row.return_transfers) ?? 0,
    durationToMinutes: flightMinutes(row.duration_to) ?? (returnAt ? null : flightMinutes(row.duration)),
    durationBackMinutes: returnAt ? flightMinutes(row.duration_back) : null,
    link,
    foundAt: text(row.found_at) || searchDateFromLink(link),
  };
}

async function readBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new TravelpayoutsError('Resposta inválida da Travelpayouts.', response.status, 'api');
  }
}

function rowsFromData(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  return [];
}

function absoluteLink(path: string, token: string): string {
  const cleaned = token ? path.split(token).join('') : path;
  if (!cleaned) return '';
  if (cleaned.startsWith('http://') || cleaned.startsWith('https://')) return cleaned;
  if (cleaned.startsWith('/')) return `https://www.aviasales.com${cleaned}`;
  return `https://www.aviasales.com/${cleaned}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function text(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return '';
}

function numberValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function flightMinutes(value: unknown): number | null {
  const minutes = numberValue(value);
  if (minutes === null || minutes <= 0) return null;
  return Math.round(minutes);
}

function clip(message: string): string {
  const clean = message.replace(/\s+/g, ' ').trim();
  return clean.length > 180 ? `${clean.slice(0, 177)}...` : clean;
}

// Versão: 1.1
import type { RawTicket } from '../domain/types';
import { delay, isAbortError } from './delay';
import { TravelpayoutsError } from './travelpayouts-error';

const DEV_ENDPOINT = '/tp-api/aviasales/v3/prices_for_dates';
const PROD_ENDPOINT = 'https://api.travelpayouts.com/aviasales/v3/prices_for_dates';

export interface RouteMonthQuery {
  token: string;
  origin: string;
  destination: string;
  month: string;
  signal: AbortSignal;
}

export interface FlightPriceProvider {
  searchRouteMonth(query: RouteMonthQuery): Promise<RawTicket[]>;
}

export function resolveEndpoint(isDev: boolean): string {
  return isDev ? DEV_ENDPOINT : PROD_ENDPOINT;
}

export function buildPricesForDatesUrl(query: RouteMonthQuery, endpoint: string): string {
  const params = new URLSearchParams({
    origin: query.origin,
    destination: query.destination,
    departure_at: query.month,
    one_way: 'false',
    sorting: 'price',
    limit: '30',
    page: '1',
    currency: 'brl',
    direct: 'false',
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

  private async request(query: RouteMonthQuery): Promise<RawTicket[]> {
    const response = await this.fetchResponse(query);
    if (response.status === 429) throw new TravelpayoutsError('Limite de chamadas da Travelpayouts.', 429, 'rate');
    if (response.status === 401 || response.status === 403) {
      throw new TravelpayoutsError('Token recusado. Confira em Perfil → API token.', response.status, 'auth');
    }
    if (!response.ok) throw new TravelpayoutsError('A Travelpayouts recusou a consulta.', response.status, 'api');
    const body = await readBody(response);
    return parsePricesBody(body, query);
  }

  private async fetchResponse(query: RouteMonthQuery): Promise<Response> {
    try {
      return await this.fetchFn(buildPricesForDatesUrl(query, this.endpoint), {
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

function toTicket(value: unknown, query: RouteMonthQuery, currency: string): RawTicket | null {
  const row = asRecord(value);
  if (!row) return null;
  const price = numberValue(row.price);
  const departureAt = text(row.departure_at);
  if (price === null || price <= 0 || !departureAt) return null;
  const returnAt = text(row.return_at);
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
    link: absoluteLink(text(row.link), query.token),
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

function clip(message: string): string {
  const clean = message.replace(/\s+/g, ' ').trim();
  return clean.length > 180 ? `${clean.slice(0, 177)}...` : clean;
}

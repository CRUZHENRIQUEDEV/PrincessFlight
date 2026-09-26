// Versão: 1.5
import { addDays, todayIso, tomorrowIso } from './iso-date';
import { normalizeTripLength } from './filters';
import type { OfferSort, Region, SearchCriteria, TripScope } from './types';
import type { SearchPlan } from './search-plan';

const REGIONS: readonly Region[] = ['norte', 'nordeste', 'centro-oeste', 'sudeste', 'sul'];

export interface CriteriaInput {
  originIata: string;
  scope: string;
  regions: string[];
  states: string[];
  coastalOnly: boolean;
  departureStart: string;
  departureEnd: string;
  tripLengthDays: string;
  holidayBridgeOnly: boolean;
  priceMin: string;
  priceMax: string;
  bargainRatioPercent: string;
  airlinesText: string;
  delayBetweenCallsSeconds: string;
  repeatEveryMinutes: string;
  bargainsOnly: boolean;
  includeRegularPrices: boolean;
  offerSort: string;
}

export interface ParsedCriteria {
  criteria: SearchCriteria;
  fieldError: string | null;
}

export function createDefaultCriteria(today = todayIso()): SearchCriteria {
  const departureStart = tomorrowIso(today);
  return {
    originIata: 'GRU',
    scope: 'nacional',
    regions: [],
    states: [],
    coastalOnly: true,
    departureStart,
    departureEnd: addDays(departureStart, 30),
    tripLengthDays: null,
    holidayBridgeOnly: false,
    priceMin: null,
    priceMax: null,
    bargainRatio: 0.7,
    airlines: [],
    delayBetweenCallsSeconds: 5,
    repeatEveryMinutes: 0,
    bargainsOnly: false,
    includeRegularPrices: true,
    offerSort: 'price',
  };
}

export function parseAirlines(text: string): string[] {
  const codes = text
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter((code) => /^[A-Z0-9]{2}$/.test(code));
  return [...new Set(codes)];
}

export function parseCriteria(input: CriteriaInput): ParsedCriteria {
  const priceMin = optionalNumber(input.priceMin);
  const priceMax = optionalNumber(input.priceMax);
  const bargain = optionalNumber(input.bargainRatioPercent);
  const delay = optionalInteger(input.delayBetweenCallsSeconds);
  const repeat = optionalInteger(input.repeatEveryMinutes);
  const tripLength = optionalInteger(input.tripLengthDays);
  const fieldError = firstFieldError(priceMin, priceMax, bargain, delay, repeat);
  return {
    criteria: {
      originIata: input.originIata.trim().toUpperCase(),
      scope: parseScope(input.scope),
      regions: parseRegions(input.regions),
      states: input.states.map((state) => state.toUpperCase()),
      coastalOnly: input.coastalOnly,
      departureStart: input.departureStart,
      departureEnd: input.departureEnd,
      tripLengthDays: normalizeTripLength(tripLength.value),
      holidayBridgeOnly: input.holidayBridgeOnly,
      priceMin: priceMin.value,
      priceMax: priceMax.value,
      bargainRatio: bargainRatio(bargain.value),
      airlines: parseAirlines(input.airlinesText),
      delayBetweenCallsSeconds: delay.value !== null && delay.value >= 2 ? delay.value : 5,
      repeatEveryMinutes: repeat.value !== null && repeat.value >= 0 ? repeat.value : 0,
      bargainsOnly: input.bargainsOnly,
      includeRegularPrices: input.includeRegularPrices,
      offerSort: parseOfferSort(input.offerSort),
    },
    fieldError,
  };
}

export function validateSearch(
  criteria: SearchCriteria,
  plan: SearchPlan,
  token: string,
  today = todayIso(),
): string | null {
  if (!token.trim()) return 'Cole o token da Travelpayouts. Ele fica salvo só neste navegador.';
  if (!criteria.originIata) return 'Escolha a origem.';
  if (!criteria.departureStart || !criteria.departureEnd) return 'Informe o intervalo de datas.';
  if (criteria.departureStart > criteria.departureEnd) return 'A data inicial é posterior à data final.';
  const minimum = tomorrowIso(today);
  if (criteria.departureStart < minimum || criteria.departureEnd < minimum) {
    return 'A data precisa ser a partir de amanhã.';
  }
  if (criteria.priceMin !== null && criteria.priceMax !== null && criteria.priceMin > criteria.priceMax) {
    return 'O preço mínimo está acima do preço máximo.';
  }
  if (plan.months.length === 24 && plan.months[23] < criteria.departureEnd.slice(0, 7)) {
    return 'Reduza o intervalo para no máximo 24 meses.';
  }
  if (plan.destinations.length === 0) return 'Nenhum destino com esses filtros.';
  if (plan.months.length === 0) return 'Nenhum mês no intervalo de datas.';
  if (criteria.holidayBridgeOnly && plan.windows.length === 0) {
    return 'Nenhuma ponte de feriado (quinta, sexta, segunda ou terça) nesse intervalo.';
  }
  return null;
}

function parseScope(value: string): TripScope {
  return value === 'internacional' ? 'internacional' : 'nacional';
}

function parseOfferSort(value: string): OfferSort {
  if (value === 'date') return 'date';
  if (value === 'discount') return 'discount';
  return 'price';
}

function parseRegions(values: readonly string[]): Region[] {
  return values.filter((value): value is Region => REGIONS.includes(value as Region));
}

function bargainRatio(percent: number | null): number {
  if (percent === null) return 0.7;
  return Math.min(100, Math.max(10, percent)) / 100;
}

function firstFieldError(
  priceMin: OptionalNumber,
  priceMax: OptionalNumber,
  bargain: OptionalNumber,
  delay: OptionalNumber,
  repeat: OptionalNumber,
): string | null {
  if (priceMin.invalid || priceMax.invalid) return 'Preço inválido.';
  if (bargain.invalid || bargain.value === null || bargain.value < 10 || bargain.value > 100) {
    return 'O percentual da barganha precisa estar entre 10 e 100.';
  }
  if (delay.invalid || delay.value === null || delay.value < 2) {
    return 'A pausa entre chamadas precisa ser de pelo menos 2 segundos.';
  }
  if (repeat.invalid || (repeat.value !== null && repeat.value < 0)) {
    return 'A repetição em minutos precisa ser zero ou mais.';
  }
  return null;
}

interface OptionalNumber {
  value: number | null;
  invalid: boolean;
}

function optionalNumber(value: string): OptionalNumber {
  const trimmed = value.trim().replace(',', '.');
  if (!trimmed) return { value: null, invalid: false };
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return { value: null, invalid: true };
  return { value: parsed, invalid: false };
}

function optionalInteger(value: string): OptionalNumber {
  const parsed = optionalNumber(value);
  if (parsed.value === null || parsed.invalid) return parsed;
  if (!Number.isInteger(parsed.value)) return { value: null, invalid: true };
  return parsed;
}

// Versão: 1.2
import { searchOrigins } from './criteria';
import { listHolidayBridges } from './holiday-windows';
import { selectDestinations } from './filters';
import { listMonths } from './iso-date';
import type { Airport, HolidayWindow, SearchCriteria } from './types';

export interface SearchPlan {
  destinations: Airport[];
  months: string[];
  windows: HolidayWindow[];
  callCount: number;
}

export function buildSearchPlan(criteria: SearchCriteria, airports: readonly Airport[]): SearchPlan {
  const destinations = selectDestinations(airports, criteria);
  const windows = criteria.holidayBridgeOnly
    ? listHolidayBridges(criteria.departureStart, criteria.departureEnd)
    : [];
  const months = monthsFor(criteria, windows);
  return {
    destinations,
    months,
    windows,
    callCount: destinations.length * months.length,
  };
}

/** Soma as chamadas de cada origem. O destino não inclui a própria origem. */
export function countOriginCalls(
  criteria: SearchCriteria,
  airports: readonly Airport[],
): { origins: number; destinations: number; months: number; calls: number } {
  const origins = searchOrigins(criteria);
  let destinations = 0;
  let calls = 0;
  let months = 0;
  for (const origin of origins) {
    const plan = buildSearchPlan({ ...criteria, originIata: origin }, airports);
    destinations += plan.destinations.length;
    calls += plan.callCount;
    months = plan.months.length;
  }
  return { origins: origins.length, destinations, months, calls };
}

function monthsFor(criteria: SearchCriteria, windows: readonly HolidayWindow[]): string[] {
  const selected = listMonths(criteria.departureStart, criteria.departureEnd);
  if (!criteria.holidayBridgeOnly) return selected;
  const eve = windows.map((window) => window.departureDate.slice(0, 7));
  return [...new Set([...selected, ...eve])].sort();
}

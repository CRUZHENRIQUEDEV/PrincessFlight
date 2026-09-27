// Versão: 1.1
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

function monthsFor(criteria: SearchCriteria, windows: readonly HolidayWindow[]): string[] {
  const selected = listMonths(criteria.departureStart, criteria.departureEnd);
  if (!criteria.holidayBridgeOnly) return selected;
  const eve = windows.map((window) => window.departureDate.slice(0, 7));
  return [...new Set([...selected, ...eve])].sort();
}

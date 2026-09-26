// Versão: 1.0
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
  const months = listMonths(criteria.departureStart, criteria.departureEnd);
  const windows = criteria.holidayBridgeOnly
    ? listHolidayBridges(criteria.departureStart, criteria.departureEnd)
    : [];
  return {
    destinations,
    months,
    windows,
    callCount: destinations.length * months.length,
  };
}

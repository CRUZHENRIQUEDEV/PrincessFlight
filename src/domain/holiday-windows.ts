// Versão: 1.0
import { addDays, weekday } from './iso-date';
import type { HolidayWindow } from './types';

interface Holiday {
  date: string;
  name: string;
}

const FIXED_HOLIDAYS: ReadonlyArray<{ monthDay: string; name: string }> = [
  { monthDay: '01-01', name: 'Confraternização Universal' },
  { monthDay: '04-21', name: 'Tiradentes' },
  { monthDay: '05-01', name: 'Dia do Trabalho' },
  { monthDay: '09-07', name: 'Independência do Brasil' },
  { monthDay: '10-12', name: 'Nossa Senhora Aparecida' },
  { monthDay: '11-02', name: 'Finados' },
  { monthDay: '11-15', name: 'Proclamação da República' },
  { monthDay: '12-25', name: 'Natal' },
];

/**
 * Ponte pedida: feriado na quinta (inclui sexta), na sexta,
 * na segunda (sai na sexta) e na terça (sai no sábado, segunda é ponte).
 */
const BRIDGE_BY_WEEKDAY: Record<number, (holiday: Holiday) => HolidayWindow> = {
  1: (holiday) => toWindow(holiday, addDays(holiday.date, -3), holiday.date),
  2: (holiday) => toWindow(holiday, addDays(holiday.date, -3), holiday.date),
  4: (holiday) => toWindow(holiday, holiday.date, addDays(holiday.date, 3)),
  5: (holiday) => toWindow(holiday, holiday.date, addDays(holiday.date, 2)),
};

export function easterDate(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function listHolidayBridges(start: string, end: string): HolidayWindow[] {
  if (!start || !end || start > end) return [];
  const startYear = Number(start.slice(0, 4));
  const endYear = Number(end.slice(0, 4));
  const windows: HolidayWindow[] = [];
  for (let year = startYear; year <= endYear; year += 1) {
    for (const holiday of holidaysForYear(year)) {
      const bridge = bridgeForHoliday(holiday);
      if (!bridge) continue;
      if (bridge.returnDate < start || bridge.departureDate > end) continue;
      windows.push(bridge);
    }
  }
  return windows.sort((left, right) => left.departureDate.localeCompare(right.departureDate));
}

function holidaysForYear(year: number): Holiday[] {
  const easter = easterDate(year);
  const fixed = FIXED_HOLIDAYS.map((holiday) => ({
    date: `${year}-${holiday.monthDay}`,
    name: holiday.name,
  }));
  const movable: Holiday[] = [
    { date: addDays(easter, -48), name: 'Carnaval (segunda)' },
    { date: addDays(easter, -47), name: 'Carnaval (terça)' },
    { date: addDays(easter, -2), name: 'Sexta-feira Santa' },
    { date: addDays(easter, 60), name: 'Corpus Christi' },
  ];
  return [...fixed, ...movable];
}

function bridgeForHoliday(holiday: Holiday): HolidayWindow | null {
  const build = BRIDGE_BY_WEEKDAY[weekday(holiday.date)];
  if (!build) return null;
  return build(holiday);
}

function toWindow(holiday: Holiday, departureDate: string, returnDate: string): HolidayWindow {
  return {
    holidayDate: holiday.date,
    holidayName: holiday.name,
    departureDate,
    returnDate,
  };
}

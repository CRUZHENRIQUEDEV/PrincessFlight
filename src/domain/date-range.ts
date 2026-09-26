// Versão: 1.0
import { addDays, weekday } from './iso-date';

export type RangeEdge = 'start' | 'end';

export interface CalendarCell {
  iso: string;
  inMonth: boolean;
}

export interface MonthCursor {
  year: number;
  month: number;
}

export function monthMatrix(year: number, month: number): CalendarCell[] {
  const first = `${year}-${pad(month)}-01`;
  const start = addDays(first, -weekday(first));
  return Array.from({ length: 42 }, (_, index) => {
    const iso = addDays(start, index);
    return { iso, inMonth: Number(iso.slice(5, 7)) === month };
  });
}

export function shiftMonth(cursor: MonthCursor, delta: number): MonthCursor {
  const date = new Date(Date.UTC(cursor.year, cursor.month - 1 + delta, 1));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

export function monthTitle(cursor: MonthCursor): string {
  const title = new Intl.DateTimeFormat('pt-BR', { month: 'long', timeZone: 'UTC' })
    .format(new Date(Date.UTC(cursor.year, cursor.month - 1, 1)));
  return title.toLocaleLowerCase('pt-BR');
}

export function cursorFromIso(iso: string): MonthCursor {
  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7));
  if (!year || !month) {
    const today = new Date();
    return { year: today.getFullYear(), month: today.getMonth() + 1 };
  }
  return { year, month };
}

export function formatRangeLabel(start: string, end: string): string {
  if (!start && !end) return 'Qualquer data';
  if (start && end) return `${formatDay(start)} – ${formatDay(end)}`;
  return formatDay(start || end);
}

export function formatDay(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  if (!year || !month || !day) return iso;
  return new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short' }).format(new Date(year, month - 1, day));
}

export function pickRangeDay(start: string, end: string, iso: string, edge: RangeEdge): { start: string; end: string; edge: RangeEdge } {
  if (edge === 'start' || !start) {
    return { start: iso, end: end && end >= iso ? end : '', edge: 'end' };
  }
  if (iso < start) return { start: iso, end: start, edge: 'end' };
  return { start, end: iso, edge: 'end' };
}

function pad(month: number): string {
  return String(month).padStart(2, '0');
}

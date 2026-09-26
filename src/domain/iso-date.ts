// Versão: 1.0

/** Soma dias civis sem deslocar a data por fuso horário. */
export function addDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** 0 = domingo … 6 = sábado. */
export function weekday(isoDate: string): number {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function calendarDay(isoDateTime: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(isoDateTime);
  return match?.[1] ?? '';
}

export function todayIso(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Meses YYYY-MM inclusivos. Trava em 24 para um intervalo acidental enorme. */
export function listMonths(start: string, end: string): string[] {
  if (!start || !end || start > end) return [];
  const months: string[] = [];
  let cursor = start.slice(0, 7);
  const last = end.slice(0, 7);
  while (cursor <= last && months.length < 24) {
    months.push(cursor);
    cursor = nextMonth(cursor);
  }
  return months;
}

function nextMonth(yearMonth: string): string {
  const [year, month] = yearMonth.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, 1));
  date.setUTCMonth(date.getUTCMonth() + 1);
  const nextYear = date.getUTCFullYear();
  const nextMonthNumber = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${nextYear}-${nextMonthNumber}`;
}

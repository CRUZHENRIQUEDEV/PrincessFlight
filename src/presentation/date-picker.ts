// Versão: 1.0
import {
  cursorFromIso,
  formatDay,
  formatRangeLabel,
  monthMatrix,
  monthTitle,
  pickRangeDay,
  shiftMonth,
  type MonthCursor,
  type RangeEdge,
} from '../domain/date-range';
import { tomorrowIso } from '../domain/iso-date';

const WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

export function bindDatePicker(doc: Document): void {
  const open = doc.getElementById('date-open');
  const popover = doc.getElementById('date-popover');
  const months = doc.getElementById('date-months');
  if (!(open instanceof HTMLButtonElement) || !popover || !months) return;
  const state = {
    cursor: cursorFromIso(value(doc, 'date-start') || tomorrowIso()),
    edge: 'start' as RangeEdge,
  };
  open.addEventListener('click', () => toggle(doc, popover, open, months, state));
  doc.getElementById('date-prev')?.addEventListener('click', () => move(doc, months, state, -1));
  doc.getElementById('date-next')?.addEventListener('click', () => move(doc, months, state, 1));
  doc.getElementById('date-reset')?.addEventListener('click', () => reset(doc, months, state));
  doc.getElementById('date-done')?.addEventListener('click', () => close(popover, open));
  months.addEventListener('click', (event) => choose(doc, months, state, event));
  doc.addEventListener('click', (event) => {
    if (!(event.target instanceof Node) || popover.hidden) return;
    if (popover.contains(event.target) || open.contains(event.target)) return;
    close(popover, open);
  });
  syncDatePicker(doc);
}

export function syncDatePicker(doc: Document): void {
  const open = doc.getElementById('date-open');
  if (!(open instanceof HTMLButtonElement)) return;
  const start = value(doc, 'date-start');
  const end = value(doc, 'date-end');
  open.textContent = start || end ? formatRangeLabel(start, end) : 'Escolha as datas';
}

function toggle(
  doc: Document,
  popover: HTMLElement,
  open: HTMLButtonElement,
  months: HTMLElement,
  state: { cursor: MonthCursor; edge: RangeEdge },
): void {
  const opening = popover.hidden;
  popover.hidden = !opening;
  open.setAttribute('aria-expanded', String(opening));
  if (!opening) return;
  state.cursor = cursorFromIso(value(doc, 'date-start') || tomorrowIso());
  state.edge = value(doc, 'date-start') && !value(doc, 'date-end') ? 'end' : 'start';
  paint(doc, months, state.cursor);
}

function move(
  doc: Document,
  months: HTMLElement,
  state: { cursor: MonthCursor; edge: RangeEdge },
  delta: number,
): void {
  const next = shiftMonth(state.cursor, delta);
  const minimum = cursorFromIso(tomorrowIso());
  if (delta < 0 && monthIndex(next) < monthIndex(minimum)) return;
  state.cursor = next;
  paint(doc, months, state.cursor);
}

function reset(
  doc: Document,
  months: HTMLElement,
  state: { cursor: MonthCursor; edge: RangeEdge },
): void {
  write(doc, '', '');
  state.edge = 'start';
  state.cursor = cursorFromIso(tomorrowIso());
  paint(doc, months, state.cursor);
}

function choose(
  doc: Document,
  months: HTMLElement,
  state: { cursor: MonthCursor; edge: RangeEdge },
  event: Event,
): void {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement) || !target.dataset.iso || target.disabled) return;
  const picked = pickRangeDay(value(doc, 'date-start'), value(doc, 'date-end'), target.dataset.iso, state.edge);
  state.edge = picked.edge;
  write(doc, picked.start, picked.end);
  paint(doc, months, state.cursor);
}

function close(popover: HTMLElement, open: HTMLButtonElement): void {
  popover.hidden = true;
  open.setAttribute('aria-expanded', 'false');
}

function paint(doc: Document, months: HTMLElement, cursor: MonthCursor): void {
  const start = value(doc, 'date-start');
  const end = value(doc, 'date-end');
  const minimum = tomorrowIso();
  months.replaceChildren(monthView(cursor, start, end, minimum), monthView(shiftMonth(cursor, 1), start, end, minimum));
}

function monthView(cursor: MonthCursor, start: string, end: string, minimum: string): HTMLElement {
  const section = document.createElement('section');
  section.className = 'date-month';
  const title = document.createElement('p');
  title.className = 'date-month__title';
  title.textContent = `${monthTitle(cursor)} ${cursor.year}`;
  const grid = document.createElement('div');
  grid.className = 'date-grid';
  for (const label of WEEKDAYS) grid.append(weekday(label));
  for (const cell of monthMatrix(cursor.year, cursor.month)) grid.append(dayButton(cell.iso, cell.inMonth, start, end, minimum));
  section.append(title, grid);
  return section;
}

function weekday(label: string): HTMLSpanElement {
  const span = document.createElement('span');
  span.className = 'date-grid__weekday';
  span.textContent = label;
  return span;
}

function dayButton(iso: string, inMonth: boolean, start: string, end: string, minimum: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = dayClass(iso, inMonth, start, end);
  button.textContent = iso.slice(8, 10).replace(/^0/, '');
  button.dataset.iso = iso;
  button.disabled = !inMonth || iso < minimum;
  if (iso === start) button.setAttribute('aria-label', `Partida ${formatDay(iso)}`);
  if (iso === end) button.setAttribute('aria-label', `Volta ${formatDay(iso)}`);
  return button;
}

function dayClass(iso: string, inMonth: boolean, start: string, end: string): string {
  const classes = ['date-day'];
  if (!inMonth) classes.push('date-day--outside');
  if (start && iso === start) classes.push('date-day--edge');
  if (end && iso === end) classes.push('date-day--edge');
  if (start && end && iso > start && iso < end) classes.push('date-day--range');
  return classes.join(' ');
}

function write(doc: Document, start: string, end: string): void {
  setValue(doc, 'date-start', start);
  setValue(doc, 'date-end', end);
  syncDatePicker(doc);
  doc.getElementById('date-start')?.dispatchEvent(new Event('input', { bubbles: true }));
}

function value(doc: Document, id: string): string {
  const input = doc.getElementById(id);
  return input instanceof HTMLInputElement ? input.value : '';
}

function setValue(doc: Document, id: string, next: string): void {
  const input = doc.getElementById(id);
  if (input instanceof HTMLInputElement) input.value = next;
}

function monthIndex(cursor: MonthCursor): number {
  return cursor.year * 12 + cursor.month;
}

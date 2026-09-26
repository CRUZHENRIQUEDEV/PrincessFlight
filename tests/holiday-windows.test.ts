// Versão: 1.0
import { describe, expect, it } from 'vitest';
import { addDays, calendarDay, listMonths, weekday } from '../src/domain/iso-date';
import { easterDate, listHolidayBridges } from '../src/domain/holiday-windows';

describe('datas civis', () => {
  it('soma dias atravessando o mês', () => {
    expect(addDays('2026-01-30', 3)).toBe('2026-02-02');
  });

  it('lê o dia civil do horário com fuso', () => {
    expect(calendarDay('2026-11-18T19:25:00-03:00')).toBe('2026-11-18');
  });

  it('lista os meses inclusivos, inclusive na virada do ano', () => {
    expect(listMonths('2026-11-20', '2027-01-02')).toEqual(['2026-11', '2026-12', '2027-01']);
  });

  it('não lista mês quando o fim é anterior ao início', () => {
    expect(listMonths('2026-12-01', '2026-11-01')).toEqual([]);
  });
});

describe('pontes de feriado', () => {
  it('calcula a Páscoa conhecida', () => {
    expect(easterDate(2024)).toBe('2024-03-31');
    expect(easterDate(2025)).toBe('2025-04-20');
    expect(easterDate(2026)).toBe('2026-04-05');
  });

  it('trata 1º de janeiro de 2026 como quinta, com volta no domingo', () => {
    expect(weekday('2026-01-01')).toBe(4);
    const windows = listHolidayBridges('2026-01-01', '2026-01-04');
    expect(windows[0]).toMatchObject({
      holidayName: 'Confraternização Universal',
      departureDate: '2026-01-01',
      returnDate: '2026-01-04',
    });
  });

  it('monta a ponte de Corpus Christi e do Carnaval de terça em 2026', () => {
    const corpus = addDays(easterDate(2026), 60);
    expect(corpus).toBe('2026-06-04');
    expect(weekday(corpus)).toBe(4);
    const corpusWindows = listHolidayBridges('2026-06-01', '2026-06-10');
    expect(corpusWindows).toContainEqual(expect.objectContaining({
      holidayName: 'Corpus Christi',
      departureDate: '2026-06-04',
      returnDate: '2026-06-07',
    }));

    const tuesday = addDays(easterDate(2026), -47);
    const carnival = listHolidayBridges(tuesday, tuesday);
    expect(carnival).toContainEqual(expect.objectContaining({
      holidayName: 'Carnaval (terça)',
      departureDate: addDays(tuesday, -3),
      returnDate: tuesday,
    }));
  });

  it('ignora feriado fora de quinta, sexta, segunda e terça', () => {
    const day = weekday('2026-04-21');
    const windows = listHolidayBridges('2026-04-21', '2026-04-21');
    const tiradentes = windows.find((window) => window.holidayName === 'Tiradentes');
    const isBridgeDay = day === 1 || day === 2 || day === 4 || day === 5;
    expect(Boolean(tiradentes)).toBe(isBridgeDay);
  });
});

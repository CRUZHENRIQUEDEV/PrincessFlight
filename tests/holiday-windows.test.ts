// Versão: 1.1
import { describe, expect, it } from 'vitest';
import { applyOfferFilters } from '../src/domain/filters';
import { addDays, calendarDay, listMonths, weekday } from '../src/domain/iso-date';
import { buildSearchPlan } from '../src/domain/search-plan';
import { easterDate, listHolidayBridges, matchesBridgeTrip } from '../src/domain/holiday-windows';
import { sampleAirports, sampleCriteria, sampleOffer } from './fixtures';

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

  it('trata 1º de janeiro de 2026 como quinta: sai na véspera e desembarca segunda de manhã', () => {
    expect(weekday('2026-01-01')).toBe(4);
    const windows = listHolidayBridges('2026-01-01', '2026-01-04');
    expect(windows[0]).toMatchObject({
      holidayName: 'Confraternização Universal',
      departureDate: '2025-12-31',
      returnDate: '2026-01-05',
    });
  });

  it('monta a ponte de Corpus Christi e do Carnaval de terça em 2026', () => {
    const corpus = addDays(easterDate(2026), 60);
    expect(corpus).toBe('2026-06-04');
    expect(weekday(corpus)).toBe(4);
    const corpusWindows = listHolidayBridges('2026-06-01', '2026-06-10');
    expect(corpusWindows).toContainEqual(expect.objectContaining({
      holidayName: 'Corpus Christi',
      departureDate: '2026-06-03',
      returnDate: '2026-06-08',
    }));

    const tuesday = addDays(easterDate(2026), -47);
    const carnival = listHolidayBridges(tuesday, tuesday);
    expect(carnival).toContainEqual(expect.objectContaining({
      holidayName: 'Carnaval (terça)',
      departureDate: addDays(tuesday, -4),
      returnDate: addDays(tuesday, 1),
    }));
  });

  it('aceita quarta no fim da tarde e desembarque na segunda de manhã', () => {
    const windows = listHolidayBridges('2026-01-01', '2026-01-04');
    const bridge = windows[0];
    if (!bridge) throw new Error('ponte de ano-novo ausente');
    const fit = sampleOffer({
      departureAt: '2025-12-31T18:40:00-03:00',
      returnAt: '2026-01-04T22:10:00-03:00',
      durationBackMinutes: 480,
    });
    const early = sampleOffer({
      departureAt: '2025-12-31T14:00:00-03:00',
      returnAt: '2026-01-05T08:00:00-03:00',
    });
    const lateLanding = sampleOffer({
      departureAt: '2025-12-31T19:00:00-03:00',
      returnAt: '2026-01-05T08:00:00-03:00',
      durationBackMinutes: 300,
    });
    expect(matchesBridgeTrip(fit, bridge)).toBe(true);
    expect(matchesBridgeTrip(early, bridge)).toBe(false);
    expect(matchesBridgeTrip(lateLanding, bridge)).toBe(false);
    const kept = applyOfferFilters([fit, early, lateLanding], sampleCriteria({
      holidayBridgeOnly: true,
      departureStart: '2026-01-01',
      departureEnd: '2026-01-04',
    }), windows);
    expect(kept).toEqual([fit]);
    const plan = buildSearchPlan(sampleCriteria({
      holidayBridgeOnly: true,
      departureStart: '2026-01-01',
      departureEnd: '2026-01-31',
      coastalOnly: false,
      states: ['BA'],
    }), sampleAirports());
    expect(plan.months).toContain('2025-12');
  });

  it('ignora feriado fora de quinta, sexta, segunda e terça', () => {
    const day = weekday('2026-04-21');
    const windows = listHolidayBridges('2026-04-21', '2026-04-21');
    const tiradentes = windows.find((window) => window.holidayName === 'Tiradentes');
    const isBridgeDay = day === 1 || day === 2 || day === 4 || day === 5;
    expect(Boolean(tiradentes)).toBe(isBridgeDay);
  });
});

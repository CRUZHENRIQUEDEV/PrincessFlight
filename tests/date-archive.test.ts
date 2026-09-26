// Versão: 1.0
import { describe, expect, it } from 'vitest';
import { formatRangeLabel, pickRangeDay } from '../src/domain/date-range';
import { mergeOffers } from '../src/domain/offer-archive';
import { tomorrowIso } from '../src/domain/iso-date';
import { sampleOffer } from './fixtures';

describe('calendário e arquivo de preços', () => {
  it('marca a volta e formata o intervalo', () => {
    expect(tomorrowIso('2026-09-26')).toBe('2026-09-27');
    const picked = pickRangeDay('2026-11-01', '', '2026-11-20', 'end');
    expect(picked).toEqual({ start: '2026-11-01', end: '2026-11-20', edge: 'end' });
    expect(formatRangeLabel('2026-11-01', '2026-11-20')).toMatch(/nov/);
  });

  it('guarda o preço antigo quando chega um novo', () => {
    const older = sampleOffer({ id: 'antigo', fetchedAt: '2026-09-01T00:00:00Z' });
    const newer = sampleOffer({ id: 'novo', fetchedAt: '2026-09-20T00:00:00Z' });
    expect(mergeOffers([older], [newer]).map((offer) => offer.id)).toEqual(['novo', 'antigo']);
  });
});

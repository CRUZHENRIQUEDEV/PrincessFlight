// Versão: 1.0
import { describe, expect, it } from 'vitest';
import { cityCode, connectionHubs } from '../src/domain/connection-hubs';
import { assembleSelfConnect, freshLegs, legFromOffer, selfConnectWarning } from '../src/domain/self-connect';
import { cacheCityCode } from '../src/infrastructure/travelpayouts-client';
import { sampleOffer } from './fixtures';

const NOW = '2026-09-26T14:00:00Z';

describe('montagem de duas passagens', () => {
  it('soma a escala que encaixa e ignora a conexão curta', () => {
    const home = legFromOffer(sampleOffer({
      origin: 'BSB',
      destination: 'SAO',
      price: 800,
      departureAt: '2026-11-10T10:00:00Z',
      returnAt: '2026-11-20T18:00:00Z',
      durationToMinutes: 120,
      durationBackMinutes: 120,
    }));
    const away = legFromOffer(sampleOffer({
      origin: 'SAO',
      destination: 'MAD',
      price: 1400,
      departureAt: '2026-11-10T16:00:00Z',
      returnAt: '2026-11-20T10:00:00Z',
      durationToMinutes: 120,
      durationBackMinutes: 120,
    }));
    const tight = legFromOffer(sampleOffer({
      origin: 'SAO',
      destination: 'MAD',
      price: 900,
      departureAt: '2026-11-10T12:30:00Z',
      returnAt: '2026-11-20T10:00:00Z',
      durationToMinutes: 120,
      durationBackMinutes: 120,
    }));
    if (!home || !away || !tight) throw new Error('perna sem volta');
    const offer = assembleSelfConnect('BSB', 'MAD', [
      { hub: 'SAO', home, away: tight },
      { hub: 'SAO', home, away },
    ], NOW);
    expect(offer?.price).toBe(2200);
    expect(offer?.selfConnect?.hub).toBe('SAO');
    expect(offer?.transfers).toBe(1);
    expect(selfConnectWarning('São Paulo')).toMatch(/duas passagens separadas/i);
  });

  it('sem duração, a segunda passagem só vale no dia seguinte', () => {
    const home = legFromOffer(sampleOffer({
      origin: 'BSB',
      destination: 'LIS',
      price: 1000,
      departureAt: '2026-11-10T22:00:00Z',
      returnAt: '2026-11-21T08:00:00Z',
      durationToMinutes: null,
      durationBackMinutes: null,
    }));
    const sameDay = legFromOffer(sampleOffer({
      origin: 'LIS',
      destination: 'MAD',
      price: 200,
      departureAt: '2026-11-10T23:00:00Z',
      returnAt: '2026-11-20T12:00:00Z',
      durationToMinutes: null,
      durationBackMinutes: null,
    }));
    const nextDay = legFromOffer(sampleOffer({
      origin: 'LIS',
      destination: 'MAD',
      price: 300,
      departureAt: '2026-11-11T08:00:00Z',
      returnAt: '2026-11-20T12:00:00Z',
      durationToMinutes: null,
      durationBackMinutes: null,
    }));
    if (!home || !sameDay || !nextDay) throw new Error('perna sem volta');
    expect(assembleSelfConnect('BSB', 'MAD', [{ hub: 'LIS', home, away: sameDay }], NOW)).toBeNull();
    expect(assembleSelfConnect('BSB', 'MAD', [{ hub: 'LIS', home, away: nextDay }], NOW)?.price).toBe(1300);
  });

  it('não usa a própria origem como escala e agrupa Guarulhos com São Paulo', () => {
    expect(connectionHubs('BSB', 'MAD')).not.toContain('MAD');
    expect(connectionHubs('GRU', 'LIS')).not.toContain('SAO');
    for (const code of ['GIG', 'SDU', 'GRU', 'CGH', 'VCP', 'CNF', 'PLU', 'BSB', 'MAD', 'SAO']) {
      expect(cityCode(code)).toBe(cacheCityCode(code));
    }
    const stored = [
      sampleOffer({ origin: 'GRU', destination: 'MAD', fetchedAt: '2026-09-26T13:30:00Z', returnAt: '2026-11-20T10:00:00Z' }),
    ];
    expect(freshLegs(stored, 'SAO', 'MAD', NOW, 60 * 60 * 1000)).toHaveLength(1);
  });
});

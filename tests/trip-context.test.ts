// Versão: 1.0
import { describe, expect, it } from 'vitest';
import { climateWindow, describeClimate, distanceKm, estimateBlockMinutes, formatMinutes, greatCircle } from '../src/domain/flight-path';
import { googlePlaceSearchUrl, readClimateDays, readPlaceSpots } from '../src/domain/place-notes';

const brasilia = { latitude: -15.8711, longitude: -47.9186 };
const salvador = { latitude: -12.9086, longitude: -38.3225 };

describe('trajeto, clima e pontos', () => {
  it('desenha o arco e estima o tempo de voo', () => {
    const arc = greatCircle(brasilia, salvador, 8);
    expect(arc[0][0]).toBeCloseTo(brasilia.latitude, 4);
    expect(arc.at(-1)?.[1]).toBeCloseTo(salvador.longitude, 4);
    expect(arc.length).toBe(9);
    const distance = distanceKm(brasilia, salvador);
    expect(distance).toBeGreaterThan(900);
    expect(distance).toBeLessThan(1300);
    expect(formatMinutes(estimateBlockMinutes(distance, 1))).toMatch(/h/);
  });

  it('usa o mesmo mês do ano anterior quando a viagem ainda não chegou', () => {
    const window = climateWindow('2026-11-27T09:50:00-03:00', '2026-09-26');
    expect(window).toMatchObject({ start: '2025-11-01', end: '2025-11-30', year: 2025, monthLabel: 'novembro' });
    expect(describeClimate('Salvador', window!, 27.2, 23.1, 31.4, 82)).toMatch(/Novembro em Salvador/);
  });

  it('lê o clima e os pontos nomeados', () => {
    const days = readClimateDays({
      daily: {
        temperature_2m_mean: [26, 28],
        temperature_2m_min: [22, 23],
        temperature_2m_max: [30, 32],
        precipitation_sum: [10, 5],
      },
    });
    expect(days).toEqual({ mean: 27, min: 22, max: 32, rain: 15 });
    const spots = readPlaceSpots({
      elements: [
        { type: 'node', id: 10, tags: { name: 'Pelourinho', tourism: 'attraction' } },
        { type: 'node', id: 10, tags: { name: 'Pelourinho', tourism: 'attraction' } },
        { type: 'way', id: 20, tags: { name: 'Farol da Barra', leisure: 'park' } },
      ],
    });
    expect(spots.map((spot) => spot.name)).toEqual(['Pelourinho', 'Farol da Barra']);
    expect(googlePlaceSearchUrl(['Salvador', 'Bahia', 'Brasil'])).toBe('https://www.google.com/search?q=Salvador%20Bahia%20Brasil');
    expect(googlePlaceSearchUrl(['  Lisboa ', '', 'Portugal'])).toBe('https://www.google.com/search?q=Lisboa%20Portugal');
    expect(spots[0]?.href).toBe('https://www.openstreetmap.org/node/10');
    expect(spots[1]?.kind).toBe('Parque');
  });
});

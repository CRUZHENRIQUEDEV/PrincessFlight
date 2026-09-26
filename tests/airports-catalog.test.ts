// Versão: 1.0
import { describe, expect, it } from 'vitest';
import { AIRPORTS } from '../src/data/airports';

const COASTAL_STATES = new Set(['AP', 'PA', 'MA', 'PI', 'CE', 'RN', 'PB', 'PE', 'AL', 'SE', 'BA', 'ES', 'RJ', 'SP', 'PR', 'SC', 'RS']);

describe('catálogo de aeroportos', () => {
  it('não repete código e mantém o litoral em estado com costa', () => {
    const codes = AIRPORTS.map((airport) => airport.iata);
    expect(new Set(codes).size).toBe(codes.length);
    const noronha = AIRPORTS.find((airport) => airport.iata === 'FEN');
    const guarulhos = AIRPORTS.find((airport) => airport.iata === 'GRU');
    expect(noronha?.coastal).toBe(true);
    expect(guarulhos?.coastal).toBe(false);
    for (const airport of AIRPORTS) {
      expect(airport.latitude).toBeGreaterThan(-60);
      expect(airport.latitude).toBeLessThan(70);
      if (airport.coastal) expect(COASTAL_STATES.has(airport.state)).toBe(true);
    }
  });
});

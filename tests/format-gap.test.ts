// Versão: 1.1
import { describe, expect, it } from 'vitest';
import { formatFoundAt, formatGap, formatWhen } from '../src/presentation/format';

describe('texto da distância até a mediana', () => {
  it('descreve abaixo, acima, na mediana e oferta única', () => {
    expect(formatGap(0.32)).toBe('32% abaixo da mediana');
    expect(formatGap(-0.18)).toBe('18% acima da mediana');
    expect(formatGap(0)).toBe('Na mediana');
    expect(formatGap(null)).toBe('Oferta única neste destino');
  });

  it('mostra o dia da semana junto da data', () => {
    expect(formatWhen('2026-10-20T06:25:00-03:00')).toBe('terça-feira, 20/10/2026, 06:25');
    expect(formatWhen('2026-10-23T22:05:00-03:00')).toBe('sexta-feira, 23/10/2026, 22:05');
    expect(formatFoundAt('2026-10-20')).toBe('terça-feira, 20/10/2026');
  });
});

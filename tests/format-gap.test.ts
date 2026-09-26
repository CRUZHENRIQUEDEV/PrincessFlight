// Versão: 1.0
import { describe, expect, it } from 'vitest';
import { formatGap } from '../src/presentation/format';

describe('texto da distância até a mediana', () => {
  it('descreve abaixo, acima, na mediana e oferta única', () => {
    expect(formatGap(0.32)).toBe('32% abaixo da mediana');
    expect(formatGap(-0.18)).toBe('18% acima da mediana');
    expect(formatGap(0)).toBe('Na mediana');
    expect(formatGap(null)).toBe('Oferta única neste destino');
  });
});

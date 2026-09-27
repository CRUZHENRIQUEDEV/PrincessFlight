// Versão: 1.0
import { describe, expect, it } from 'vitest';
import { returnSpan } from '../src/domain/date-range';

describe('volta a partir dos dias da viagem', () => {
  it('soma os dias na ida e no fim do intervalo', () => {
    expect(returnSpan('2026-11-01', '2026-11-30', 7)).toEqual({
      returnStart: '2026-11-08',
      returnEnd: '2026-12-07',
    });
    expect(returnSpan('2026-11-01', '2026-11-01', 7)).toEqual({
      returnStart: '2026-11-08',
      returnEnd: '2026-11-08',
    });
    expect(returnSpan('', '2026-11-30', 7)).toBeNull();
  });
});

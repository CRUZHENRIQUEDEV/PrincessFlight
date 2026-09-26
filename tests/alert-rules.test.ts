// Versão: 1.0
import { describe, expect, it } from 'vitest';
import { offersForAlert, parseAlertRules } from '../src/domain/alert-rules';
import { sampleOffer } from './fixtures';

describe('alerta sonoro', () => {
  it('aceita percentual e teto de preço', () => {
    const parsed = parseAlertRules({ enabled: true, minPercentBelow: '40', maxPrice: '900' });
    expect(parsed.fieldError).toBeNull();
    expect(parsed.rules).toEqual({ enabled: true, minPercentBelow: 40, maxPrice: 900 });
  });

  it('rejeita percentual fora da faixa', () => {
    expect(parseAlertRules({ enabled: true, minPercentBelow: '3', maxPrice: '' }).fieldError).toContain('5 e 90');
  });

  it('escolhe só oferta nova, abaixo da mediana e dentro do teto', () => {
    const rules = { enabled: true, minPercentBelow: 30, maxPrice: 500 };
    const heard = new Set(['ja-ouvi']);
    const offers = [
      sampleOffer({ id: 'boa', price: 400, gapRatio: 0.4, referencePrice: 667 }),
      sampleOffer({ id: 'cara', price: 800, gapRatio: 0.4, referencePrice: 1333 }),
      sampleOffer({ id: 'pouco', price: 400, gapRatio: 0.1, referencePrice: 444 }),
      sampleOffer({ id: 'sozinha', price: 100, gapRatio: null, referencePrice: null }),
      sampleOffer({ id: 'ja-ouvi', price: 300, gapRatio: 0.5, referencePrice: 600 }),
    ];
    expect(offersForAlert(offers, rules, heard).map((offer) => offer.id)).toEqual(['boa']);
  });

  it('não escolhe nada com o som desligado', () => {
    const offer = sampleOffer({ id: 'boa', gapRatio: 0.5, referencePrice: 800 });
    expect(offersForAlert([offer], { enabled: false, minPercentBelow: 30, maxPrice: null }, new Set())).toEqual([]);
  });
});

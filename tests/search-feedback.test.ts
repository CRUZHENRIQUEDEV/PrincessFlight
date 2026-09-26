// Versão: 1.1
import { describe, expect, it } from 'vitest';
import { formatPrice } from '../src/presentation/format';
import { describeConsulting, describeRoute, formatMonthLabel } from '../src/presentation/search-feedback';
import { sampleOffer } from './fixtures';

describe('relato da busca', () => {
  it('explica a consulta, a oferta nova e a rota vazia', () => {
    expect(formatMonthLabel('2026-11')).toBe('nov/2026');
    expect(describeConsulting({ completedCalls: 2, totalCalls: 16, city: 'Lisboa', month: '2026-11' }))
      .toBe('Consultando 3 de 16 · Lisboa · nov/2026');
    expect(describeRoute({
      completedCalls: 3,
      totalCalls: 16,
      city: 'Lisboa',
      month: '2026-11',
      foundNow: 2,
      totalOffers: 4,
      cheapest: sampleOffer({ price: 1200, airline: 'AD', currency: 'BRL' }),
      error: null,
    })).toBe(`3 de 16 · Lisboa · nov/2026 · 2 ofertas novas · a partir de ${formatPrice(1200, 'BRL')} (Azul (AD)) · 4 ofertas no total`);
    expect(describeRoute({
      completedCalls: 4,
      totalCalls: 16,
      city: 'Lisboa',
      month: '2026-12',
      foundNow: 0,
      totalOffers: 4,
      cheapest: null,
      error: null,
    })).toBe('4 de 16 · Lisboa · dez/2026 · nenhum preço guardado neste mês; a API só devolve tarifas que alguém já buscou · 4 ofertas no total');
    expect(describeRoute({
      completedCalls: 1,
      totalCalls: 2,
      city: 'Salvador',
      month: '2026-11',
      foundNow: 1,
      totalOffers: 1,
      cheapest: sampleOffer(),
      error: null,
      reused: true,
    })).toBe('1 de 2 · Salvador · nov/2026 · 1 oferta já salva neste navegador · 1 oferta no total');
  });
});

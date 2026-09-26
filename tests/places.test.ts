// Versão: 1.0
import { describe, expect, it } from 'vitest';
import { placeCaption, placeOf } from '../src/data/places';

describe('cidade e país', () => {
  it('traduz o código da cidade', () => {
    expect(placeOf('BHZ')).toEqual({ city: 'Belo Horizonte', country: 'Brasil' });
    expect(placeOf('lon')).toEqual({ city: 'Londres', country: 'Reino Unido' });
    expect(placeCaption('SAO')).toBe('São Paulo, Brasil');
  });

  it('devolve nulo quando o código não existe', () => {
    expect(placeOf('ZZZZ')).toBeNull();
    expect(placeCaption('ZZZZ', 'código')).toBe('código');
  });
});

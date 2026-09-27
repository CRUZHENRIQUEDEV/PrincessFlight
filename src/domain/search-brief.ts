// Versão: 1.7
import { placeOf } from '../data/places';
import type { Airport, FlightOffer } from './types';
import type { SavedSearch } from './saved-search';

export interface BriefLine {
  label: string;
  value: string;
}

export interface DestinationPrice {
  iata: string;
  city: string;
  offer: FlightOffer | null;
}

export interface SearchBrief {
  title: string;
  lines: BriefLine[];
  destinations: DestinationPrice[];
  removable: boolean;
}

export function buildSearchBrief(
  search: SavedSearch,
  airports: readonly Airport[],
  storedOffers: readonly FlightOffer[] = [],
): SearchBrief {
  const origin = airports.find((airport) => airport.iata === search.criteria.originIata);
  const cheapest = [...search.offers].sort((left, right) => left.price - right.price)[0] ?? null;
  const favorites = search.mode === 'favorites';
  const anywhere = search.mode === 'anywhere';
  const lines: BriefLine[] = [
    { label: 'Tipo', value: favorites ? 'Destinos favoritos' : anywhere ? 'Voos baratos' : 'Filtros' },
    { label: 'Situação', value: search.running ? 'Rodando' : 'Parada' },
    { label: 'Último aviso', value: search.lastStatus || 'Sem aviso.' },
    { label: 'Atualizada', value: search.updatedAt },
    { label: 'Origem', value: origin ? `${origin.city} · ${origin.name} (${origin.iata})` : search.criteria.originIata },
    { label: 'Ofertas guardadas', value: String(search.offers.length) },
    { label: 'Menor preço', value: cheapest ? `${cheapest.price} ${cheapest.currency}` : 'ainda sem preço' },
    { label: 'Pausa', value: `${search.criteria.delayBetweenCallsSeconds} s` },
    { label: 'Repetição', value: search.criteria.repeatEveryMinutes < 1 ? '15 min em segundo plano' : `${search.criteria.repeatEveryMinutes} min` },
    { label: 'Alerta', value: search.alertRules.enabled ? `ligado, ${search.alertRules.minPercentBelow}% abaixo` : 'desligado' },
    { label: 'Anotações', value: search.notes.trim() || 'sem anotações' },
  ];
  if (favorites) {
    lines.splice(5, 0, {
      label: 'Como busca',
      value: 'Primeiro o que já está salvo neste navegador. Se a rota inteira não existir, tenta o voo saindo de São Paulo. Se achar, junta com o trecho até São Paulo. Continua sendo duas compras.',
    });
  } else if (anywhere) {
    lines.splice(5, 0, {
      label: 'Como busca',
      value: 'Uma consulta ao cache, qualquer destino e qualquer data. A lista começa pelo menor preço. Rota que ninguém buscou não aparece.',
    });
  } else {
    lines.splice(5, 0,
      { label: 'Datas', value: dateLabel(search) },
      { label: 'Abrangência', value: scopeLabel(search) },
      {
        label: 'Como busca',
        value: 'Cache do Aviasales Brasil. Se o mês estiver vazio, mostra o único preço de qualquer data.',
      },
    );
  }
  return {
    title: search.name,
    lines,
    destinations: cheapestByDestination(search, airports, storedOffers),
    removable: favorites,
  };
}

function dateLabel(search: SavedSearch): string {
  const { departureStart, departureEnd } = search.criteria;
  if (!departureStart && !departureEnd) return 'qualquer data';
  return `${departureStart || '—'} até ${departureEnd || '—'}`;
}

function scopeLabel(search: SavedSearch): string {
  const { scope, coastalOnly, regions, states } = search.criteria;
  const parts = [scope === 'internacional' ? 'internacional' : 'nacional'];
  if (coastalOnly) parts.push('litoral');
  if (regions.length > 0) parts.push(regions.join(', '));
  if (states.length > 0) parts.push(states.join(', '));
  return parts.join(' · ');
}

function cheapestByDestination(search: SavedSearch, airports: readonly Airport[], storedOffers: readonly FlightOffer[]): DestinationPrice[] {
  const codes = search.mode === 'favorites'
    ? search.favoriteDestinations
    : [...new Set(search.offers.map((offer) => offer.destination))];
  const origin = search.criteria.originIata.toUpperCase();
  const pool = [...search.offers, ...storedOffers.filter((offer) => offer.origin === origin)];
  return codes.map((code) => {
    const airport = airports.find((item) => item.iata === code);
    const offer = pool
      .filter((item) => item.destination === code)
      .sort((left, right) => left.price - right.price)[0] ?? null;
    return { iata: code, city: placeOf(code)?.city ?? airport?.city ?? code, offer };
  });
}

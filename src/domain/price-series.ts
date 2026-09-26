// Versão: 1.0
import type { Airport, FlightOffer } from './types';

const MAX_SEPARATE_LINES = 4;

export interface DestinationPriceBar {
  iata: string;
  city: string;
  price: number;
  isBargain: boolean;
}

export interface DeparturePriceLine {
  label: string;
  prices: (number | null)[];
}

export interface PriceChartModel {
  currency: string;
  bars: DestinationPriceBar[];
  dates: string[];
  lines: DeparturePriceLine[];
  collapsedToCheapest: boolean;
}

export function buildPriceChartModel(
  offers: readonly FlightOffer[],
  airports: readonly Airport[],
): PriceChartModel {
  if (offers.length === 0) return emptyModel();
  const cities = new Map(airports.map((airport) => [airport.iata, airport.city]));
  const byDestination = groupByDestination(offers);
  const days = uniqueDays(offers);
  const separate = byDestination.size <= MAX_SEPARATE_LINES;
  return {
    currency: offers[0].currency || 'BRL',
    bars: barsFor(byDestination, cities),
    dates: days.map(formatDay),
    lines: separate ? linesPerDestination(byDestination, days, cities) : [cheapestEachDay(byDestination, days)],
    collapsedToCheapest: !separate,
  };
}

function emptyModel(): PriceChartModel {
  return { currency: 'BRL', bars: [], dates: [], lines: [], collapsedToCheapest: false };
}

function groupByDestination(offers: readonly FlightOffer[]): Map<string, FlightOffer[]> {
  const groups = new Map<string, FlightOffer[]>();
  for (const offer of offers) {
    const group = groups.get(offer.destination) ?? [];
    group.push(offer);
    groups.set(offer.destination, group);
  }
  return groups;
}

function barsFor(groups: Map<string, FlightOffer[]>, cities: Map<string, string>): DestinationPriceBar[] {
  const bars = [...groups.entries()].map(([iata, group]) => {
    const cheapest = group.reduce((best, offer) => (offer.price < best.price ? offer : best));
    return { iata, city: cities.get(iata) ?? iata, price: cheapest.price, isBargain: cheapest.isBargain };
  });
  return bars.sort((left, right) => left.price - right.price || left.city.localeCompare(right.city, 'pt-BR'));
}

function uniqueDays(offers: readonly FlightOffer[]): string[] {
  return [...new Set(offers.map((offer) => departureDay(offer.departureAt)))].sort();
}

function linesPerDestination(
  groups: Map<string, FlightOffer[]>,
  days: readonly string[],
  cities: Map<string, string>,
): DeparturePriceLine[] {
  const ordered = [...groups.keys()].sort((left, right) => cityOf(left, cities).localeCompare(cityOf(right, cities), 'pt-BR'));
  return ordered.map((iata) => ({
    label: cityOf(iata, cities),
    prices: days.map((day) => cheapestOnDay(groups.get(iata) ?? [], day)),
  }));
}

function cheapestEachDay(groups: Map<string, FlightOffer[]>, days: readonly string[]): DeparturePriceLine {
  const offers = [...groups.values()].flat();
  return {
    label: 'Menor preço',
    prices: days.map((day) => cheapestOnDay(offers, day)),
  };
}

function cheapestOnDay(offers: readonly FlightOffer[], day: string): number | null {
  const sameDay = offers.filter((offer) => departureDay(offer.departureAt) === day);
  if (sameDay.length === 0) return null;
  return Math.min(...sameDay.map((offer) => offer.price));
}

function cityOf(iata: string, cities: Map<string, string>): string {
  return cities.get(iata) ?? iata;
}

function departureDay(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function formatDay(isoDay: string): string {
  const [, month, day] = isoDay.split('-');
  if (!month || !day) return isoDay;
  return `${day}/${month}`;
}

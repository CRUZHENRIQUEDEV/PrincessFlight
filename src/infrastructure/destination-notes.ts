// Versão: 1.0
import { climateWindow, describeClimate, type ClimateWindow } from '../domain/flight-path';
import { readClimateDays, readPlaceSpots, type PlaceSpot } from '../domain/place-notes';
import type { Airport } from '../domain/types';

export interface DestinationNotes {
  climate: string;
  places: readonly PlaceSpot[];
  placesNote: string;
}

const CLIMATE_ENDPOINT = 'https://archive-api.open-meteo.com/v1/archive';
const PLACES_ENDPOINT = 'https://overpass-api.de/api/interpreter';

export async function loadDestinationNotes(
  airport: Airport,
  departureAt: string,
  today: string,
  fetchFn: typeof fetch = globalThis.fetch.bind(globalThis),
): Promise<DestinationNotes> {
  const window = climateWindow(departureAt, today);
  const [climate, places] = await Promise.all([
    window ? loadClimate(airport, window, fetchFn) : Promise.resolve('Sem data para consultar o clima.'),
    loadPlaces(airport, fetchFn),
  ]);
  return { climate, places: places.spots, placesNote: places.note };
}

async function loadClimate(airport: Airport, window: ClimateWindow, fetchFn: typeof fetch): Promise<string> {
  const url = climateUrl(airport, window);
  try {
    const response = await fetchFn(url);
    if (!response.ok) return 'O clima não respondeu agora.';
    const days = readClimateDays(await response.json());
    if (!days) return 'O clima não trouxe números para este mês.';
    return describeClimate(airport.city, window, days.mean, days.min, days.max, days.rain);
  } catch {
    return 'O clima não respondeu agora.';
  }
}

async function loadPlaces(airport: Airport, fetchFn: typeof fetch): Promise<{ spots: PlaceSpot[]; note: string }> {
  try {
    const response = await fetchFn(PLACES_ENDPOINT, {
      method: 'POST',
      body: placesQuery(airport.latitude, airport.longitude),
      headers: { 'Content-Type': 'text/plain' },
    });
    if (!response.ok) return { spots: [], note: 'A lista de pontos não respondeu agora.' };
    const spots = readPlaceSpots(await response.json());
    if (spots.length === 0) return { spots: [], note: 'Não achei pontos nomeados perto deste aeroporto.' };
    return { spots, note: 'OpenStreetMap' };
  } catch {
    return { spots: [], note: 'A lista de pontos não respondeu agora.' };
  }
}

function climateUrl(airport: Airport, window: ClimateWindow): string {
  const params = new URLSearchParams({
    latitude: String(airport.latitude),
    longitude: String(airport.longitude),
    start_date: window.start,
    end_date: window.end,
    daily: 'temperature_2m_mean,temperature_2m_max,temperature_2m_min,precipitation_sum',
    timezone: 'America/Sao_Paulo',
  });
  return `${CLIMATE_ENDPOINT}?${params.toString()}`;
}

function placesQuery(latitude: number, longitude: number): string {
  const around = `around:30000,${latitude},${longitude}`;
  const sights = `node["name"]["tourism"~"attraction|museum|viewpoint"](${around})`;
  const beaches = `node["name"]["natural"="beach"](${around})`;
  return `[out:json][timeout:20];(${sights};${beaches};);out 15;`;
}

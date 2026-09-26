// Versão: 1.1

export interface PlaceSpot {
  name: string;
  kind: string;
  href: string;
}

const KINDS: Record<string, string> = {
  attraction: 'Ponto turístico',
  museum: 'Museu',
  viewpoint: 'Mirante',
  gallery: 'Galeria',
  theme_park: 'Parque',
  park: 'Parque',
  beach_resort: 'Lazer',
  nature_reserve: 'Natureza',
  water_park: 'Lazer',
  garden: 'Jardim',
  beach: 'Praia',
};

/** Monta a busca do lugar no Google. Partes vazias ficam de fora. */
export function googlePlaceSearchUrl(parts: readonly string[]): string {
  const query = parts.map((part) => part.trim()).filter((part) => part.length > 0).join(' ');
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

export function readPlaceSpots(body: unknown, limit = 6): PlaceSpot[] {
  const elements = elementsOf(body);
  const spots: PlaceSpot[] = [];
  const seen = new Set<string>();
  for (const element of elements) {
    const spot = toSpot(element);
    if (!spot || seen.has(spot.name.toLowerCase())) continue;
    seen.add(spot.name.toLowerCase());
    spots.push(spot);
    if (spots.length >= limit) break;
  }
  return spots;
}

export function readClimateDays(body: unknown): { mean: number; min: number; max: number; rain: number } | null {
  const daily = dailyOf(body);
  if (!daily) return null;
  const mean = average(numbers(daily.temperature_2m_mean));
  const min = lowest(numbers(daily.temperature_2m_min));
  const max = highest(numbers(daily.temperature_2m_max));
  const rain = sum(numbers(daily.precipitation_sum));
  if (mean === null || min === null || max === null || rain === null) return null;
  return { mean, min, max, rain };
}

function toSpot(value: unknown): PlaceSpot | null {
  const row = asRecord(value);
  const tags = asRecord(row?.tags);
  const name = text(tags?.name);
  const id = text(row?.id);
  const type = text(row?.type);
  if (!row || !name || !id || (type !== 'node' && type !== 'way' && type !== 'relation')) return null;
  const kind = kindOf(tags);
  return { name, kind, href: `https://www.openstreetmap.org/${type}/${id}` };
}

function kindOf(tags: Record<string, unknown> | null): string {
  const tourism = text(tags?.tourism);
  const leisure = text(tags?.leisure);
  const natural = text(tags?.natural);
  return KINDS[tourism] ?? KINDS[leisure] ?? KINDS[natural] ?? 'Lazer';
}

function elementsOf(body: unknown): unknown[] {
  const record = asRecord(body);
  return Array.isArray(record?.elements) ? record.elements : [];
}

function dailyOf(body: unknown): Record<string, unknown> | null {
  return asRecord(asRecord(body)?.daily);
}

function numbers(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is number => typeof item === 'number' && Number.isFinite(item));
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function lowest(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.min(...values);
}

function highest(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.max(...values);
}

function sum(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((total, value) => total + value, 0);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function text(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  return '';
}

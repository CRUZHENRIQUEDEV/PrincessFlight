// Versão: 1.0

/** Hubs grandes. Cada um pode gastar uma chamada, então a lista não é o mundo inteiro. */
export const CONNECTION_HUBS = [
  'SAO',
  'LIS',
  'RIO',
  'MAD',
  'OPO',
  'LON',
  'PAR',
  'MIA',
  'FRA',
  'AMS',
  'IST',
  'DOH',
] as const;

const CITY_OF_AIRPORT: Record<string, string> = {
  GIG: 'RIO',
  SDU: 'RIO',
  GRU: 'SAO',
  CGH: 'SAO',
  VCP: 'SAO',
  CNF: 'BHZ',
  PLU: 'BHZ',
};

/** Mesmo agrupamento do cache da Travelpayouts: Guarulhos consulta como São Paulo. */
export function cityCode(iata: string): string {
  const code = iata.trim().toUpperCase();
  return CITY_OF_AIRPORT[code] ?? code;
}

export function connectionHubs(origin: string, destination: string): string[] {
  const blocked = new Set([
    origin.trim().toUpperCase(),
    destination.trim().toUpperCase(),
    cityCode(origin),
    cityCode(destination),
  ]);
  return CONNECTION_HUBS.filter((hub) => !blocked.has(hub));
}

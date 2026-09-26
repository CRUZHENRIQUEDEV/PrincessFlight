// Versão: 1.3

const AIRLINE_NAMES: Record<string, string> = {
  G3: 'Gol',
  AD: 'Azul',
  LA: 'LATAM',
  JJ: 'LATAM',
  '2Z': 'Voepass',
  TP: 'TAP',
  AF: 'Air France',
  KL: 'KLM',
  IB: 'Iberia',
  AA: 'American',
  UA: 'United',
  CM: 'Copa',
  AR: 'Aerolíneas Argentinas',
};

export function airlineLabel(code: string): string {
  const normalized = code.toUpperCase();
  const name = AIRLINE_NAMES[normalized];
  if (!name) return normalized || '—';
  return `${name} (${normalized})`;
}

export function formatPrice(price: number, currency: string): string {
  try {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: currency || 'BRL' }).format(price);
  } catch {
    return `${currency} ${price.toFixed(2)}`;
  }
}

export function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(date);
}

export function formatFoundAt(iso: string): string {
  const hasTime = iso.includes('T');
  const date = new Date(hasTime ? iso : `${iso}T12:00:00-03:00`);
  if (Number.isNaN(date.getTime())) return iso;
  if (!hasTime) {
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(date);
  }
  return formatWhen(iso);
}

export function formatGap(gapRatio: number | null): string {
  if (gapRatio === null) return 'Oferta única neste destino';
  const percent = Math.round(Math.abs(gapRatio) * 100);
  if (percent === 0) return 'Na mediana';
  if (gapRatio > 0) return `${percent}% abaixo da mediana`;
  return `${percent}% acima da mediana`;
}

export function formatAlertMessage(count: number, city: string, percentBelow: number, priceLabel: string): string {
  if (count <= 1) return `Alerta: ${city} está ${percentBelow}% abaixo da mediana, por ${priceLabel}.`;
  return `Alerta: ${count} ofertas muito boas. ${city} está ${percentBelow}% abaixo da mediana, por ${priceLabel}.`;
}

export function formatStops(transfers: number, returnTransfers: number): string {
  return `ida ${formatLeg(transfers)} · volta ${formatLeg(returnTransfers)}`;
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function formatLeg(transfers: number): string {
  if (transfers <= 0) return 'direta';
  if (transfers === 1) return '1 parada';
  return `${transfers} paradas`;
}

// Versão: 1.1
import L from 'leaflet';
import type { Airport, FlightOffer } from '../domain/types';
import { cheapestByDestination } from '../domain/present-offers';
import { airlineLabel, escapeHtml, formatGap, formatPrice, formatWhen } from './format';

export class MapView {
  private readonly map: L.Map;
  private readonly layer = L.layerGroup();

  constructor(container: HTMLElement) {
    this.map = L.map(container).setView([-14.2, -51.9], 4);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 12,
    }).addTo(this.map);
    this.layer.addTo(this.map);
    window.addEventListener('resize', () => this.map.invalidateSize());
  }

  update(offers: readonly FlightOffer[], airports: readonly Airport[], originIata: string): void {
    this.layer.clearLayers();
    const byIata = new Map(airports.map((airport) => [airport.iata, airport]));
    const bounds: L.LatLngTuple[] = [];
    this.addOrigin(byIata.get(originIata), bounds);
    for (const [iata, offer] of cheapestByDestination(offers)) {
      const airport = byIata.get(iata);
      if (!airport) continue;
      bounds.push([airport.latitude, airport.longitude]);
      const marker = L.circleMarker([airport.latitude, airport.longitude], this.styleFor(offer));
      marker.bindPopup(popupHtml(airport, offer));
      marker.addTo(this.layer);
    }
    this.fit(bounds);
  }

  focus(iata: string, airports: readonly Airport[]): void {
    const airport = airports.find((item) => item.iata === iata);
    if (!airport) return;
    this.map.setView([airport.latitude, airport.longitude], 7);
  }

  invalidate(): void {
    this.map.invalidateSize();
  }

  private addOrigin(airport: Airport | undefined, bounds: L.LatLngTuple[]): void {
    if (!airport) return;
    bounds.push([airport.latitude, airport.longitude]);
    const marker = L.circleMarker([airport.latitude, airport.longitude], {
      radius: 7,
      color: '#efedf0',
      fillColor: '#efedf0',
      fillOpacity: 1,
      weight: 2,
    });
    marker.bindPopup(`<strong>Origem</strong><br>${escapeHtml(airport.city)} (${escapeHtml(airport.iata)})`);
    marker.addTo(this.layer);
  }

  private fit(bounds: L.LatLngTuple[]): void {
    if (bounds.length === 1) {
      this.map.setView(bounds[0], 5);
      return;
    }
    if (bounds.length > 1) this.map.fitBounds(bounds, { padding: [24, 24] });
  }

  private styleFor(offer: FlightOffer): L.CircleMarkerOptions {
    const bargain = cssColor('--bargain', '#c2410c');
    const accent = cssColor('--accent', '#0f5f5c');
    const color = offer.isBargain ? bargain : accent;
    return { radius: offer.isBargain ? 9 : 6, color, fillColor: color, fillOpacity: 0.9, weight: 2 };
  }
}

function popupHtml(airport: Airport, offer: FlightOffer): string {
  const when = `${escapeHtml(formatWhen(offer.departureAt))} – ${offer.returnAt ? escapeHtml(formatWhen(offer.returnAt)) : 'sem volta'}`;
  const gap = escapeHtml(formatGap(offer.gapRatio));
  return `<strong>${escapeHtml(airport.city)} (${escapeHtml(airport.iata)})</strong><br>${escapeHtml(formatPrice(offer.price, offer.currency))}<br>${gap}<br>${escapeHtml(airlineLabel(offer.airline))}<br>${when}`;
}

function cssColor(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

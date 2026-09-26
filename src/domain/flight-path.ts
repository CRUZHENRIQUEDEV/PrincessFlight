// Versão: 1.0
import { calendarDay } from './iso-date';

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

const EARTH_KM = 6371;

export function distanceKm(from: GeoPoint, to: GeoPoint): number {
  const latitudeDelta = radians(to.latitude - from.latitude);
  const longitudeDelta = radians(to.longitude - from.longitude);
  const start = radians(from.latitude);
  const end = radians(to.latitude);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(start) * Math.cos(end) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(haversine)));
}

/** Arco de grande círculo, o mesmo desenho curvo de um mapa de voos. */
export function greatCircle(from: GeoPoint, to: GeoPoint, steps = 48): Array<[number, number]> {
  const startLat = radians(from.latitude);
  const startLon = radians(from.longitude);
  const endLat = radians(to.latitude);
  const endLon = radians(to.longitude);
  const separation = angularDistance(startLat, startLon, endLat, endLon);
  if (separation < 1e-6) return [[from.latitude, from.longitude]];
  const points: Array<[number, number]> = [];
  for (let index = 0; index <= steps; index += 1) {
    points.push(interpolate(startLat, startLon, endLat, endLon, separation, index / steps));
  }
  return points;
}

export function estimateBlockMinutes(distance: number, transfers: number): number {
  const cruise = (Math.max(distance, 0) / 800) * 60;
  return Math.max(45, Math.round(cruise + 35 + Math.max(transfers, 0) * 25));
}

export function formatMinutes(total: number): string {
  const minutes = Math.max(0, Math.round(total));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours <= 0) return `${rest} min`;
  if (rest === 0) return `${hours} h`;
  return `${hours} h ${rest} min`;
}

export function legLabel(reported: number | null | undefined, fallback: number): string {
  if (reported && reported > 0) return formatMinutes(reported);
  return `cerca de ${formatMinutes(fallback)}`;
}

export interface ClimateWindow {
  start: string;
  end: string;
  year: number;
  monthLabel: string;
}

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** Mês da viagem, ou o mesmo mês do ano anterior quando a data ainda não aconteceu. */
export function climateWindow(departureAt: string, today: string): ClimateWindow | null {
  const day = calendarDay(departureAt);
  if (day.length < 7) return null;
  const month = Number(day.slice(5, 7));
  const tripYear = Number(day.slice(0, 4));
  if (!month || !tripYear) return null;
  const year = day <= today ? tripYear : Number(today.slice(0, 4)) - 1;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const monthText = String(month).padStart(2, '0');
  return {
    start: `${year}-${monthText}-01`,
    end: `${year}-${monthText}-${String(last).padStart(2, '0')}`,
    year,
    monthLabel: MONTHS[month - 1] ?? '',
  };
}

export function describeClimate(
  city: string,
  window: ClimateWindow,
  meanC: number,
  minC: number,
  maxC: number,
  rainMm: number,
): string {
  const label = window.monthLabel;
  return `${capitalize(label)} em ${city}: por volta de ${Math.round(meanC)}°C, entre ${Math.round(minC)}°C e ${Math.round(maxC)}°C, com cerca de ${Math.round(rainMm)} mm de chuva. Referência de ${window.year}, Open-Meteo.`;
}

function capitalize(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function interpolate(
  startLat: number,
  startLon: number,
  endLat: number,
  endLon: number,
  separation: number,
  fraction: number,
): [number, number] {
  const startWeight = Math.sin((1 - fraction) * separation) / Math.sin(separation);
  const endWeight = Math.sin(fraction * separation) / Math.sin(separation);
  const x = startWeight * Math.cos(startLat) * Math.cos(startLon) + endWeight * Math.cos(endLat) * Math.cos(endLon);
  const y = startWeight * Math.cos(startLat) * Math.sin(startLon) + endWeight * Math.cos(endLat) * Math.sin(endLon);
  const z = startWeight * Math.sin(startLat) + endWeight * Math.sin(endLat);
  return [degrees(Math.atan2(z, Math.hypot(x, y))), degrees(Math.atan2(y, x))];
}

function angularDistance(startLat: number, startLon: number, endLat: number, endLon: number): number {
  return 2 * Math.asin(Math.min(1, Math.sqrt(
    Math.sin((endLat - startLat) / 2) ** 2
    + Math.cos(startLat) * Math.cos(endLat) * Math.sin((endLon - startLon) / 2) ** 2,
  )));
}

function radians(degreesValue: number): number {
  return (degreesValue * Math.PI) / 180;
}

function degrees(radiansValue: number): number {
  return (radiansValue * 180) / Math.PI;
}

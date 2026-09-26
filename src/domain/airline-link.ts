// Versão: 1.0
import { calendarDay } from './iso-date';
import type { FlightOffer } from './types';

export interface AirlineBookingLink {
  href: string;
  label: string;
}

const NAMES: Record<string, string> = {
  G3: 'Gol',
  AD: 'Azul',
  LA: 'LATAM',
  JJ: 'LATAM',
};

export function airlineBookingLink(offer: FlightOffer): AirlineBookingLink | null {
  const departure = calendarDay(offer.departureAt);
  const ret = offer.returnAt ? calendarDay(offer.returnAt) : '';
  if (!departure) return null;
  const href = hrefFor(offer.airline, offer.origin, offer.destination, departure, ret);
  const name = NAMES[offer.airline];
  if (!href || !name) return null;
  return { href, label: `Comprar na ${name}` };
}

function hrefFor(airline: string, origin: string, destination: string, departure: string, ret: string): string | null {
  if (airline === 'G3') return golUrl(origin, destination, departure, ret);
  if (airline === 'AD') return azulUrl(origin, destination, departure, ret);
  if (airline === 'LA' || airline === 'JJ') return latamUrl(origin, destination, departure, ret);
  return null;
}

function golUrl(origin: string, destination: string, departure: string, ret: string): string {
  const params = new URLSearchParams({
    from: origin,
    to: destination,
    departureDate: departure,
    numAdults: '1',
    numChildren: '0',
    numInfants: '0',
  });
  if (ret) params.set('returnDate', ret);
  return `https://www.voegol.com.br/itineraries?${params.toString()}`;
}

function latamUrl(origin: string, destination: string, departure: string, ret: string): string {
  const params = new URLSearchParams({
    origin,
    outbound: `${departure}T12:00:00.000Z`,
    destination,
    adt: '1',
    chd: '0',
    inf: '0',
    trip: ret ? 'RT' : 'OW',
    cabin: 'Economy',
    redemption: 'false',
    sort: 'RECOMMENDED',
  });
  if (ret) params.set('inbound', `${ret}T12:00:00.000Z`);
  return `https://www.latamairlines.com/br/pt/oferta-voos?${params.toString()}`;
}

function azulUrl(origin: string, destination: string, departure: string, ret: string): string {
  const params = new URLSearchParams({
    'c[0].ds': origin,
    'c[0].std': monthFirst(departure),
    'c[0].as': destination,
    'p[0].t': 'ADT',
    'p[0].c': '1',
    'p[0].cp': 'false',
    'f.dl': '3',
    'f.dr': '3',
    cc: 'BRL',
  });
  if (ret) {
    params.set('c[1].ds', destination);
    params.set('c[1].std', monthFirst(ret));
    params.set('c[1].as', origin);
  }
  return `https://www.voeazul.com.br/br/pt/home/selecao-voo?${params.toString()}`;
}

function monthFirst(iso: string): string {
  const [year, month, day] = iso.split('-');
  return `${month}/${day}/${year}`;
}

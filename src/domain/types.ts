// Versão: 1.9

export type Region = 'norte' | 'nordeste' | 'centro-oeste' | 'sudeste' | 'sul' | 'internacional';

export type OfferSort = 'price' | 'date' | 'discount';

export type TripScope = 'nacional' | 'internacional';

export interface Airport {
  iata: string;
  city: string;
  name: string;
  state: string;
  region: Region;
  country: string;
  latitude: number;
  longitude: number;
  coastal: boolean;
}

export interface SearchCriteria {
  originIata: string;
  scope: TripScope;
  regions: Region[];
  states: string[];
  coastalOnly: boolean;
  departureStart: string;
  departureEnd: string;
  tripLengthDays: number | null;
  holidayBridgeOnly: boolean;
  priceMin: number | null;
  priceMax: number | null;
  bargainRatio: number;
  airlines: string[];
  delayBetweenCallsSeconds: number;
  repeatEveryMinutes: number;
  bargainsOnly: boolean;
  includeRegularPrices: boolean;
  offerSort: OfferSort;
}

export interface RawTicket {
  origin: string;
  destination: string;
  originAirport: string;
  destinationAirport: string;
  price: number;
  currency: string;
  airline: string;
  flightNumber: string;
  departureAt: string;
  returnAt: string | null;
  transfers: number;
  returnTransfers: number;
  link: string;
  foundAt?: string | null;
  durationToMinutes?: number | null;
  durationBackMinutes?: number | null;
}

export interface FlightOffer {
  id: string;
  origin: string;
  destination: string;
  originAirport: string;
  destinationAirport: string;
  price: number;
  currency: string;
  airline: string;
  flightNumber: string;
  departureAt: string;
  returnAt: string | null;
  transfers: number;
  returnTransfers: number;
  link: string;
  fetchedAt: string;
  foundAt?: string | null;
  durationToMinutes?: number | null;
  durationBackMinutes?: number | null;
  isBargain: boolean;
  referencePrice: number | null;
  gapRatio: number | null;
  /** Preço único do cache, em qualquer data, quando o mês pedido veio vazio. */
  anyDate?: boolean;
  selfConnect?: SelfConnect;
}

/** Uma das duas passagens compradas à parte, emendadas numa escala. */
export interface ConnectLeg {
  origin: string;
  destination: string;
  originAirport: string;
  destinationAirport: string;
  price: number;
  currency: string;
  airline: string;
  flightNumber: string;
  departureAt: string;
  returnAt: string;
  transfers: number;
  returnTransfers: number;
  durationToMinutes: number | null;
  durationBackMinutes: number | null;
  link: string;
  foundAt: string | null;
}

/** Ida e volta montadas com duas compras. A escala não é uma passagem só. */
export interface SelfConnect {
  hub: string;
  home: ConnectLeg;
  away: ConnectLeg;
}

export interface HolidayWindow {
  holidayDate: string;
  holidayName: string;
  departureDate: string;
  returnDate: string;
}

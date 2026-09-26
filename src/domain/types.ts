// Versão: 1.1

export type Region = 'norte' | 'nordeste' | 'centro-oeste' | 'sudeste' | 'sul' | 'internacional';

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
  holidayBridgeOnly: boolean;
  priceMin: number | null;
  priceMax: number | null;
  bargainRatio: number;
  airlines: string[];
  delayBetweenCallsSeconds: number;
  repeatEveryMinutes: number;
  bargainsOnly: boolean;
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
  isBargain: boolean;
  referencePrice: number | null;
  gapRatio: number | null;
}

export interface HolidayWindow {
  holidayDate: string;
  holidayName: string;
  departureDate: string;
  returnDate: string;
}

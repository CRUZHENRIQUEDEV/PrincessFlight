// Versão: 1.4
import { airlineBookingLink } from '../domain/airline-link';
import { distanceKm, estimateBlockMinutes, legLabel } from '../domain/flight-path';
import type { OfferVerdictStatus } from '../domain/offer-check';
import type { Airport, FlightOffer } from '../domain/types';
import type { DestinationNotes } from '../infrastructure/destination-notes';
import { googlePlaceSearchUrl, type PlaceSpot } from '../domain/place-notes';
import { airlineLabel, formatGap, formatPrice, formatStops, formatWhen } from './format';

export interface OfferFavoriteAction {
  pinned: boolean;
  city: string;
  onToggle: () => void;
}

export interface OfferDrawerState {
  phase: 'idle' | 'checking' | OfferVerdictStatus | 'error';
  message: string;
}

export class OfferDrawer {
  constructor(
    private readonly root: HTMLElement,
    private readonly onClose: () => void,
    private readonly onRefresh: () => void,
    private readonly onMap: (iata: string) => void,
  ) {
    this.root.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest('[data-close]')) this.onClose();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !this.root.hidden) this.onClose();
    });
  }

  show(
    offer: FlightOffer,
    airports: readonly Airport[],
    state: OfferDrawerState,
    notes: DestinationNotes,
    favorite: OfferFavoriteAction,
  ): void {
    this.root.hidden = false;
    const title = this.root.querySelector('#offer-drawer-title');
    const airport = airports.find((item) => item.iata === offer.destination);
    if (title) title.textContent = airport?.city ?? offer.destination;
    const panel = this.root.querySelector('.offer-drawer__panel');
    if (!panel) return;
    const body = panel.querySelector('.offer-drawer__body');
    if (!body) return;
    body.replaceChildren(sheet(offer, airports, state, notes, favorite, this.onRefresh, this.onMap));
  }

  hide(): void {
    this.root.hidden = true;
  }
}

function sheet(
  offer: FlightOffer,
  airports: readonly Airport[],
  state: OfferDrawerState,
  notes: DestinationNotes,
  favorite: OfferFavoriteAction,
  onRefresh: () => void,
  onMap: (iata: string) => void,
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'offer-sheet';
  wrap.append(
    routeBlock(offer, airports),
    priceBlock(offer),
    facts(offer, airports),
    climateBlock(notes.climate),
    placesBlock(notes, airports.find((item) => item.iata === offer.destination), offer.destination),
    notice(state),
    actions(offer, state, favorite, onRefresh, onMap),
  );
  return wrap;
}

function routeBlock(offer: FlightOffer, airports: readonly Airport[]): HTMLElement {
  const block = document.createElement('div');
  block.className = 'offer-sheet__route';
  block.append(place(offer.origin, airports), arrow(), place(offer.destination, airports));
  return block;
}

function place(iata: string, airports: readonly Airport[]): HTMLElement {
  const airport = airports.find((item) => item.iata === iata);
  const block = document.createElement('div');
  const city = document.createElement('p');
  city.className = 'offer-sheet__city';
  city.textContent = airport?.city ?? iata;
  const code = document.createElement('p');
  code.className = 'offer-sheet__code';
  code.textContent = airport ? `${airport.name} · ${airport.iata}` : iata;
  block.append(city, code);
  return block;
}

function arrow(): HTMLElement {
  const mark = document.createElement('span');
  mark.className = 'offer-sheet__arrow';
  mark.textContent = '→';
  mark.setAttribute('aria-hidden', 'true');
  return mark;
}

function priceBlock(offer: FlightOffer): HTMLElement {
  const block = document.createElement('div');
  const price = document.createElement('p');
  price.className = 'offer-sheet__price';
  price.textContent = formatPrice(offer.price, offer.currency);
  const gap = document.createElement('p');
  gap.className = `offer__gap ${gapClass(offer.gapRatio)}`;
  gap.textContent = formatGap(offer.gapRatio);
  block.append(price, gap);
  return block;
}

function facts(offer: FlightOffer, airports: readonly Airport[]): HTMLElement {
  const list = document.createElement('dl');
  list.className = 'offer-sheet__facts';
  const rows = [
    fact('Ida', formatWhen(offer.departureAt)),
    fact('Volta', offer.returnAt ? formatWhen(offer.returnAt) : 'sem volta'),
    fact('Tempo de ida', outboundTime(offer, airports)),
  ];
  if (offer.returnAt) rows.push(fact('Tempo de volta', returnTime(offer, airports)));
  rows.push(
    fact('Companhia', airlineLabel(offer.airline)),
    fact('Voo', offer.flightNumber || 'não informado'),
    fact('Paradas', formatStops(offer.transfers, offer.returnTransfers)),
    fact('Aeroportos', `${offer.originAirport} → ${offer.destinationAirport}`),
    fact('Consultada', formatWhen(offer.fetchedAt)),
  );
  list.append(...rows);
  return list;
}

function outboundTime(offer: FlightOffer, airports: readonly Airport[]): string {
  return legLabel(offer.durationToMinutes, estimateBlockMinutes(routeKm(offer, airports), offer.transfers));
}

function returnTime(offer: FlightOffer, airports: readonly Airport[]): string {
  return legLabel(offer.durationBackMinutes, estimateBlockMinutes(routeKm(offer, airports), offer.returnTransfers));
}

function routeKm(offer: FlightOffer, airports: readonly Airport[]): number {
  const origin = airports.find((airport) => airport.iata === offer.origin);
  const destination = airports.find((airport) => airport.iata === offer.destination);
  if (!origin || !destination) return 800;
  return distanceKm(origin, destination);
}

function climateBlock(text: string): HTMLElement {
  const section = document.createElement('section');
  const title = document.createElement('h3');
  title.textContent = 'Clima na época';
  const line = document.createElement('p');
  line.textContent = text;
  section.append(title, line);
  return section;
}

function placesBlock(notes: DestinationNotes, airport: Airport | undefined, iata: string): HTMLElement {
  const section = document.createElement('section');
  const title = document.createElement('h3');
  title.textContent = 'Por perto';
  section.append(title);
  if (notes.places.length > 0) section.append(placeList(notes.places, airport, iata));
  const note = document.createElement('p');
  note.className = 'help';
  note.textContent = notes.placesNote;
  section.append(note);
  return section;
}

function placeList(places: readonly PlaceSpot[], airport: Airport | undefined, iata: string): HTMLElement {
  const list = document.createElement('ul');
  list.className = 'offer-sheet__places offer-sheet__places--links';
  for (const place of places) list.append(placeItem(place, airport, iata));
  return list;
}

function placeItem(place: PlaceSpot, airport: Airport | undefined, iata: string): HTMLElement {
  const item = document.createElement('li');
  const mapLink = document.createElement('a');
  mapLink.href = place.href;
  mapLink.target = '_blank';
  mapLink.rel = 'noopener noreferrer';
  mapLink.textContent = place.name;
  const google = document.createElement('a');
  google.href = googlePlaceSearchUrl([place.name, airport?.city || iata, airport?.state ?? '', airport?.country ?? '']);
  google.target = '_blank';
  google.rel = 'noopener noreferrer';
  google.textContent = 'Google';
  const kind = document.createElement('span');
  kind.textContent = place.kind;
  item.append(mapLink, google, kind);
  return item;
}

function fact(label: string, value: string): HTMLElement {
  const row = document.createElement('div');
  const term = document.createElement('dt');
  term.textContent = label;
  const detail = document.createElement('dd');
  detail.textContent = value;
  row.append(term, detail);
  return row;
}

function notice(state: OfferDrawerState): HTMLElement {
  const line = document.createElement('p');
  line.className = `offer-sheet__notice offer-sheet__notice--${state.phase}`;
  line.textContent = state.message;
  return line;
}

function actions(
  offer: FlightOffer,
  state: OfferDrawerState,
  favorite: OfferFavoriteAction,
  onRefresh: () => void,
  onMap: (iata: string) => void,
): HTMLElement {
  const row = document.createElement('div');
  row.className = 'offer-sheet__actions';
  const refresh = document.createElement('button');
  refresh.type = 'button';
  refresh.className = 'button';
  refresh.textContent = state.phase === 'checking' ? 'Atualizando…' : 'Atualizar este voo';
  refresh.disabled = state.phase === 'checking';
  refresh.addEventListener('click', onRefresh);
  row.append(refresh, favoriteButton(favorite));
  const agency = externalLink(offer.link, 'Abrir na agência');
  if (agency) row.append(agency);
  const booking = airlineBookingLink(offer);
  const airline = booking ? externalLink(booking.href, booking.label) : null;
  if (airline) row.append(airline);
  const map = document.createElement('button');
  map.type = 'button';
  map.className = 'button button--quiet';
  map.textContent = 'Ver no mapa';
  map.addEventListener('click', () => onMap(offer.destination));
  row.append(map);
  return row;
}

function favoriteButton(favorite: OfferFavoriteAction): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'button button--quiet';
  button.textContent = favorite.pinned ? 'Remover dos favoritos' : `Favoritar ${favorite.city}`;
  button.addEventListener('click', favorite.onToggle);
  return button;
}

function externalLink(href: string, label: string): HTMLAnchorElement | null {
  if (!href.startsWith('https://')) return null;
  const anchor = document.createElement('a');
  anchor.className = 'button button--quiet';
  anchor.href = href;
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer';
  anchor.textContent = label;
  return anchor;
}

function gapClass(gapRatio: number | null): string {
  if (gapRatio === null) return 'offer__gap--lone';
  if (gapRatio > 0.005) return 'offer__gap--below';
  if (gapRatio < -0.005) return 'offer__gap--above';
  return 'offer__gap--even';
}

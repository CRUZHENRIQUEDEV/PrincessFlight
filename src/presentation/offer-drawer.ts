// Versão: 1.9
import {
  CategoryScale,
  Chart,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js';
import { placeOf } from '../data/places';
import { airlineBookingLink } from '../domain/airline-link';
import type { DestinationHistory } from '../domain/destination-history';
import { priceFoundAt } from '../domain/offer';
import { anyDateWarning } from '../domain/filters';
import { selfConnectWarning } from '../domain/self-connect';
import { distanceKm, estimateBlockMinutes, legLabel } from '../domain/flight-path';
import type { OfferVerdictStatus } from '../domain/offer-check';
import type { Airport, FlightOffer } from '../domain/types';
import type { DestinationNotes } from '../infrastructure/destination-notes';
import { googlePlaceSearchUrl, type PlaceSpot } from '../domain/place-notes';
import { airlineLabel, formatFoundAt, formatGap, formatPrice, formatStops, formatWhen } from './format';

Chart.register(LineController, LineElement, PointElement, CategoryScale, LinearScale, Tooltip);

const INK = '#efedf0';
const MUTED = '#a39aa8';
const GRID = 'rgba(239, 237, 240, 0.12)';
const BARGAIN = '#ff5a1f';
const ACCENT = '#c4b5fd';

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
  private historyCharts: Chart[] = [];

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
    history: DestinationHistory,
  ): void {
    this.clearHistory();
    this.root.hidden = false;
    const title = this.root.querySelector('#offer-drawer-title');
    const airport = airports.find((item) => item.iata === offer.destination);
    const place = placeOf(offer.destination);
    if (title) title.textContent = place?.city ?? airport?.city ?? offer.destination;
    const panel = this.root.querySelector('.offer-drawer__panel');
    if (!panel) return;
    const body = panel.querySelector('.offer-drawer__body');
    if (!(body instanceof HTMLElement)) return;
    body.replaceChildren(sheet(offer, airports, state, notes, favorite, history, this.onRefresh, this.onMap));
    this.historyCharts = mountHistoryCharts(body, history);
  }

  hide(): void {
    this.clearHistory();
    this.root.hidden = true;
  }

  private clearHistory(): void {
    for (const chart of this.historyCharts) chart.destroy();
    this.historyCharts = [];
  }
}

function sheet(
  offer: FlightOffer,
  airports: readonly Airport[],
  state: OfferDrawerState,
  notes: DestinationNotes,
  favorite: OfferFavoriteAction,
  history: DestinationHistory,
  onRefresh: () => void,
  onMap: (iata: string) => void,
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'offer-sheet';
  const blocks = [
    routeBlock(offer, airports),
    priceBlock(offer),
    historyBlock(history),
    facts(offer, airports),
  ];
  const warning = connectWarning(offer);
  if (warning) blocks.splice(2, 0, warning);
  wrap.append(
    ...blocks,
    climateBlock(notes.climate),
    placesBlock(notes, airports.find((item) => item.iata === offer.destination), offer.destination),
    notice(state),
    actions(offer, state, favorite, onRefresh, onMap),
  );
  return wrap;
}

function connectWarning(offer: FlightOffer): HTMLElement | null {
  const text = sheetWarning(offer);
  if (!text) return null;
  const line = document.createElement('p');
  line.className = 'offer-sheet__warn';
  line.textContent = text;
  return line;
}

function sheetWarning(offer: FlightOffer): string | null {
  if (offer.selfConnect) {
    const hub = placeOf(offer.selfConnect.hub)?.city ?? offer.selfConnect.hub;
    return selfConnectWarning(hub);
  }
  if (offer.anyDate) return anyDateWarning();
  return null;
}

function routeBlock(offer: FlightOffer, airports: readonly Airport[]): HTMLElement {
  const block = document.createElement('div');
  block.className = offer.selfConnect ? 'offer-sheet__route offer-sheet__route--via' : 'offer-sheet__route';
  if (!offer.selfConnect) {
    block.append(place(offer.origin, airports), arrow(), place(offer.destination, airports));
    return block;
  }
  block.append(
    place(offer.origin, airports),
    arrow(),
    place(offer.selfConnect.hub, airports),
    arrow(),
    place(offer.destination, airports),
  );
  return block;
}

function place(iata: string, airports: readonly Airport[]): HTMLElement {
  const airport = airports.find((item) => item.iata === iata);
  const place = placeOf(iata);
  const block = document.createElement('div');
  const city = document.createElement('p');
  city.className = 'offer-sheet__city';
  city.textContent = place?.city ?? airport?.city ?? iata;
  const code = document.createElement('p');
  code.className = 'offer-sheet__code';
  code.textContent = subtitle(place?.country, airport, iata);
  block.append(city, code);
  return block;
}

function subtitle(country: string | undefined, airport: Airport | undefined, iata: string): string {
  if (country && airport) return `${country} · ${airport.name} · ${airport.iata}`;
  if (country) return country;
  if (airport) return `${airport.name} · ${airport.iata}`;
  return iata;
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
  if (offer.selfConnect) {
    rows.push(
      fact('Até a escala', legSummary(offer.selfConnect.home)),
      fact('Depois da escala', legSummary(offer.selfConnect.away)),
    );
  } else {
    rows.push(
      fact('Companhia', airlineLabel(offer.airline)),
      fact('Voo', offer.flightNumber || 'não informado'),
    );
  }
  rows.push(
    fact('Paradas', formatStops(offer.transfers, offer.returnTransfers)),
    fact('Aeroportos', `${offer.originAirport} → ${offer.destinationAirport}`),
  );
  const foundAt = priceFoundAt(offer);
  if (foundAt) rows.push(fact('Achado em', formatFoundAt(foundAt)));
  rows.push(
    fact('Consultada', formatWhen(offer.fetchedAt)),
  );
  list.append(...rows);
  return list;
}

function legSummary(leg: { price: number; currency: string; airline: string; departureAt: string; returnAt: string }): string {
  const back = formatWhen(leg.returnAt);
  return `${formatPrice(leg.price, leg.currency)} · ${airlineLabel(leg.airline)} · ${formatWhen(leg.departureAt)} → ${back}`;
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
  if (!offer.selfConnect) row.append(refresh);
  row.append(favoriteButton(favorite));
  if (offer.selfConnect) {
    const hub = placeOf(offer.selfConnect.hub)?.city ?? offer.selfConnect.hub;
    const away = placeOf(offer.destination)?.city ?? offer.destination;
    const homeLink = externalLink(offer.selfConnect.home.link, `Passagem até ${hub}`);
    const awayLink = externalLink(offer.selfConnect.away.link, `Passagem até ${away}`);
    if (homeLink) row.append(homeLink);
    if (awayLink) row.append(awayLink);
  }
  const agency = offer.selfConnect ? null : externalLink(offer.link, 'Abrir na agência');
  if (agency) row.append(agency);
  const booking = offer.selfConnect ? null : airlineBookingLink(offer);
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

function historyBlock(history: DestinationHistory): HTMLElement {
  const section = document.createElement('section');
  section.className = 'history-charts';
  const title = document.createElement('h3');
  title.textContent = 'Histórico de preços';
  const note = document.createElement('p');
  note.className = 'help';
  const count = history.count === 1 ? '1 preço guardado' : `${history.count} preços guardados`;
  note.textContent = `${count} neste navegador para esta rota.`;
  section.append(title, note);
  if (history.departures.length > 0) section.append(chartCard('Menor preço por data de ida', 'departure'));
  if (history.observations.length > 0) section.append(chartCard('Preço na data em que foi achado', 'found'));
  return section;
}

function chartCard(title: string, kind: string): HTMLElement {
  const card = document.createElement('article');
  card.className = 'chart-card chart-card--history';
  const heading = document.createElement('h3');
  heading.textContent = title;
  const canvas = document.createElement('canvas');
  canvas.dataset.history = kind;
  card.append(heading, canvas);
  return card;
}

function mountHistoryCharts(body: HTMLElement, history: DestinationHistory): Chart[] {
  const charts: Chart[] = [];
  const departure = body.querySelector('canvas[data-history="departure"]');
  const found = body.querySelector('canvas[data-history="found"]');
  if (departure instanceof HTMLCanvasElement) {
    charts.push(lineChart(
      departure,
      history.departures.map((point) => dayLabel(point.at)),
      history.departures.map((point) => point.price),
      history.currency,
      history.departures.map((point) => fullDay(point.at)),
    ));
  }
  if (found instanceof HTMLCanvasElement) {
    charts.push(lineChart(
      found,
      history.observations.map((point) => axisWhen(point.at)),
      history.observations.map((point) => point.price),
      history.currency,
      history.observations.map((point) => formatFoundAt(point.at)),
    ));
  }
  return charts;
}

function lineChart(
  canvas: HTMLCanvasElement,
  labels: readonly string[],
  prices: readonly number[],
  currency: string,
  titles: readonly string[],
): Chart {
  return new Chart(canvas, {
    type: 'line',
    data: {
      labels: [...labels],
      datasets: [{
        data: [...prices],
        borderColor: ACCENT,
        backgroundColor: BARGAIN,
        pointBackgroundColor: BARGAIN,
        tension: 0.25,
        pointRadius: 4,
        pointHoverRadius: 6,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => titles[items[0]?.dataIndex ?? 0] ?? '',
            label: (item) => formatPrice(Number(item.raw), currency),
          },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: INK, maxRotation: 0, autoSkip: true, maxTicksLimit: 6 } },
        y: {
          grid: { color: GRID },
          ticks: {
            color: MUTED,
            maxTicksLimit: 4,
            callback: (value) => formatPrice(Number(value), currency),
          },
        },
      },
    },
  });
}

function dayLabel(isoDay: string): string {
  const [, month, day] = isoDay.split('-');
  return month && day ? `${day}/${month}` : isoDay;
}

function fullDay(isoDay: string): string {
  const [year, month, day] = isoDay.split('-');
  return year && month && day ? `${day}/${month}/${year}` : isoDay;
}

function axisWhen(iso: string): string {
  if (!iso.includes('T')) return dayLabel(iso);
  return formatFoundAt(iso);
}

function gapClass(gapRatio: number | null): string {
  if (gapRatio === null) return 'offer__gap--lone';
  if (gapRatio > 0.005) return 'offer__gap--below';
  if (gapRatio < -0.005) return 'offer__gap--above';
  return 'offer__gap--even';
}

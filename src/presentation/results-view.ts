// Versão: 1.6
import { placeOf } from '../data/places';
import { priceFoundAt } from '../domain/offer';
import { groupOffersByDestination } from '../domain/present-offers';
import type { Airport, FlightOffer } from '../domain/types';
import { airlineLabel, formatFoundAt, formatGap, formatPrice, formatStops, formatWhen } from './format';

export class ResultsView {
  private readonly openDestinations = new Set<string>();

  constructor(
    private readonly body: HTMLElement,
    private readonly summary: HTMLElement,
  ) {}

  render(
    storedCount: number,
    offers: readonly FlightOffer[],
    airports: readonly Airport[],
    onSelect: (offer: FlightOffer) => void,
    freshIds: ReadonlySet<string> = new Set(),
  ): void {
    this.body.replaceChildren();
    this.summary.textContent = summaryText(storedCount, offers);
    const byIata = new Map(airports.map((airport) => [airport.iata, airport]));
    for (const group of groupOffersByDestination(offers)) {
      this.body.append(this.group(group, byIata, onSelect, freshIds));
    }
  }

  private group(
    offers: readonly FlightOffer[],
    byIata: Map<string, Airport>,
    onSelect: (offer: FlightOffer) => void,
    freshIds: ReadonlySet<string>,
  ): HTMLElement {
    const lead = offers[0];
    if (!lead) return document.createElement('div');
    if (offers.length === 1) {
      return this.card(lead, byIata.get(lead.destination), onSelect, freshIds.has(lead.id));
    }
    const section = document.createElement('section');
    section.className = 'offer-group';
    const open = this.openDestinations.has(lead.destination);
    section.append(
      this.card(lead, byIata.get(lead.destination), onSelect, freshIds.has(lead.id)),
      this.toggle(lead.destination, offers.length - 1, open),
      this.rest(offers.slice(1), byIata, onSelect, freshIds, open),
    );
    return section;
  }

  private toggle(destination: string, extra: number, open: boolean): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'offer-group__toggle';
    button.setAttribute('aria-expanded', String(open));
    button.textContent = open ? `ocultar ${extraLabel(extra)}` : `mais ${extraLabel(extra)} neste destino`;
    button.addEventListener('click', () => {
      if (this.openDestinations.has(destination)) this.openDestinations.delete(destination);
      else this.openDestinations.add(destination);
      const section = button.closest('.offer-group');
      const rest = section?.querySelector('.offer-group__rest');
      const expanded = this.openDestinations.has(destination);
      if (rest instanceof HTMLElement) rest.hidden = !expanded;
      button.setAttribute('aria-expanded', String(expanded));
      button.textContent = expanded ? `ocultar ${extraLabel(extra)}` : `mais ${extraLabel(extra)} neste destino`;
    });
    return button;
  }

  private rest(
    offers: readonly FlightOffer[],
    byIata: Map<string, Airport>,
    onSelect: (offer: FlightOffer) => void,
    freshIds: ReadonlySet<string>,
    open: boolean,
  ): HTMLElement {
    const stack = document.createElement('div');
    stack.className = 'offer-group__rest';
    stack.hidden = !open;
    for (const offer of offers) {
      stack.append(this.card(offer, byIata.get(offer.destination), onSelect, freshIds.has(offer.id)));
    }
    return stack;
  }

  private card(offer: FlightOffer, airport: Airport | undefined, onSelect: (offer: FlightOffer) => void, fresh: boolean): HTMLElement {
    const card = document.createElement('article');
    const bargain = offer.isBargain ? ' offer--bargain' : '';
    const newest = fresh ? ' offer--fresh' : '';
    card.className = `offer${bargain}${newest}`;
    card.tabIndex = 0;
    const nodes: HTMLElement[] = [heading(offer, airport), gapLine(offer), metaLine(offer)];
    const found = foundLine(offer);
    if (found) nodes.push(found);
    nodes.push(linkOrNote(offer.link));
    card.append(...nodes);
    card.addEventListener('click', () => onSelect(offer));
    card.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      onSelect(offer);
    });
    return card;
  }
}

function summaryText(storedCount: number, offers: readonly FlightOffer[]): string {
  if (storedCount === 0) return 'Nenhuma oferta salva neste navegador.';
  if (offers.length === 0) return 'Nenhuma oferta para esses filtros.';
  const destinations = new Set(offers.map((offer) => offer.destination)).size;
  const bargains = offers.filter((offer) => offer.isBargain).length;
  const places = destinations === 1 ? '1 destino' : `${destinations} destinos`;
  const prices = offers.length === 1 ? '1 oferta' : `${offers.length} ofertas`;
  return `${places} · ${prices} · ${bargains} abaixo da mediana`;
}

function extraLabel(count: number): string {
  return count === 1 ? '1 preço' : `${count} preços`;
}

function heading(offer: FlightOffer, airport: Airport | undefined): HTMLElement {
  const top = document.createElement('div');
  top.className = 'offer__top';
  const place = document.createElement('div');
  const named = placeOf(offer.destination);
  const city = document.createElement('p');
  city.className = 'offer__city';
  city.textContent = named?.city ?? airport?.city ?? offer.destination;
  const code = document.createElement('p');
  code.className = 'offer__code';
  code.textContent = named?.country ?? airport?.iata ?? offer.destination;
  place.append(city, code);
  const price = document.createElement('p');
  price.className = 'offer__price';
  price.textContent = formatPrice(offer.price, offer.currency);
  top.append(place, price);
  return top;
}

function gapLine(offer: FlightOffer): HTMLElement {
  const line = document.createElement('p');
  line.className = `offer__gap ${gapClass(offer.gapRatio)}`;
  line.textContent = formatGap(offer.gapRatio);
  return line;
}

function gapClass(gapRatio: number | null): string {
  if (gapRatio === null) return 'offer__gap--lone';
  if (gapRatio > 0.005) return 'offer__gap--below';
  if (gapRatio < -0.005) return 'offer__gap--above';
  return 'offer__gap--even';
}

function foundLine(offer: FlightOffer): HTMLElement | null {
  const foundAt = priceFoundAt(offer);
  if (!foundAt) return null;
  const line = document.createElement('p');
  line.className = 'offer__meta';
  line.textContent = `Preço achado em ${formatFoundAt(foundAt)}`;
  return line;
}

function metaLine(offer: FlightOffer): HTMLElement {
  const line = document.createElement('p');
  line.className = 'offer__meta';
  const back = offer.returnAt ? formatWhen(offer.returnAt) : 'sem volta';
  line.textContent = `${formatWhen(offer.departureAt)} → ${back} · ${airlineLabel(offer.airline)} · ${formatStops(offer.transfers, offer.returnTransfers)}`;
  return line;
}

function linkOrNote(href: string): HTMLElement {
  if (!href.startsWith('https://')) {
    const note = document.createElement('span');
    note.textContent = 'sem link';
    return note;
  }
  const link = document.createElement('a');
  link.href = href;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = 'Ver oferta';
  link.addEventListener('click', (event) => event.stopPropagation());
  return link;
}

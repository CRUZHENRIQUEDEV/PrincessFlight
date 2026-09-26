// Versão: 1.3
import type { Airport, FlightOffer } from '../domain/types';
import { airlineLabel, formatGap, formatPrice, formatStops, formatWhen } from './format';

export class ResultsView {
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
    for (const offer of offers) {
      this.body.append(this.card(offer, byIata.get(offer.destination), onSelect, freshIds.has(offer.id)));
    }
  }

  private card(offer: FlightOffer, airport: Airport | undefined, onSelect: (offer: FlightOffer) => void, fresh: boolean): HTMLElement {
    const card = document.createElement('article');
    const bargain = offer.isBargain ? ' offer--bargain' : '';
    const newest = fresh ? ' offer--fresh' : '';
    card.className = `offer${bargain}${newest}`;
    card.tabIndex = 0;
    card.append(heading(offer, airport), gapLine(offer), metaLine(offer), linkOrNote(offer.link));
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
  const bargains = offers.filter((offer) => offer.isBargain).length;
  return `${offers.length} ofertas · ${bargains} abaixo da mediana`;
}

function heading(offer: FlightOffer, airport: Airport | undefined): HTMLElement {
  const top = document.createElement('div');
  top.className = 'offer__top';
  const place = document.createElement('div');
  const city = document.createElement('p');
  city.className = 'offer__city';
  city.textContent = airport?.city ?? offer.destination;
  const code = document.createElement('p');
  code.className = 'offer__code';
  code.textContent = airport?.iata ?? offer.destination;
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

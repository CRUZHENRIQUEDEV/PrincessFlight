// Versão: 1.0
import { airlineBookingLink } from '../domain/airline-link';
import { validityLabel, type StoredAlert } from '../domain/alert-shelf';
import type { Airport } from '../domain/types';
import { airlineLabel, formatPrice, formatWhen } from './format';

export class AlertShelfView {
  constructor(
    private readonly root: HTMLElement,
    private readonly count: HTMLElement,
    private readonly onRefresh: (key: string) => void,
    private readonly onOpen: (iata: string) => void,
  ) {}

  render(items: readonly StoredAlert[], airports: readonly Airport[], refreshing: ReadonlySet<string>): void {
    this.count.textContent = items.length === 1 ? '1 salvo' : `${items.length} salvos`;
    this.root.replaceChildren();
    if (items.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'help';
      empty.textContent = 'Quando uma oferta passar da regra do alerta, ela fica salva aqui.';
      this.root.append(empty);
      return;
    }
    for (const item of items) this.root.append(this.card(item, airports, refreshing.has(item.key)));
  }

  private card(item: StoredAlert, airports: readonly Airport[], refreshing: boolean): HTMLElement {
    const airport = airports.find((entry) => entry.iata === item.offer.destination);
    const card = document.createElement('article');
    card.className = 'alert-card';
    card.tabIndex = 0;
    card.append(
      heading(airport?.city ?? item.offer.destination, formatPrice(item.offer.price, item.offer.currency)),
      line(formatWhen(item.offer.departureAt), 'alert-card__meta'),
      line(airlineLabel(item.offer.airline), 'alert-card__meta'),
      line(validityLabel(item, livePrice(item)), validityClass(item.validity)),
      actions(item, refreshing, this.onRefresh),
    );
    card.addEventListener('click', () => this.onOpen(item.offer.destination));
    card.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      this.onOpen(item.offer.destination);
    });
    return card;
  }
}

function heading(city: string, price: string): HTMLElement {
  const row = document.createElement('div');
  row.className = 'alert-card__top';
  const name = document.createElement('p');
  name.className = 'alert-card__city';
  name.textContent = city;
  const value = document.createElement('p');
  value.className = 'alert-card__price';
  value.textContent = price;
  row.append(name, value);
  return row;
}

function line(text: string, className: string): HTMLElement {
  const paragraph = document.createElement('p');
  paragraph.className = className;
  paragraph.textContent = text;
  return paragraph;
}

function actions(item: StoredAlert, refreshing: boolean, onRefresh: (key: string) => void): HTMLElement {
  const row = document.createElement('div');
  row.className = 'alert-card__actions';
  const refresh = document.createElement('button');
  refresh.type = 'button';
  refresh.className = 'button button--quiet';
  refresh.textContent = refreshing ? 'Atualizando…' : 'Atualizar';
  refresh.disabled = refreshing;
  refresh.addEventListener('click', (event) => {
    event.stopPropagation();
    onRefresh(item.key);
  });
  row.append(refresh);
  const booking = airlineBookingLink(item.offer);
  if (booking) row.append(link(booking.href, booking.label));
  if (item.offer.link.startsWith('https://')) row.append(link(item.offer.link, 'Ver oferta'));
  return row;
}

function link(href: string, label: string): HTMLAnchorElement {
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer';
  anchor.textContent = label;
  anchor.addEventListener('click', (event) => event.stopPropagation());
  return anchor;
}

function livePrice(item: StoredAlert): string {
  const price = item.livePrice ?? item.offer.price;
  return formatPrice(price, item.offer.currency);
}

function validityClass(validity: StoredAlert['validity']): string {
  if (validity === 'same') return 'alert-card__state alert-card__state--same';
  if (validity === 'changed') return 'alert-card__state alert-card__state--changed';
  if (validity === 'missing') return 'alert-card__state alert-card__state--missing';
  return 'alert-card__state';
}

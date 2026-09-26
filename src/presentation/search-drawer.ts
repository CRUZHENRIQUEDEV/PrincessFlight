// Versão: 1.3
import { matchPlaceCode } from '../data/places';
import { buildSearchBrief, type SearchBrief } from '../domain/search-brief';
import type { Airport, FlightOffer } from '../domain/types';
import type { SavedSearch } from '../domain/saved-search';
import { airlineLabel, formatPrice, formatWhen } from './format';

export class SearchDrawer {
  private shownId: string | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly onClose: () => void,
    private readonly onRemoveDestination: (iata: string) => void,
    private readonly onAddDestination: (iata: string) => void,
  ) {
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !this.root.hidden) this.onClose();
    });
    this.root.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest('[data-close]')) this.onClose();
      const remove = target.closest<HTMLElement>('[data-remove-destination]');
      if (remove?.dataset.removeDestination) this.onRemoveDestination(remove.dataset.removeDestination);
      if (target.closest('[data-add-destination]')) this.addSelected();
    });
  }

  get openId(): string | null {
    return this.shownId;
  }

  show(search: SavedSearch, airports: readonly Airport[], storedOffers: readonly FlightOffer[] = []): void {
    this.shownId = search.id;
    this.root.hidden = false;
    const title = this.root.querySelector('#search-drawer-title');
    const brief = buildSearchBrief(search, airports, storedOffers);
    if (title) title.textContent = brief.title;
    const body = this.root.querySelector('.offer-drawer__body');
    if (!body) return;
    const choosing = document.activeElement;
    const previous = choosing instanceof HTMLInputElement && choosing.id === 'drawer-favorite-destination' ? choosing.value : '';
    body.replaceChildren(sheet(brief, search.mode === 'favorites'));
    if (!previous) return;
    const field = body.querySelector('#drawer-favorite-destination');
    if (!(field instanceof HTMLInputElement)) return;
    field.value = previous;
    field.focus();
  }

  hide(): void {
    this.shownId = null;
    this.root.hidden = true;
  }

  private addSelected(): void {
    const field = this.root.querySelector('#drawer-favorite-destination');
    if (!(field instanceof HTMLInputElement)) return;
    const code = matchPlaceCode(field.value);
    if (!code) return;
    field.value = '';
    this.onAddDestination(code);
  }
}

function sheet(brief: SearchBrief, canAdd: boolean): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'offer-sheet';
  const facts = document.createElement('dl');
  facts.className = 'offer-sheet__facts';
  for (const line of brief.lines) facts.append(fact(line.label, displayValue(line.label, line.value)));
  wrap.append(facts);
  if (brief.removable || brief.destinations.length > 0) wrap.append(destinationList(brief, canAdd));
  return wrap;
}

function destinationList(brief: SearchBrief, canAdd: boolean): HTMLElement {
  const section = document.createElement('section');
  const title = document.createElement('h3');
  title.textContent = 'Por destino';
  section.append(title);
  if (canAdd) section.append(addDestination());
  const list = document.createElement('ul');
  list.className = 'offer-sheet__places';
  for (const item of brief.destinations) list.append(destinationItem(item, brief.removable));
  section.append(list);
  return section;
}

function addDestination(): HTMLElement {
  const row = document.createElement('div');
  row.className = 'favorites-add';
  const label = document.createElement('label');
  label.textContent = 'Adicionar destino';
  const field = document.createElement('input');
  field.id = 'drawer-favorite-destination';
  field.setAttribute('list', 'favorite-places');
  field.placeholder = 'Cidade, país ou código';
  field.autocomplete = 'off';
  label.append(field);
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'button';
  button.dataset.addDestination = 'true';
  button.textContent = 'Adicionar';
  row.append(label, button);
  return row;
}

function destinationItem(item: SearchBrief['destinations'][number], removable: boolean): HTMLElement {
  const row = document.createElement('li');
  const text = document.createElement('span');
  const back = item.offer?.returnAt ? formatWhen(item.offer.returnAt) : 'sem volta';
  text.textContent = item.offer
    ? `${item.city} (${item.iata}) · ${formatPrice(item.offer.price, item.offer.currency)} · ${airlineLabel(item.offer.airline)} · ${formatWhen(item.offer.departureAt)} → ${back}`
    : `${item.city} (${item.iata}) · o cache não tem preço guardado nesta rota`;
  row.append(text);
  if (!removable) return row;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'button button--quiet';
  button.dataset.removeDestination = item.iata;
  button.textContent = 'Remover';
  row.append(button);
  return row;
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

function displayValue(label: string, value: string): string {
  if (label === 'Atualizada') return formatWhen(value);
  if (label !== 'Menor preço') return value;
  const [price, currency] = value.split(' ');
  const amount = Number(price);
  if (!currency || !Number.isFinite(amount)) return value;
  return formatPrice(amount, currency);
}

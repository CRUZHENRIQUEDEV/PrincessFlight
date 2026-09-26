// Versão: 1.0
import { buildSearchBrief, type SearchBrief } from '../domain/search-brief';
import type { Airport } from '../domain/types';
import type { SavedSearch } from '../domain/saved-search';
import { airlineLabel, formatPrice, formatWhen } from './format';

export class SearchDrawer {
  private shownId: string | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly onClose: () => void,
    private readonly onRemoveDestination: (iata: string) => void,
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
    });
  }

  get openId(): string | null {
    return this.shownId;
  }

  show(search: SavedSearch, airports: readonly Airport[]): void {
    this.shownId = search.id;
    this.root.hidden = false;
    const title = this.root.querySelector('#search-drawer-title');
    const brief = buildSearchBrief(search, airports);
    if (title) title.textContent = brief.title;
    const body = this.root.querySelector('.offer-drawer__body');
    if (!body) return;
    body.replaceChildren(sheet(brief));
  }

  hide(): void {
    this.shownId = null;
    this.root.hidden = true;
  }
}

function sheet(brief: SearchBrief): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'offer-sheet';
  const facts = document.createElement('dl');
  facts.className = 'offer-sheet__facts';
  for (const line of brief.lines) facts.append(fact(line.label, displayValue(line.label, line.value)));
  wrap.append(facts);
  if (brief.destinations.length > 0) wrap.append(destinationList(brief));
  return wrap;
}

function destinationList(brief: SearchBrief): HTMLElement {
  const section = document.createElement('section');
  const title = document.createElement('h3');
  title.textContent = 'Por destino';
  const list = document.createElement('ul');
  list.className = 'offer-sheet__places';
  for (const item of brief.destinations) list.append(destinationItem(item, brief.removable));
  section.append(title, list);
  return section;
}

function destinationItem(item: SearchBrief['destinations'][number], removable: boolean): HTMLElement {
  const row = document.createElement('li');
  const text = document.createElement('span');
  const back = item.offer?.returnAt ? formatWhen(item.offer.returnAt) : 'sem volta';
  text.textContent = item.offer
    ? `${item.city} (${item.iata}) · ${formatPrice(item.offer.price, item.offer.currency)} · ${airlineLabel(item.offer.airline)} · ${formatWhen(item.offer.departureAt)} → ${back}`
    : `${item.city} (${item.iata}) · ainda sem preço`;
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

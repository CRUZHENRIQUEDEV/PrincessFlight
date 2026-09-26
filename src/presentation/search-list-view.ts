// Versão: 1.5
import { searchCounter, type SavedSearch } from '../domain/saved-search';

export class SearchListView {
  private editingId: string | null = null;
  private lastSearches: readonly SavedSearch[] = [];
  private lastActiveId = '';
  private offerCounts = new Map<string, number>();

  constructor(
    private readonly list: HTMLElement,
    private readonly count: HTMLElement,
    private readonly onSelect: (id: string) => void,
    private readonly onStop: (id: string) => void,
    private readonly onRemove: (id: string) => void,
    private readonly onRename: (id: string, name: string) => void,
  ) {
    this.list.addEventListener('click', (event) => this.onClick(event));
  }

  render(searches: readonly SavedSearch[], activeId: string, offerCounts?: ReadonlyMap<string, number>): void {
    this.lastSearches = searches;
    this.lastActiveId = activeId;
    this.offerCounts = new Map(offerCounts ?? []);
    const editing = this.list.querySelector('.search-card__rename');
    if (this.editingId && editing instanceof HTMLInputElement && document.activeElement === editing) return;
    this.paint();
  }

  private paint(): void {
    const running = this.lastSearches.filter((search) => search.running).length;
    this.count.textContent = countLabel(this.lastSearches.length, running);
    const cards = this.lastSearches.map((search) => this.card(search, search.id === this.lastActiveId));
    this.list.replaceChildren(...cards);
  }

  private card(search: SavedSearch, active: boolean): HTMLElement {
    const article = document.createElement('article');
    article.className = cardClass(active, search.running);
    article.dataset.search = search.id;
    article.append(this.title(search), meta(search, this.offerCounts.get(search.id)), actions(search));
    return article;
  }

  private title(search: SavedSearch): HTMLElement {
    if (this.editingId !== search.id) {
      const heading = document.createElement('p');
      heading.className = 'search-card__name';
      heading.textContent = search.name;
      return heading;
    }
    const input = document.createElement('input');
    input.className = 'search-card__rename';
    input.value = search.name;
    input.setAttribute('aria-label', 'Nome da pesquisa');
    input.addEventListener('click', (event) => event.stopPropagation());
    input.addEventListener('keydown', (event) => this.onRenameKey(search.id, input, event));
    input.addEventListener('blur', () => this.commit(search.id, input.value));
    queueMicrotask(() => input.focus());
    return input;
  }

  private onClick(event: Event): void {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const rename = target.closest<HTMLElement>('[data-rename]');
    if (rename?.dataset.rename) {
      this.editingId = rename.dataset.rename;
      this.paint();
      return;
    }
    if (target.closest('input')) return;
    const stop = target.closest<HTMLElement>('[data-stop]');
    if (stop?.dataset.stop) {
      this.onStop(stop.dataset.stop);
      return;
    }
    const remove = target.closest<HTMLElement>('[data-remove]');
    if (remove?.dataset.remove) {
      this.onRemove(remove.dataset.remove);
      return;
    }
    const card = target.closest<HTMLElement>('[data-search]');
    if (card?.dataset.search) this.onSelect(card.dataset.search);
  }

  private onRenameKey(id: string, input: HTMLInputElement, event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.editingId = null;
      input.blur();
      return;
    }
    if (event.key !== 'Enter') return;
    event.preventDefault();
    this.commit(id, input.value);
  }

  private commit(id: string, raw: string): void {
    const editing = this.editingId === id;
    this.editingId = null;
    const name = raw.trim();
    if (editing && name) {
      this.onRename(id, name);
      return;
    }
    this.paint();
  }
}

function countLabel(total: number, running: number): string {
  const searches = total === 1 ? '1 pesquisa' : `${total} pesquisas`;
  if (running === 0) return searches;
  const live = running === 1 ? '1 rodando' : `${running} rodando`;
  return `${searches} · ${live}`;
}

function cardClass(active: boolean, running: boolean): string {
  const classes = ['search-card'];
  if (active) classes.push('search-card--active');
  if (running) classes.push('search-card--running');
  return classes.join(' ');
}

function meta(search: SavedSearch, offerCount: number | undefined): HTMLParagraphElement {
  const line = document.createElement('p');
  line.className = 'search-card__meta';
  const state = search.running ? 'Rodando' : 'Parada';
  const places = search.favoriteDestinations.length === 1 ? '1 destino' : `${search.favoriteDestinations.length} destinos`;
  const kind = search.mode === 'favorites'
    ? `Favoritos · ${places} · `
    : search.mode === 'anywhere'
      ? 'Qualquer lugar · '
      : '';
  line.textContent = `${kind}${state} · ${searchCounter(offerCount ?? search.offers.length, search.progress)}`;
  return line;
}

function actions(search: SavedSearch): HTMLDivElement {
  const row = document.createElement('div');
  row.className = 'search-card__actions';
  row.append(smallButton('Renomear', 'button button--quiet', 'data-rename', search.id));
  if (search.running) row.append(smallButton('Parar', 'button button--stop', 'data-stop', search.id));
  row.append(smallButton('Excluir', 'button button--quiet', 'data-remove', search.id));
  return row;
}

function smallButton(label: string, className: string, attribute: string, id: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  button.setAttribute(attribute, id);
  return button;
}

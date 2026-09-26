// Versão: 2.0
import { AIRPORTS } from '../data/airports';
import { createDefaultAlertRules, offersForAlert, parseAlertRules } from '../domain/alert-rules';
import { createDefaultCriteria, parseCriteria } from '../domain/criteria';
import { presentOffers } from '../domain/present-offers';
import { markBargains } from '../domain/price-anomaly';
import { createSavedSearch, nextSearchName, withSearch, withoutSearch, type SavedSearch } from '../domain/saved-search';
import { buildSearchPlan } from '../domain/search-plan';
import type { FlightOffer } from '../domain/types';
import { MemoryFlightStore, type FlightStore, type StoredSettings } from '../infrastructure/flight-store';
import { IndexedDbFlightStore } from '../infrastructure/indexed-db-store';
import { TravelpayoutsClient } from '../infrastructure/travelpayouts-client';
import { createAlertSound } from './alert-sound';
import { bindShowToken, fillForm, populateLocations, readAlertInput, readCriteriaInput, readSettings, readToken, syncScope } from './form-controller';
import { bindDatePicker } from './date-picker';
import { formatAlertMessage, formatPrice } from './format';
import { createPreferenceMemory } from './preference-memory';
import { MapView } from './map-view';
import { PriceCharts } from './price-charts';
import { ResultsView } from './results-view';
import { createSearchDesk, type SearchUpdate } from './search-desk';
import { SearchListView } from './search-list-view';

export async function startApp(doc: Document = document): Promise<void> {
  const opened = await openStore();
  const map = new MapView(byId(doc, 'map'));
  const results = new ResultsView(byId(doc, 'results-body'), byId(doc, 'results-summary'));
  const charts = new PriceCharts(
    byId(doc, 'chart-destination'),
    byId(doc, 'chart-departure'),
    byId(doc, 'chart-destination-card'),
    byId(doc, 'chart-departure-card'),
    byId(doc, 'charts-empty'),
    byId(doc, 'chart-departure-note'),
  );
  let searches: SavedSearch[] = [];
  let activeId = '';
  let offers: FlightOffer[] = [];
  let freshIds = new Set<string>();
  const heard = new Set(await opened.store.getHeardIds());
  const sound = createAlertSound();
  const feed = byId(doc, 'search-feed');
  const saveQueue = new Map<string, Promise<void>>();

  const list = new SearchListView(
    byId(doc, 'search-list'),
    byId(doc, 'search-count'),
    (id) => selectSearch(id),
    (id) => desk.stop(id),
    (id) => { void removeSearch(id); },
    (id, name) => renameSearch(id, name),
  );
  const paintList = () => list.render(searches, activeId);
  const render = () => {
    const parsed = parseCriteria(readCriteriaInput(doc));
    const visible = presentOffers(offers, parsed.criteria, AIRPORTS);
    results.render(offers.length, visible, AIRPORTS, (iata) => map.focus(iata, AIRPORTS), freshIds);
    charts.render(visible, AIRPORTS);
    map.update(visible, AIRPORTS, parsed.criteria.originIata);
    paintList();
    syncStop();
  };
  const setStatus = (message: string, isError: boolean) => {
    const status = byId(doc, 'status');
    status.textContent = message;
    status.classList.toggle('status--error', isError);
  };
  const desk = createSearchDesk({
    provider: new TravelpayoutsClient(),
    readToken: () => readToken(doc),
    getSearch: (id) => searches.find((search) => search.id === id),
    patch: (id, update) => applyUpdate(id, update),
    isActive: (id) => id === activeId,
    setStatus,
    setFresh: (ids) => { freshIds = new Set(ids); },
    note: (message) => pushNote(feed, message),
    onDeals: (search, batch) => announceDeals(doc, opened.store, sound, heard, search, batch, setAlertStatus),
  });

  populateLocations(doc, AIRPORTS);
  const saved = await opened.store.getSettings();
  searches = await loadSearches(opened.store, saved);
  activeId = pickActive(searches, saved?.activeSearchId);
  const current = activeSearch();
  fillForm(doc, saved?.token ?? '', current.criteria, current.alertRules);
  offers = current.offers;
  bindShowToken(doc);
  bindDatePicker(doc);

  const form = byId<HTMLFormElement>(doc, 'filters');
  const memory = createPreferenceMemory((settings) => opened.store.saveSettings(settings));
  const remember = () => {
    syncActiveFromForm();
    const settings = currentSettings();
    if (settings) memory.schedule(settings);
    void persist(activeId);
  };
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    remember();
    void desk.run(activeId, 'once');
  });
  form.addEventListener('input', () => refreshFromControls());
  doc.getElementById('offers-tools')?.addEventListener('change', () => refreshFromControls());
  doc.getElementById('more-filters')?.addEventListener('toggle', () => {
    requestAnimationFrame(() => map.invalidate());
  });
  doc.addEventListener('visibilitychange', () => {
    if (doc.visibilityState === 'hidden') void memory.flush();
  });
  byId(doc, 'monitor-button').addEventListener('click', () => {
    remember();
    void desk.run(activeId, 'monitor');
  });
  byId(doc, 'stop-button').addEventListener('click', () => desk.stop(activeId));
  byId(doc, 'save-button').addEventListener('click', () => { void saveProfile(); });
  byId(doc, 'clear-button').addEventListener('click', () => clearOffers());
  byId(doc, 'new-search').addEventListener('click', () => { void createSearch(); });

  updateEstimate(doc);
  render();
  requestAnimationFrame(() => map.invalidate());
  setStatus(current.lastStatus || openingMessage(opened.persistent, readToken(doc)), false);

  function refreshFromControls(): void {
    syncScope(doc);
    updateEstimate(doc);
    render();
    remember();
  }

  function renameSearch(id: string, name: string): void {
    const current = searches.find((search) => search.id === id);
    if (!current || current.name === name) {
      paintList();
      return;
    }
    searches = withSearch(searches, { ...current, name, updatedAt: new Date().toISOString() });
    paintList();
    void persist(id);
  }

  function activeSearch(): SavedSearch {
    return searches.find((search) => search.id === activeId) ?? searches[0];
  }

  function applyUpdate(id: string, update: SearchUpdate): void {
    const current = searches.find((search) => search.id === id);
    if (!current) return;
    const next = { ...current, ...update, updatedAt: new Date().toISOString() };
    searches = withSearch(searches, next);
    if (id === activeId) offers = next.offers;
    render();
    if ('offers' in update || update.running === false) void persist(id);
  }

  function syncActiveFromForm(): void {
    const parsed = parseCriteria(readCriteriaInput(doc));
    const alert = parseAlertRules(readAlertInput(doc));
    if (parsed.fieldError || alert.fieldError) return;
    const current = searches.find((search) => search.id === activeId);
    if (!current) return;
    searches = withSearch(searches, {
      ...current,
      criteria: parsed.criteria,
      alertRules: alert.rules,
      updatedAt: new Date().toISOString(),
    });
    paintList();
  }

  function currentSettings(): StoredSettings | null {
    const settings = readSettings(doc, new Date().toISOString());
    if (!settings) return null;
    return { ...settings, activeSearchId: activeId };
  }

  function persist(id: string): Promise<void> {
    const previous = saveQueue.get(id) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(async () => {
      const latest = searches.find((search) => search.id === id);
      if (latest) await opened.store.saveSearch(latest);
    });
    saveQueue.set(id, next);
    return next;
  }

  function selectSearch(id: string): void {
    if (id === activeId || !searches.some((search) => search.id === id)) return;
    syncActiveFromForm();
    void persist(activeId);
    activeId = id;
    const next = activeSearch();
    fillForm(doc, readToken(doc), next.criteria, next.alertRules);
    offers = next.offers;
    freshIds = new Set();
    feed.replaceChildren();
    render();
    updateEstimate(doc);
    setStatus(next.lastStatus, false);
    const settings = currentSettings();
    if (settings) void opened.store.saveSettings(settings);
  }

  async function createSearch(): Promise<void> {
    syncActiveFromForm();
    await persist(activeId);
    const base = activeSearch();
    const created = createSavedSearch(nextSearchName(searches), base.criteria, base.alertRules, new Date().toISOString());
    searches = [...searches, created];
    activeId = created.id;
    fillForm(doc, readToken(doc), created.criteria, created.alertRules);
    offers = [];
    freshIds = new Set();
    feed.replaceChildren();
    render();
    updateEstimate(doc);
    await persist(created.id);
    const settings = currentSettings();
    if (settings) await opened.store.saveSettings(settings);
    setStatus(`${created.name} pronta. As que já estão buscando seguem em segundo plano.`, false);
  }

  async function removeSearch(id: string): Promise<void> {
    if (searches.length <= 1) {
      setStatus('Mantenha ao menos uma pesquisa.', true);
      return;
    }
    desk.stop(id);
    searches = withoutSearch(searches, id);
    await opened.store.deleteSearch(id);
    if (activeId === id) {
      activeId = searches[0].id;
      const next = activeSearch();
      fillForm(doc, readToken(doc), next.criteria, next.alertRules);
      offers = next.offers;
      freshIds = new Set();
      setStatus(next.lastStatus, false);
    }
    render();
    const settings = currentSettings();
    if (settings) await opened.store.saveSettings(settings);
  }

  function clearOffers(): void {
    const current = activeSearch();
    searches = withSearch(searches, { ...current, offers: [], lastStatus: 'Ofertas apagadas deste navegador.' });
    offers = [];
    render();
    void persist(activeId);
    setStatus('Ofertas apagadas deste navegador.', false);
  }

  async function saveProfile(): Promise<void> {
    const parsed = parseCriteria(readCriteriaInput(doc));
    const alert = parseAlertRules(readAlertInput(doc));
    const error = parsed.fieldError ?? alert.fieldError;
    if (error) {
      setStatus(error, true);
      flashSave(doc, 'Revise');
      return;
    }
    syncActiveFromForm();
    const settings = currentSettings();
    if (!settings) {
      setStatus('Não consegui ler a pesquisa para salvar.', true);
      flashSave(doc, 'Falhou');
      return;
    }
    await opened.store.saveSettings(settings);
    await persist(activeId);
    const where = opened.persistent ? 'neste navegador' : 'só até fechar a aba';
    const message = `${activeSearch().name} salva ${where}.`;
    setStatus(message, false);
    pushNote(feed, message);
    flashSave(doc, 'Salvo');
    paintList();
  }

  function syncStop(): void {
    setDisabled(doc, 'stop-button', !desk.isRunning(activeId));
  }
}

async function loadSearches(store: FlightStore, saved: StoredSettings | null): Promise<SavedSearch[]> {
  const stored = await store.getSearches();
  if (stored.length > 0) return stored.map((search) => ({ ...search, running: false, progress: null }));
  const created = createSavedSearch(
    'Pesquisa 1',
    saved?.criteria ?? createDefaultCriteria(),
    saved?.alertRules ?? createDefaultAlertRules(),
    saved?.updatedAt ?? new Date().toISOString(),
  );
  created.offers = await store.getOffers();
  created.lastStatus = 'Pronta para buscar.';
  await store.saveSearch(created);
  return [created];
}

function pickActive(searches: readonly SavedSearch[], activeSearchId: string | undefined): string {
  if (activeSearchId && searches.some((search) => search.id === activeSearchId)) return activeSearchId;
  return searches[0].id;
}

async function openStore(): Promise<{ store: FlightStore; persistent: boolean }> {
  try {
    return { store: await IndexedDbFlightStore.open(), persistent: true };
  } catch {
    return { store: new MemoryFlightStore(), persistent: false };
  }
}

function pushNote(feed: HTMLElement, message: string): void {
  if (message.startsWith('Busca iniciada')) feed.replaceChildren();
  const item = document.createElement('li');
  item.textContent = message;
  feed.prepend(item);
  while (feed.children.length > 8) feed.lastElementChild?.remove();
}

function announceDeals(
  doc: Document,
  store: FlightStore,
  sound: ReturnType<typeof createAlertSound>,
  heard: Set<string>,
  search: SavedSearch,
  raw: readonly FlightOffer[],
  setAlertStatus: (doc: Document, message: string, isError: boolean) => void,
): void {
  const fresh = offersForAlert(markBargains(raw, search.criteria.bargainRatio), search.alertRules, heard);
  if (fresh.length === 0) return;
  for (const offer of fresh) heard.add(offer.id);
  void store.saveHeardIds([...heard].slice(-400));
  void sound.play().then((played) => {
    if (!played) setAlertStatus(doc, 'O navegador bloqueou o som. Clique na página e dispare o alerta de novo.', true);
  });
  setAlertStatus(doc, `${search.name}: ${dealMessage(fresh)}`, false);
}

function dealMessage(offers: readonly FlightOffer[]): string {
  const best = offers[0];
  const airport = AIRPORTS.find((item) => item.iata === best.destination);
  const city = airport ? `${airport.city} (${airport.iata})` : best.destination;
  const percent = Math.round((best.gapRatio ?? 0) * 100);
  return formatAlertMessage(offers.length, city, percent, formatPrice(best.price, best.currency));
}

function setAlertStatus(doc: Document, message: string, isError: boolean): void {
  const alert = doc.getElementById('alert-status');
  if (!alert) return;
  alert.textContent = message;
  alert.classList.toggle('status--error', isError);
}

function flashSave(doc: Document, label: string): void {
  const button = doc.getElementById('save-button');
  if (!(button instanceof HTMLButtonElement)) return;
  const original = button.dataset.label ?? button.textContent ?? 'Salvar';
  button.dataset.label = original;
  button.textContent = label;
  window.setTimeout(() => {
    button.textContent = button.dataset.label ?? 'Salvar';
  }, 1600);
}

function updateEstimate(doc: Document): void {
  const estimate = doc.getElementById('call-estimate');
  if (!estimate) return;
  const parsed = parseCriteria(readCriteriaInput(doc));
  const alert = parseAlertRules(readAlertInput(doc));
  if (parsed.fieldError || alert.fieldError) {
    estimate.textContent = parsed.fieldError ?? alert.fieldError ?? '';
    return;
  }
  const plan = buildSearchPlan(parsed.criteria, AIRPORTS);
  if (plan.callCount === 0) {
    estimate.textContent = 'Nenhum destino com esses filtros.';
    return;
  }
  const seconds = plan.callCount * parsed.criteria.delayBetweenCallsSeconds;
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  const months = plan.months.length === 1 ? 'mês' : 'meses';
  const warning = plan.callCount > 60 ? ' Volume alto para a cota da API.' : '';
  estimate.textContent = `${plan.destinations.length} destinos · ${plan.months.length} ${months} · ${plan.callCount} chamadas · cerca de ${minutes} min.${warning}`;
}

function openingMessage(persistent: boolean, token: string): string {
  if (!persistent) return 'Este navegador não abriu o IndexedDB. A chave vale só até fechar a aba.';
  if (!token) return 'Cole o token da Travelpayouts. Ele fica salvo só neste navegador.';
  return 'Configuração carregada deste navegador.';
}

function setDisabled(doc: Document, id: string, disabled: boolean): void {
  const element = doc.getElementById(id);
  if (element instanceof HTMLButtonElement) element.disabled = disabled;
}

function byId<T extends HTMLElement>(doc: Document, id: string): T {
  const element = doc.getElementById(id);
  if (!element) throw new Error(`Elemento #${id} ausente.`);
  return element as T;
}

// Versão: 3.0
import { AIRPORTS } from '../data/airports';
import { matchPlaceCode, placeChoices, placeOf } from '../data/places';
import { createDefaultAlertRules, offersForAlert, parseAlertRules } from '../domain/alert-rules';
import { createDefaultCriteria, parseCriteria, type ParsedCriteria } from '../domain/criteria';
import { buildDestinationHistory } from '../domain/destination-history';
import { calendarDay, todayIso } from '../domain/iso-date';
import { presentAnywhereOffers, presentFavoriteOffers, presentOffers } from '../domain/present-offers';
import { markBargains } from '../domain/price-anomaly';
import {
  createSavedSearch,
  ensurePinnedSearches,
  favoritesCriteria,
  isPinnedMode,
  nextSearchName,
  withFavoriteDestination,
  withSearch,
  withoutSearch,
  type SavedSearch,
} from '../domain/saved-search';
import { buildSearchPlan } from '../domain/search-plan';
import { collectCatalog, mergeOffers } from '../domain/offer-archive';
import type { FlightOffer } from '../domain/types';
import { MemoryFlightStore, type FlightStore, type StoredSettings } from '../infrastructure/flight-store';
import { IndexedDbFlightStore } from '../infrastructure/indexed-db-store';
import { judgeOffer, departureMonth } from '../domain/offer-check';
import { loadDestinationNotes, type DestinationNotes } from '../infrastructure/destination-notes';
import { TravelpayoutsClient } from '../infrastructure/travelpayouts-client';
import { createAlertSound } from './alert-sound';
import { bindShowToken, fillForm, populateLocations, readAlertInput, readCriteriaInput, readSettings, readToken, syncScope } from './form-controller';
import { bindDatePicker } from './date-picker';
import { formatAlertMessage, formatPrice, formatWhen } from './format';
import { createPreferenceMemory } from './preference-memory';
import { OfferDrawer, type OfferDrawerState } from './offer-drawer';
import { MapView } from './map-view';
import { PriceCharts } from './price-charts';
import { ResultsView } from './results-view';
import { createSearchDesk, type SearchUpdate } from './search-desk';
import { SearchListView } from './search-list-view';
import { SearchDrawer } from './search-drawer';

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
  let catalog: FlightOffer[] = [];
  let activeId = '';
  let offers: FlightOffer[] = [];
  let freshIds = new Set<string>();
  let openOfferId: string | null = null;
  let drawerState: OfferDrawerState = { phase: 'idle', message: '' };
  let notes: DestinationNotes = emptyNotes();
  let notesKey = '';
  const provider = new TravelpayoutsClient();
  const heard = new Set(await opened.store.getHeardIds());
  const sound = createAlertSound();
  const feed = byId(doc, 'search-feed');
  const saveQueue = new Map<string, Promise<void>>();

  const list = new SearchListView(
    byId(doc, 'search-list'),
    byId(doc, 'search-count'),
    (id) => selectSearch(id),
    (id) => stopSearch(id),
    (id) => { void removeSearch(id); },
    (id, name) => renameSearch(id, name),
  );
  const paintList = () => list.render(searches, activeId, catalogCounts());
  const render = () => {
    const current = activeSearch();
    const visible = visibleOffers();
    const storedCount = current?.mode === 'favorites' ? catalog.length : offers.length;
    results.render(storedCount, visible, AIRPORTS, (offer) => openOffer(offer), freshIds);
    charts.render(visible, AIRPORTS);
    map.update(visible, AIRPORTS, current?.criteria.originIata ?? parseCriteria(readCriteriaInput(doc)).criteria.originIata);
    paintList();
    paintFavorites(current);
    paintNotes(current);
    syncStop();
    paintDrawer(visible);
    paintSearchDrawer();
  };
  const setStatus = (message: string, isError: boolean) => {
    const status = byId(doc, 'status');
    status.textContent = message;
    status.classList.toggle('status--error', isError);
  };
  const desk = createSearchDesk({
    provider,
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
  catalog = collectCatalog(searches, await opened.store.getOffers());
  void opened.store.saveOffers(catalog);
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
    void desk.run(activeId, 'monitor');
  });
  form.addEventListener('input', (event) => {
    const target = event.target;
    if (target instanceof HTMLTextAreaElement && target.id === 'search-notes') {
      saveNotes(target.value);
      return;
    }
    refreshFromControls();
  });
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
  byId(doc, 'stop-button').addEventListener('click', () => stopSearch(activeId));
  byId(doc, 'save-button').addEventListener('click', () => { void saveProfile(); });
  byId(doc, 'clear-button').addEventListener('click', () => clearOffers());
  byId(doc, 'new-search').addEventListener('click', () => { void createSearch(); });
  fillPlaceList(doc);
  const favoriteInput = doc.getElementById('favorite-destination');
  doc.getElementById('favorite-add')?.addEventListener('click', () => {
    if (favoriteInput instanceof HTMLInputElement) addTypedFavorite(favoriteInput);
  });
  favoriteInput?.addEventListener('keydown', (event) => {
    if (!(event instanceof KeyboardEvent) || event.key !== 'Enter') return;
    if (!(favoriteInput instanceof HTMLInputElement)) return;
    event.preventDefault();
    addTypedFavorite(favoriteInput);
  });

  updateEstimate(doc);
  const searchDrawer = new SearchDrawer(
    byId(doc, 'search-drawer'),
    () => searchDrawer.hide(),
    (iata) => changeFavorite(iata, false),
    (iata) => changeFavorite(iata, true),
  );
  render();
  requestAnimationFrame(() => map.invalidate());
  setStatus(current.lastStatus || openingMessage(opened.persistent, readToken(doc)), false);

  function catalogCounts(): Map<string, number> {
    const counts = new Map<string, number>();
    for (const search of searches) {
      if (search.mode !== 'favorites') continue;
      counts.set(search.id, presentFavoriteOffers(
        catalog,
        search.criteria.originIata,
        search.favoriteDestinations,
      ).length);
    }
    return counts;
  }

  function visibleOffers(): FlightOffer[] {
    const current = activeSearch();
    const parsed = parseCriteria(readCriteriaInput(doc));
    if (current?.mode === 'favorites') {
      return presentFavoriteOffers(
        catalog,
        current.criteria.originIata,
        current.favoriteDestinations,
        parsed.criteria.offerSort,
        current.criteria.bargainRatio,
      );
    }
    if (current?.mode === 'anywhere') {
      return presentAnywhereOffers(
        current.offers,
        current.criteria.originIata,
        parsed.criteria.offerSort,
        current.criteria.bargainRatio,
        parsed.criteria.scope,
        AIRPORTS,
      );
    }
    return presentOffers(offers, parsed.criteria, AIRPORTS);
  }

  function rememberOffers(incoming: readonly FlightOffer[]): void {
    catalog = mergeOffers(catalog, incoming);
    void opened.store.saveOffers(catalog);
  }

  function refreshFromControls(): void {
    syncScope(doc);
    updateEstimate(doc);
    render();
    remember();
  }

  function saveNotes(text: string): void {
    const current = searches.find((search) => search.id === activeId);
    if (!current || current.notes === text) return;
    searches = withSearch(searches, { ...current, notes: text, updatedAt: new Date().toISOString() });
    void persist(activeId);
  }

  function paintNotes(current: SavedSearch | undefined): void {
    const field = doc.getElementById('search-notes');
    if (!(field instanceof HTMLTextAreaElement) || !current) return;
    const sameSearch = field.dataset.searchId === current.id;
    if (sameSearch && (document.activeElement === field || field.value === current.notes)) return;
    field.dataset.searchId = current.id;
    field.value = current.notes;
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
    if (update.offers) rememberOffers(update.offers);
    render();
    if ('offers' in update || update.running === false || 'keepAlive' in update) void persist(id);
  }

  function syncActiveFromForm(): void {
    const parsed = parseCriteria(readCriteriaInput(doc));
    const alert = parseAlertRules(readAlertInput(doc));
    if (parsed.fieldError || alert.fieldError) return;
    const current = searches.find((search) => search.id === activeId);
    if (!current) return;
    if (isPinnedMode(current.mode)) {
      searches = withSearch(searches, {
        ...current,
        criteria: favoriteCriteriaFromForm(parsed),
        alertRules: alert.rules,
        updatedAt: new Date().toISOString(),
      });
      paintList();
      return;
    }
    searches = withSearch(searches, {
      ...current,
      criteria: parsed.criteria,
      alertRules: alert.rules,
      updatedAt: new Date().toISOString(),
    });
    paintList();
  }

  function currentSettings(): StoredSettings | null {
    const active = searches.find((search) => search.id === activeId);
    if (active && isPinnedMode(active.mode)) {
      const regular = searches.find((search) => search.mode === 'filters');
      const source = regular ?? active;
      return {
        token: readToken(doc),
        criteria: source.criteria,
        alertRules: source.alertRules,
        updatedAt: new Date().toISOString(),
        activeSearchId: activeId,
      };
    }
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
    const target = searches.find((search) => search.id === id);
    if (!target) return;
    if (id === activeId) {
      searchDrawer.show(target, AIRPORTS, catalog);
      closeOffer();
      return;
    }
    searchDrawer.hide();
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
    const base = searches.find((search) => search.id === activeId && search.mode === 'filters')
      ?? searches.find((search) => search.mode === 'filters');
    const created = createSavedSearch(
      nextSearchName(searches),
      base?.criteria ?? createDefaultCriteria(),
      base?.alertRules ?? createDefaultAlertRules(),
      new Date().toISOString(),
    );
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
    desk.stop(id);
    const remaining = withoutSearch(searches, id);
    await opened.store.deleteSearch(id);
    if (remaining.length === 0) {
      const created = createSavedSearch('Pesquisa 1', createDefaultCriteria(), createDefaultAlertRules(), new Date().toISOString());
      searches = [created];
      activeId = created.id;
      await persist(created.id);
    } else {
      searches = remaining;
      if (activeId === id) activeId = searches[0].id;
    }
    const next = activeSearch();
    fillForm(doc, readToken(doc), next.criteria, next.alertRules);
    offers = next.offers;
    freshIds = new Set();
    closeOffer();
    render();
    updateEstimate(doc);
    const settings = currentSettings();
    if (settings) await opened.store.saveSettings(settings);
    setStatus(next.lastStatus, false);
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

  const drawer = new OfferDrawer(
    byId(doc, 'offer-drawer'),
    () => closeOffer(),
    () => { void refreshOpenOffer(); },
    () => showOfferOnMap(),
  );

  function stopSearch(id: string): void {
    const current = searches.find((search) => search.id === id);
    if (current?.keepAlive) {
      searches = withSearch(searches, { ...current, keepAlive: false });
      void persist(id);
    }
    desk.stop(id);
  }

  function openOffer(offer: FlightOffer): void {
    openOfferId = offer.id;
    drawerState = { phase: 'idle', message: `Última consulta em ${formatWhen(offer.fetchedAt)}.` };
    paintDrawer(visibleOffers());
  }

  function closeOffer(): void {
    openOfferId = null;
    drawer.hide();
  }

  function paintDrawer(visible: readonly FlightOffer[]): void {
    if (!openOfferId) return;
    const offer = visible.find((item) => item.id === openOfferId) ?? offers.find((item) => item.id === openOfferId);
    if (!offer) {
      closeOffer();
      return;
    }
    syncNotes(offer);
    const favorites = searches.find((search) => search.mode === 'favorites');
    const airport = AIRPORTS.find((item) => item.iata === offer.destination);
    drawer.show(offer, AIRPORTS, drawerState, notes, {
      pinned: favorites?.favoriteDestinations.includes(offer.destination) ?? false,
      city: placeOf(offer.destination)?.city ?? airport?.city ?? offer.destination,
      onToggle: () => changeFavorite(offer.destination, !(favorites?.favoriteDestinations.includes(offer.destination) ?? false)),
    }, buildDestinationHistory(catalog, offer));
  }

  function showOfferOnMap(): void {
    const offer = offers.find((item) => item.id === openOfferId);
    if (!offer) return;
    const origin = AIRPORTS.find((airport) => airport.iata === offer.origin);
    const destination = AIRPORTS.find((airport) => airport.iata === offer.destination);
    if (!origin || !destination) return;
    map.showRoute(origin, destination);
    byId(doc, 'map').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function syncNotes(offer: FlightOffer): void {
    const key = `${offer.destination}:${calendarDay(offer.departureAt).slice(0, 7)}`;
    if (key === notesKey) return;
    notesKey = key;
    notes = emptyNotes();
    const airport = AIRPORTS.find((item) => item.iata === offer.destination);
    if (!airport) {
      notes = { climate: 'Sem coordenadas para o clima.', places: [], placesNote: 'Sem coordenadas para os pontos.' };
      return;
    }
    void loadDestinationNotes(airport, offer.departureAt, todayIso()).then((loaded) => {
      if (notesKey !== key) return;
      notes = loaded;
      paintDrawer(visibleOffers());
    });
  }

  async function refreshOpenOffer(): Promise<void> {
    const current = catalog.find((item) => item.id === openOfferId) ?? offers.find((item) => item.id === openOfferId);
    if (!current || drawerState.phase === 'checking') return;
    const month = departureMonth(current.departureAt);
    if (!month) {
      drawerState = { phase: 'error', message: 'Esta oferta não tem data de ida para consultar.' };
      paintDrawer([]);
      return;
    }
    drawerState = { phase: 'checking', message: 'Consultando a Travelpayouts…' };
    paintDrawer([]);
    const controller = new AbortController();
    try {
      const query = {
        token: readToken(doc),
        origin: current.origin,
        destination: current.destination,
        month,
        signal: controller.signal,
        includeRegularPrices: true,
      };
      let tickets = await provider.searchRouteMonth(query);
      if (tickets.length === 0) tickets = await provider.searchCalendarMonth(query);
      applyVerdict(current.id, judgeOffer(current, tickets, new Date().toISOString()));
    } catch (error) {
      drawerState = { phase: 'error', message: error instanceof Error ? error.message : 'Falha ao atualizar este voo.' };
      paintDrawer([]);
    }
  }

  function applyVerdict(previousId: string, verdict: ReturnType<typeof judgeOffer>): void {
    if (verdict.status === 'missing' || !verdict.offer) {
      drawerState = { phase: 'missing', message: 'Este voo não apareceu no cache atual. O preço guardado pode ter saído.' };
      paintDrawer([]);
      return;
    }
    const current = activeSearch();
    const nextOffer = verdict.offer;
    const now = new Date().toISOString();
    catalog = mergeOffers(catalog.filter((item) => item.id !== previousId), [nextOffer]);
    void opened.store.saveOffers(catalog);
    const touched: string[] = [];
    searches = searches.map((search) => {
      const related = search.id === current.id || search.offers.some((item) => item.id === previousId);
      if (!related) return search;
      const nextOffers = verdict.status === 'same'
        ? search.offers.map((item) => (item.id === previousId ? nextOffer : item))
        : search.offers.filter((item) => item.id !== previousId).concat(nextOffer);
      touched.push(search.id);
      return { ...search, offers: nextOffers, updatedAt: now };
    });
    offers = activeSearch().offers;
    openOfferId = nextOffer.id;
    drawerState = verdict.status === 'same'
      ? { phase: 'same', message: 'Ainda válida. O preço continua o mesmo.' }
      : { phase: 'changed', message: `O preço mudou para ${formatPrice(verdict.offer.price, verdict.offer.currency)}.` };
    render();
    for (const id of touched) void persist(id);
  }

  resumeBackground();

  function paintSearchDrawer(): void {
    const openId = searchDrawer.openId;
    if (!openId) return;
    const search = searches.find((item) => item.id === openId);
    if (!search) {
      searchDrawer.hide();
      return;
    }
    searchDrawer.show(search, AIRPORTS, catalog);
  }

  function paintFavorites(current: SavedSearch | undefined): void {
    const panel = doc.getElementById('favorites-panel');
    const anywhere = doc.getElementById('anywhere-panel');
    const active = current?.mode === 'favorites';
    panel?.toggleAttribute('hidden', !active);
    anywhere?.toggleAttribute('hidden', current?.mode !== 'anywhere');
    const dateButton = doc.getElementById('date-open');
    const lockedDates = current?.mode === 'favorites' || current?.mode === 'anywhere';
    if (dateButton instanceof HTMLButtonElement) dateButton.disabled = lockedDates;
    for (const id of ['scope-nacional', 'scope-internacional']) {
      const input = doc.getElementById(id);
      if (input instanceof HTMLInputElement) input.disabled = current?.mode === 'favorites';
    }
    if (!active || !current) return;
    const chips = doc.getElementById('favorite-chips');
    if (!chips) return;
    chips.replaceChildren(...current.favoriteDestinations.map((code) => favoriteChip(code)));
  }

  function favoriteChip(code: string): HTMLElement {
    const item = doc.createElement('li');
    const button = doc.createElement('button');
    button.type = 'button';
    button.textContent = `${placeOf(code)?.city ?? code} · remover`;
    button.addEventListener('click', () => changeFavorite(code, false));
    item.append(button);
    return item;
  }

  function addTypedFavorite(input: HTMLInputElement): void {
    const code = matchPlaceCode(input.value);
    const current = searches.find((search) => search.mode === 'favorites');
    if (!code || !current) {
      setStatus('Escolha o aeroporto na lista ou digite o código de 3 letras, como OPO.', true);
      return;
    }
    if (code === current.criteria.originIata.toUpperCase()) {
      setStatus('A origem não entra como destino favorito.', true);
      return;
    }
    input.value = '';
    changeFavorite(code, true);
  }

  function changeFavorite(iata: string, included: boolean): void {
    const current = searches.find((search) => search.mode === 'favorites');
    if (!current) return;
    const nextList = withFavoriteDestination(current, iata, included);
    if (nextList.favoriteDestinations.join() === current.favoriteDestinations.join()) return;
    const empty = nextList.favoriteDestinations.length === 0;
    const next = {
      ...nextList,
      keepAlive: !empty,
      updatedAt: new Date().toISOString(),
      lastStatus: empty ? 'Adicione um destino favorito. A busca pega a ida e a volta mais baratas, em qualquer data.' : current.lastStatus,
    };
    searches = withSearch(searches, next);
    if (activeId === current.id) offers = next.offers;
    render();
    void persist(current.id);
    if (empty) {
      desk.stop(current.id);
      return;
    }
    if (included) void desk.run(current.id, 'monitor');
  }

  function resumeBackground(): void {
    if (!readToken(doc)) return;
    for (const search of searches) {
      if (search.keepAlive) void desk.run(search.id, 'monitor');
    }
  }
}

function favoriteCriteriaFromForm(parsed: ParsedCriteria): SavedSearch['criteria'] {
  return {
    ...favoritesCriteria(parsed.criteria.originIata),
    scope: parsed.criteria.scope,
    delayBetweenCallsSeconds: parsed.criteria.delayBetweenCallsSeconds,
    repeatEveryMinutes: parsed.criteria.repeatEveryMinutes,
    bargainRatio: parsed.criteria.bargainRatio,
    offerSort: parsed.criteria.offerSort,
    includeRegularPrices: parsed.criteria.includeRegularPrices,
  };
}

function emptyNotes(): DestinationNotes {
  return {
    climate: 'Buscando o clima da época…',
    places: [],
    placesNote: 'Buscando pontos de lazer…',
  };
}

async function loadSearches(store: FlightStore, saved: StoredSettings | null): Promise<SavedSearch[]> {
  const stored = await store.getSearches();
  const now = new Date().toISOString();
  const mapped = stored.length > 0
    ? stored.map((search) => ({
      ...search,
      running: false,
      progress: null,
      keepAlive: search.keepAlive !== false,
    }))
    : [await firstSearch(store, saved, now)];
  const origin = saved?.criteria.originIata ?? mapped.find((search) => search.mode === 'filters')?.criteria.originIata ?? 'BSB';
  const ensured = ensurePinnedSearches(mapped, origin, now);
  for (const search of ensured) {
    if (!stored.some((item) => item.id === search.id)) await store.saveSearch(search);
  }
  return ensured;
}

async function firstSearch(store: FlightStore, saved: StoredSettings | null, now: string): Promise<SavedSearch> {
  const created = createSavedSearch(
    'Pesquisa 1',
    saved?.criteria ?? createDefaultCriteria(),
    saved?.alertRules ?? createDefaultAlertRules(),
    saved?.updatedAt ?? now,
  );
  created.offers = await store.getOffers();
  created.lastStatus = 'Pronta para buscar.';
  return created;
}

function pickActive(searches: readonly SavedSearch[], activeSearchId: string | undefined): string {
  if (activeSearchId && searches.some((search) => search.id === activeSearchId)) return activeSearchId;
  const regular = searches.find((search) => search.mode === 'filters');
  return (regular ?? searches[0]).id;
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
  const favorites = doc.getElementById('favorites-panel');
  const anywhere = doc.getElementById('anywhere-panel');
  if (anywhere && !anywhere.hidden) {
    estimate.textContent = '1 chamada · qualquer destino com preço no cache · qualquer data.';
    return;
  }
  if (favorites && !favorites.hidden) {
    const count = doc.getElementById('favorite-chips')?.childElementCount ?? 0;
    estimate.textContent = count === 0
      ? 'Nenhum destino favorito ainda.'
      : `${count} destinos favoritos · ${count} chamadas · qualquer data.`;
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

function fillPlaceList(doc: Document): void {
  const list = doc.getElementById('favorite-places');
  if (!(list instanceof HTMLDataListElement) || list.childElementCount > 0) return;
  const fragment = doc.createDocumentFragment();
  for (const choice of placeChoices()) {
    const option = doc.createElement('option');
    option.value = choice.label;
    fragment.append(option);
  }
  list.append(fragment);
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

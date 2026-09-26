// Versão: 1.3
import { AIRPORTS } from '../data/airports';
import { createDefaultAlertRules, offersForAlert, parseAlertRules } from '../domain/alert-rules';
import { createDefaultCriteria, parseCriteria } from '../domain/criteria';
import { presentOffers } from '../domain/present-offers';
import { markBargains } from '../domain/price-anomaly';
import { buildSearchPlan } from '../domain/search-plan';
import type { FlightOffer } from '../domain/types';
import { MemoryFlightStore, type FlightStore } from '../infrastructure/flight-store';
import { IndexedDbFlightStore } from '../infrastructure/indexed-db-store';
import { TravelpayoutsClient } from '../infrastructure/travelpayouts-client';
import { createAlertSound } from './alert-sound';
import { bindShowToken, fillForm, populateLocations, readAlertInput, readCriteriaInput, readSettings, readToken, syncScope } from './form-controller';
import { formatAlertMessage, formatPrice } from './format';
import { createPreferenceMemory } from './preference-memory';
import { MapView } from './map-view';
import { ResultsView } from './results-view';
import { createSearchSession } from './search-session';

export async function startApp(doc: Document = document): Promise<void> {
  const opened = await openStore();
  const map = new MapView(byId(doc, 'map'));
  const results = new ResultsView(byId(doc, 'results-body'), byId(doc, 'results-summary'));
  let offers: FlightOffer[] = [];

  const render = () => {
    const parsed = parseCriteria(readCriteriaInput(doc));
    const visible = presentOffers(offers, parsed.criteria, AIRPORTS);
    results.render(offers.length, visible, AIRPORTS, (iata) => map.focus(iata, AIRPORTS));
    map.update(visible, AIRPORTS, parsed.criteria.originIata);
  };
  const setStatus = (message: string, isError: boolean) => {
    const status = byId(doc, 'status');
    status.textContent = message;
    status.classList.toggle('status--error', isError);
  };
  const setBusy = (busy: boolean) => {
    const fields = doc.getElementById('criteria-fields');
    if (fields instanceof HTMLFieldSetElement) fields.disabled = busy;
    setDisabled(doc, 'search-button', busy);
    setDisabled(doc, 'monitor-button', busy);
    setDisabled(doc, 'save-button', busy);
    setDisabled(doc, 'clear-button', busy);
    setDisabled(doc, 'stop-button', !busy);
  };

  populateLocations(doc, AIRPORTS);
  const saved = await opened.store.getSettings();
  const heard = new Set(await opened.store.getHeardIds());
  const sound = createAlertSound();
  fillForm(
    doc,
    saved?.token ?? '',
    saved?.criteria ?? createDefaultCriteria(),
    saved?.alertRules ?? createDefaultAlertRules(),
  );
  offers = await opened.store.getOffers();
  bindShowToken(doc);
  const session = createSearchSession({
    doc,
    store: opened.store,
    provider: new TravelpayoutsClient(),
    getOffers: () => offers,
    setOffers: (next) => { offers = next; },
    render,
    setStatus,
    setBusy,
    onDeals: (batch) => announceDeals(doc, opened.store, sound, heard, batch, setAlertStatus),
  });

  const form = byId<HTMLFormElement>(doc, 'filters');
  const memory = createPreferenceMemory((settings) => opened.store.saveSettings(settings));
  const remember = () => {
    const settings = readSettings(doc, new Date().toISOString());
    if (settings) memory.schedule(settings);
  };
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    void session.run('once');
  });
  form.addEventListener('input', () => {
    syncScope(doc);
    updateEstimate(doc);
    render();
    remember();
  });
  doc.getElementById('more-filters')?.addEventListener('toggle', () => {
    requestAnimationFrame(() => map.invalidate());
  });
  doc.addEventListener('visibilitychange', () => {
    if (doc.visibilityState === 'hidden') void memory.flush();
  });
  byId(doc, 'monitor-button').addEventListener('click', () => { void session.run('monitor'); });
  byId(doc, 'stop-button').addEventListener('click', () => session.stop());
  byId(doc, 'save-button').addEventListener('click', () => { void save(doc, opened.store, opened.persistent, setStatus); });
  byId(doc, 'alert-test').addEventListener('click', () => {
    void sound.play().then((played) => {
      const message = played
        ? 'Exemplo de alerta tocado.'
        : 'O navegador bloqueou o som. Clique na página e tente de novo.';
      setAlertStatus(doc, message, !played);
    });
  });
  byId(doc, 'clear-button').addEventListener('click', () => {
    offers = [];
    render();
    void opened.store.saveOffers([]);
    setStatus('Ofertas apagadas deste navegador.', false);
  });

  updateEstimate(doc);
  render();
  requestAnimationFrame(() => map.invalidate());
  setStatus(openingMessage(opened.persistent, readToken(doc)), false);
}

async function openStore(): Promise<{ store: FlightStore; persistent: boolean }> {
  try {
    return { store: await IndexedDbFlightStore.open(), persistent: true };
  } catch {
    return { store: new MemoryFlightStore(), persistent: false };
  }
}

function announceDeals(
  doc: Document,
  store: FlightStore,
  sound: ReturnType<typeof createAlertSound>,
  heard: Set<string>,
  raw: readonly FlightOffer[],
  setAlertStatus: (doc: Document, message: string, isError: boolean) => void,
): void {
  const alert = parseAlertRules(readAlertInput(doc));
  if (alert.fieldError) return;
  const ratio = parseCriteria(readCriteriaInput(doc)).criteria.bargainRatio;
  const fresh = offersForAlert(markBargains(raw, ratio), alert.rules, heard);
  if (fresh.length === 0) return;
  for (const offer of fresh) heard.add(offer.id);
  void store.saveHeardIds([...heard].slice(-400));
  void sound.play().then((played) => {
    if (!played) setAlertStatus(doc, 'O navegador bloqueou o som. Use Ouvir exemplo depois de clicar na página.', true);
  });
  setAlertStatus(doc, dealMessage(fresh), false);
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

async function save(
  doc: Document,
  store: FlightStore,
  persistent: boolean,
  setStatus: (message: string, isError: boolean) => void,
): Promise<void> {
  const parsed = parseCriteria(readCriteriaInput(doc));
  const alert = parseAlertRules(readAlertInput(doc));
  const error = parsed.fieldError ?? alert.fieldError;
  if (error) {
    setStatus(error, true);
    return;
  }
  const settings = readSettings(doc, new Date().toISOString());
  if (!settings) return;
  await store.saveSettings(settings);
  const where = persistent ? 'neste navegador' : 'só até fechar a aba';
  setStatus(`Configuração salva ${where}.`, false);
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

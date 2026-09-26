// Versão: 1.6
import { parseAlertRules, type AlertRules, type AlertRulesInput } from '../domain/alert-rules';
import { parseCriteria, type CriteriaInput } from '../domain/criteria';
import type { Airport, SearchCriteria } from '../domain/types';
import type { StoredSettings } from '../infrastructure/flight-store';
import { syncDatePicker } from './date-picker';

export function populateLocations(doc: Document, airports: readonly Airport[]): void {
  const origin = doc.getElementById('origin');
  const states = doc.getElementById('states');
  if (!(origin instanceof HTMLSelectElement) || !states) return;
  origin.replaceChildren(optgroup(doc, 'Brasil', airports.filter((airport) => airport.country === 'BR')));
  origin.append(optgroup(doc, 'Internacional', airports.filter((airport) => airport.country !== 'BR')));
  states.replaceChildren(...stateCheckboxes(doc, airports));
}

export function readToken(doc: Document): string {
  const input = doc.getElementById('token');
  return input instanceof HTMLInputElement ? input.value.trim() : '';
}

/** Preferências válidas para gravar no navegador. Campo inválido não substitui o que já estava salvo. */
export function readSettings(doc: Document, updatedAt: string): StoredSettings | null {
  const parsed = parseCriteria(readCriteriaInput(doc));
  const alert = parseAlertRules(readAlertInput(doc));
  if (parsed.fieldError || alert.fieldError) return null;
  return { token: readToken(doc), criteria: parsed.criteria, alertRules: alert.rules, updatedAt };
}

export function readAlertInput(doc: Document): AlertRulesInput {
  return {
    enabled: checked(doc, 'alert-enabled'),
    minPercentBelow: valueOf(doc, 'alert-percent'),
    maxPrice: valueOf(doc, 'alert-max-price'),
  };
}

export function readCriteriaInput(doc: Document): CriteriaInput {
  return {
    originIata: valueOf(doc, 'origin'),
    scope: checked(doc, 'scope-internacional') ? 'internacional' : 'nacional',
    regions: checkedValues(doc, 'region'),
    states: checkedValues(doc, 'state'),
    coastalOnly: checked(doc, 'coastal-only'),
    departureStart: valueOf(doc, 'date-start'),
    departureEnd: valueOf(doc, 'date-end'),
    holidayBridgeOnly: checked(doc, 'holiday-only'),
    priceMin: valueOf(doc, 'price-min'),
    priceMax: valueOf(doc, 'price-max'),
    bargainRatioPercent: valueOf(doc, 'bargain-ratio'),
    airlinesText: valueOf(doc, 'airlines'),
    delayBetweenCallsSeconds: valueOf(doc, 'delay-seconds'),
    repeatEveryMinutes: valueOf(doc, 'repeat-minutes'),
    bargainsOnly: checked(doc, 'bargains-only'),
    includeRegularPrices: checkedOrMissing(doc, 'show-all'),
    offerSort: checked(doc, 'sort-date') ? 'date' : 'price',
  };
}

export function fillForm(doc: Document, token: string, criteria: SearchCriteria, rules?: AlertRules): void {
  setValue(doc, 'token', token);
  setValue(doc, 'origin', criteria.originIata);
  setChecked(doc, 'scope-nacional', criteria.scope === 'nacional');
  setChecked(doc, 'scope-internacional', criteria.scope === 'internacional');
  setChecked(doc, 'coastal-only', criteria.coastalOnly);
  setChecked(doc, 'holiday-only', criteria.holidayBridgeOnly);
  setChecked(doc, 'bargains-only', criteria.bargainsOnly);
  setChecked(doc, 'show-all', criteria.includeRegularPrices !== false);
  setChecked(doc, 'sort-price', criteria.offerSort !== 'date');
  setChecked(doc, 'sort-date', criteria.offerSort === 'date');
  setValue(doc, 'date-start', criteria.departureStart);
  setValue(doc, 'date-end', criteria.departureEnd);
  setValue(doc, 'price-min', criteria.priceMin === null ? '' : String(criteria.priceMin));
  setValue(doc, 'price-max', criteria.priceMax === null ? '' : String(criteria.priceMax));
  setValue(doc, 'bargain-ratio', String(Math.round(criteria.bargainRatio * 100)));
  setValue(doc, 'airlines', criteria.airlines.join(', '));
  setValue(doc, 'delay-seconds', String(criteria.delayBetweenCallsSeconds));
  setValue(doc, 'repeat-minutes', String(criteria.repeatEveryMinutes));
  checkNamed(doc, 'region', new Set(criteria.regions));
  checkNamed(doc, 'state', new Set(criteria.states));
  if (rules) fillAlertRules(doc, rules);
  syncScope(doc);
  syncDatePicker(doc);
}

function fillAlertRules(doc: Document, rules: AlertRules): void {
  setChecked(doc, 'alert-enabled', rules.enabled);
  setValue(doc, 'alert-percent', String(rules.minPercentBelow));
  setValue(doc, 'alert-max-price', rules.maxPrice === null ? '' : String(rules.maxPrice));
}

export function syncScope(doc: Document): void {
  const national = doc.getElementById('national-filters');
  if (national) national.hidden = checked(doc, 'scope-internacional');
}

export function bindShowToken(doc: Document): void {
  const toggle = doc.getElementById('show-token');
  const token = doc.getElementById('token');
  if (!(toggle instanceof HTMLInputElement) || !(token instanceof HTMLInputElement)) return;
  toggle.addEventListener('change', () => {
    token.type = toggle.checked ? 'text' : 'password';
  });
}

function optgroup(doc: Document, label: string, airports: readonly Airport[]): HTMLOptGroupElement {
  const group = doc.createElement('optgroup');
  group.label = label;
  const sorted = [...airports].sort((left, right) => left.city.localeCompare(right.city, 'pt-BR'));
  for (const airport of sorted) {
    const option = doc.createElement('option');
    option.value = airport.iata;
    option.textContent = `${airport.city} · ${airport.name} (${airport.iata})`;
    group.append(option);
  }
  return group;
}

function stateCheckboxes(doc: Document, airports: readonly Airport[]): HTMLLabelElement[] {
  const states = [...new Set(airports.filter((airport) => airport.country === 'BR').map((airport) => airport.state))].sort();
  return states.map((state) => {
    const label = doc.createElement('label');
    label.className = 'chip';
    const input = doc.createElement('input');
    input.type = 'checkbox';
    input.name = 'state';
    input.value = state;
    label.append(input, doc.createTextNode(state));
    return label;
  });
}

function checkedValues(doc: Document, name: string): string[] {
  return [...doc.querySelectorAll<HTMLInputElement>(`input[name="${name}"]:checked`)].map((input) => input.value);
}

function checkNamed(doc: Document, name: string, selected: ReadonlySet<string>): void {
  for (const input of doc.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`)) {
    input.checked = selected.has(input.value);
  }
}

function checked(doc: Document, id: string): boolean {
  const input = doc.getElementById(id);
  return input instanceof HTMLInputElement && input.checked;
}

function checkedOrMissing(doc: Document, id: string): boolean {
  const input = doc.getElementById(id);
  if (!(input instanceof HTMLInputElement)) return true;
  return input.checked;
}

function valueOf(doc: Document, id: string): string {
  const input = doc.getElementById(id);
  if (input instanceof HTMLInputElement || input instanceof HTMLSelectElement) return input.value;
  return '';
}

function setValue(doc: Document, id: string, value: string): void {
  const input = doc.getElementById(id);
  if (input instanceof HTMLInputElement || input instanceof HTMLSelectElement) input.value = value;
}

function setChecked(doc: Document, id: string, value: boolean): void {
  const input = doc.getElementById(id);
  if (input instanceof HTMLInputElement) input.checked = value;
}

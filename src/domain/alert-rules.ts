// Versão: 1.0
import type { FlightOffer } from './types';

export interface AlertRules {
  enabled: boolean;
  minPercentBelow: number;
  maxPrice: number | null;
}

export interface AlertRulesInput {
  enabled: boolean;
  minPercentBelow: string;
  maxPrice: string;
}

export interface ParsedAlertRules {
  rules: AlertRules;
  fieldError: string | null;
}

export function createDefaultAlertRules(): AlertRules {
  return { enabled: true, minPercentBelow: 30, maxPrice: null };
}

export function parseAlertRules(input: AlertRulesInput): ParsedAlertRules {
  const percent = parsePercent(input.minPercentBelow);
  const maxPrice = parseMaxPrice(input.maxPrice);
  return {
    rules: {
      enabled: input.enabled,
      minPercentBelow: percent.value ?? createDefaultAlertRules().minPercentBelow,
      maxPrice: maxPrice.value,
    },
    fieldError: percent.error ?? maxPrice.error,
  };
}

/** Ofertas novas que passam da regra. A mesma identificação não entra de novo. */
export function offersForAlert(
  offers: readonly FlightOffer[],
  rules: AlertRules,
  alreadyHeard: ReadonlySet<string>,
): FlightOffer[] {
  if (!rules.enabled) return [];
  return offers
    .filter((offer) => matchesAlert(offer, rules) && !alreadyHeard.has(offer.id))
    .sort((left, right) => (right.gapRatio ?? 0) - (left.gapRatio ?? 0));
}

function matchesAlert(offer: FlightOffer, rules: AlertRules): boolean {
  if (offer.gapRatio === null || offer.gapRatio <= 0) return false;
  if (offer.gapRatio * 100 + 0.001 < rules.minPercentBelow) return false;
  if (rules.maxPrice !== null && offer.price > rules.maxPrice) return false;
  return true;
}

function parsePercent(value: string): { value: number | null; error: string | null } {
  const parsed = Number(value.trim().replace(',', '.'));
  if (!Number.isInteger(parsed) || parsed < 5 || parsed > 90) {
    return { value: null, error: 'O alerta sonoro pede um percentual inteiro entre 5 e 90.' };
  }
  return { value: parsed, error: null };
}

function parseMaxPrice(value: string): { value: number | null; error: string | null } {
  const trimmed = value.trim().replace(',', '.');
  if (!trimmed) return { value: null, error: null };
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return { value: null, error: 'O preço máximo do alerta é inválido.' };
  }
  return { value: parsed, error: null };
}

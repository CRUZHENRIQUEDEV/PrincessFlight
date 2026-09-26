// Versão: 1.3
import type { FlightOffer } from '../domain/types';
import { airlineLabel, formatPrice } from './format';

export interface RouteUpdate {
  completedCalls: number;
  totalCalls: number;
  city: string;
  month: string;
  foundNow: number;
  totalOffers: number;
  cheapest: FlightOffer | null;
  error: string | null;
  reused?: boolean;
}

export function describeConsulting(update: Pick<RouteUpdate, 'completedCalls' | 'totalCalls' | 'city' | 'month'>): string {
  const step = `${update.completedCalls + 1} de ${update.totalCalls}`;
  return `Consultando ${step} · ${update.city} · ${formatMonthLabel(update.month)}`;
}

export function describeRoute(update: RouteUpdate): string {
  const step = `${update.completedCalls} de ${update.totalCalls} · ${update.city} · ${formatMonthLabel(update.month)}`;
  const total = update.totalOffers === 1 ? '1 oferta no total' : `${update.totalOffers} ofertas no total`;
  if (update.error) return `${step} · falhou: ${update.error} · ${total}`;
  if (update.reused) {
    const saved = update.foundNow === 1 ? '1 oferta já salva neste navegador' : `${update.foundNow} ofertas já salvas neste navegador`;
    return `${step} · ${saved} · ${total}`;
  }
  if (update.foundNow === 0) return `${step} · nenhum preço guardado neste mês; a API só devolve tarifas que alguém já buscou · ${total}`;
  const found = update.foundNow === 1 ? '1 oferta nova' : `${update.foundNow} ofertas novas`;
  const price = update.cheapest
    ? ` · a partir de ${formatPrice(update.cheapest.price, update.cheapest.currency)} (${airlineLabel(update.cheapest.airline)})`
    : '';
  return `${step} · ${found}${price} · ${total}`;
}

export function formatMonthLabel(month: string): string {
  const [year, monthNumber] = month.split('-');
  if (!year || !monthNumber) return month || 'qualquer data';
  const name = new Intl.DateTimeFormat('pt-BR', { month: 'short', timeZone: 'UTC' })
    .format(new Date(Date.UTC(Number(year), Number(monthNumber) - 1, 1)));
  return `${name.replace('.', '')}/${year}`;
}

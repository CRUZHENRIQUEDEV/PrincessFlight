// Versão: 1.1
import type { FlightOffer } from './types';

const MAX_STORED_OFFERS = 2000;

/** Junta preços novos aos já guardados. O mesmo id é atualizado. Os mais antigos saem depois do limite. */
export function mergeOffers(stored: readonly FlightOffer[], incoming: readonly FlightOffer[]): FlightOffer[] {
  const byId = new Map(stored.map((offer) => [offer.id, offer]));
  for (const offer of incoming) byId.set(offer.id, offer);
  return [...byId.values()]
    .sort((left, right) => right.fetchedAt.localeCompare(left.fetchedAt))
    .slice(0, MAX_STORED_OFFERS);
}

/** Reúne o arquivo comum com as ofertas de cada pesquisa. */
export function collectCatalog(
  searches: readonly { offers: readonly FlightOffer[] }[],
  stored: readonly FlightOffer[] = [],
): FlightOffer[] {
  return searches.reduce((catalog, search) => mergeOffers(catalog, search.offers), mergeOffers([], stored));
}

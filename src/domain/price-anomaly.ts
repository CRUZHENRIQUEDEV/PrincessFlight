// Versão: 1.1
import type { FlightOffer } from './types';

export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return (sorted[middle - 1] + sorted[middle]) / 2;
  return sorted[middle];
}

/** Marca oferta cujo preço fica até `ratio` da mediana do mesmo destino. Uma oferta sozinha não vira barganha. */
export function markBargains(offers: readonly FlightOffer[], ratio: number): FlightOffer[] {
  const referenceByDestination = referencePrices(groupByDestination(offers));
  return offers.map((offer) => describeAgainstMedian(offer, referenceByDestination.get(offer.destination) ?? null, ratio));
}

function referencePrices(groups: Map<string, FlightOffer[]>): Map<string, number | null> {
  const references = new Map<string, number | null>();
  for (const [destination, group] of groups) {
    references.set(destination, group.length < 2 ? null : median(group.map((offer) => offer.price)));
  }
  return references;
}

function describeAgainstMedian(offer: FlightOffer, reference: number | null, ratio: number): FlightOffer {
  if (reference === null || reference <= 0) {
    return { ...offer, isBargain: false, referencePrice: null, gapRatio: null };
  }
  return {
    ...offer,
    referencePrice: reference,
    gapRatio: (reference - offer.price) / reference,
    isBargain: offer.price <= reference * ratio,
  };
}

function groupByDestination(offers: readonly FlightOffer[]): Map<string, FlightOffer[]> {
  const groups = new Map<string, FlightOffer[]>();
  for (const offer of offers) {
    const current = groups.get(offer.destination) ?? [];
    current.push(offer);
    groups.set(offer.destination, current);
  }
  return groups;
}

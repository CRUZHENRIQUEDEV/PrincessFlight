// Versão: 1.1
import { AIRPORTS } from '../data/airports';
import { parseCriteria, validateSearch } from '../domain/criteria';
import type { FlightOffer } from '../domain/types';
import { buildSearchPlan } from '../domain/search-plan';
import { delay, isAbortError } from '../infrastructure/delay';
import type { FlightStore } from '../infrastructure/flight-store';
import { runSearch } from '../infrastructure/search-runner';
import type { FlightPriceProvider } from '../infrastructure/travelpayouts-client';
import { readCriteriaInput, readSettings, readToken } from './form-controller';

export interface SearchSession {
  run(mode: 'once' | 'monitor'): Promise<void>;
  stop(): void;
}

export interface SearchSessionDeps {
  doc: Document;
  store: FlightStore;
  provider: FlightPriceProvider;
  getOffers(): FlightOffer[];
  setOffers(offers: FlightOffer[]): void;
  render(): void;
  setStatus(message: string, isError: boolean): void;
  setBusy(busy: boolean): void;
  onDeals?(offers: FlightOffer[]): void;
}

export function createSearchSession(deps: SearchSessionDeps): SearchSession {
  let controller: AbortController | null = null;
  let generation = 0;

  return {
    stop(): void {
      controller?.abort();
    },
    async run(mode: 'once' | 'monitor'): Promise<void> {
      const token = readToken(deps.doc);
      const parsed = parseCriteria(readCriteriaInput(deps.doc));
      const plan = buildSearchPlan(parsed.criteria, AIRPORTS);
      const error = parsed.fieldError ?? validateSearch(parsed.criteria, plan, token);
      if (error) {
        deps.setStatus(error, true);
        return;
      }
      if (mode === 'monitor' && parsed.criteria.repeatEveryMinutes < 1) {
        deps.setStatus('Para monitorar, informe a repetição em minutos (1 ou mais).', true);
        return;
      }
      const current = ++generation;
      controller?.abort();
      controller = new AbortController();
      const signal = controller.signal;
      deps.setBusy(true);
      try {
        const settings = readSettings(deps.doc, new Date().toISOString());
        if (settings) await deps.store.saveSettings(settings);
        deps.setOffers([]);
        deps.render();
        await runRounds(deps, token, mode, signal, () => current !== generation);
      } catch (error) {
        if (current !== generation) return;
        if (isAbortError(error)) deps.setStatus('Busca interrompida.', false);
        else deps.setStatus(error instanceof Error ? error.message : 'Falha na busca.', true);
      } finally {
        if (current === generation) deps.setBusy(false);
      }
    },
  };
}

async function runRounds(
  deps: SearchSessionDeps,
  token: string,
  mode: 'once' | 'monitor',
  signal: AbortSignal,
  stale: () => boolean,
): Promise<void> {
  do {
    const parsed = parseCriteria(readCriteriaInput(deps.doc));
    const plan = buildSearchPlan(parsed.criteria, AIRPORTS);
    const error = parsed.fieldError ?? validateSearch(parsed.criteria, plan, token);
    if (error) {
      deps.setStatus(error, true);
      return;
    }
    const result = await runSearch({
      criteria: parsed.criteria,
      airports: AIRPORTS,
      token,
      provider: deps.provider,
      signal,
      sleep: delay,
      now: () => new Date().toISOString(),
      onProgress: (progress) => {
        const airport = AIRPORTS.find((item) => item.iata === progress.destination);
        const city = airport?.city ?? progress.destination;
        deps.setStatus(`${progress.completedCalls + 1} de ${progress.totalCalls} · ${city} · ${progress.month}`, false);
      },
      onBatch: (batch) => {
        deps.setOffers(batch);
        deps.render();
        void deps.store.saveOffers(batch);
        deps.onDeals?.(batch);
      },
    });
    if (stale()) return;
    deps.setOffers(result.offers);
    deps.render();
    await deps.store.saveOffers(result.offers);
    deps.onDeals?.(result.offers);
    if (result.status === 'error') {
      deps.setStatus(result.message ?? 'Falha na busca.', true);
      return;
    }
    if (result.status === 'stopped' || signal.aborted) {
      deps.setStatus('Busca interrompida.', false);
      return;
    }
    const failNote = result.message ? ` ${result.message}` : '';
    if (mode === 'once') {
      deps.setStatus(`Busca concluída.${failNote}`, false);
      return;
    }
    deps.setStatus(`Rodada concluída.${failNote} Próxima em ${parsed.criteria.repeatEveryMinutes} min.`, false);
    await delay(parsed.criteria.repeatEveryMinutes * 60_000, signal);
  } while (mode === 'monitor' && !signal.aborted);
}

// Versão: 1.0
import type { StoredSettings } from '../infrastructure/flight-store';

export interface PreferenceMemory {
  schedule(settings: StoredSettings): void;
  flush(): Promise<void>;
}

export function createPreferenceMemory(
  save: (settings: StoredSettings) => Promise<void>,
  waitMs = 400,
): PreferenceMemory {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: StoredSettings | null = null;
  let writing = Promise.resolve();

  const flush = (): Promise<void> => {
    if (timer) clearTimeout(timer);
    timer = null;
    const settings = pending;
    pending = null;
    if (!settings) return writing;
    writing = writing.catch(() => undefined).then(() => save(settings));
    return writing;
  };

  return {
    schedule(settings: StoredSettings): void {
      pending = settings;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { void flush(); }, waitMs);
    },
    flush,
  };
}

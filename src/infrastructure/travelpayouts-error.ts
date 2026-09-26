// Versão: 1.0

export type TravelpayoutsErrorCode = 'auth' | 'rate' | 'network' | 'api';

export class TravelpayoutsError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly code: TravelpayoutsErrorCode,
  ) {
    super(message);
    this.name = 'TravelpayoutsError';
  }
}

export function isTravelpayoutsError(error: unknown): error is TravelpayoutsError {
  return error instanceof TravelpayoutsError;
}

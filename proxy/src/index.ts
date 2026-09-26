// Versão: 1.0
const UPSTREAM = 'https://api.travelpayouts.com';
const ALLOWED_ORIGIN = 'https://cruzhenriquedev.github.io';
const ALLOWED_PATHS = new Set([
  '/aviasales/v3/prices_for_dates',
  '/v1/prices/cheap',
  '/v1/prices/calendar',
]);

export default {
  fetch(request: Request): Promise<Response> {
    return handleBridge(request, globalThis.fetch.bind(globalThis));
  },
};

export async function handleBridge(
  request: Request,
  fetchFn: typeof fetch,
): Promise<Response> {
  const origin = request.headers.get('Origin');
  if (request.method === 'OPTIONS') return preflight(origin);
  if (request.method !== 'GET') return deny(405, 'Método não permitido.', origin);
  if (origin !== ALLOWED_ORIGIN) return deny(403, 'Origem não permitida.', origin);
  const url = new URL(request.url);
  if (!ALLOWED_PATHS.has(url.pathname)) return deny(404, 'Caminho não permitido.', origin);
  const target = new URL(`${url.pathname}${url.search}`, UPSTREAM);
  const headers = new Headers({ Accept: 'application/json' });
  const token = request.headers.get('X-Access-Token');
  if (token) headers.set('X-Access-Token', token);
  const upstream = await fetchFn(target, { method: 'GET', headers });
  const responseHeaders = new Headers();
  const contentType = upstream.headers.get('content-type');
  if (contentType) responseHeaders.set('content-type', contentType);
  applyCors(responseHeaders, origin);
  return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
}

function preflight(origin: string | null): Response {
  if (origin !== ALLOWED_ORIGIN) return new Response(null, { status: 403 });
  const headers = new Headers();
  applyCors(headers, origin);
  headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'X-Access-Token');
  return new Response(null, { status: 204, headers });
}

function deny(status: number, message: string, origin: string | null): Response {
  const headers = new Headers({ 'content-type': 'text/plain; charset=utf-8' });
  if (origin === ALLOWED_ORIGIN) applyCors(headers, origin);
  return new Response(message, { status, headers });
}

function applyCors(headers: Headers, origin: string): void {
  headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Vary', 'Origin');
}

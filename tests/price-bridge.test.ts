// Versão: 1.0
import { describe, expect, it, vi } from 'vitest';
import { handleBridge } from '../proxy/src/index';

const ORIGIN = 'https://cruzhenriquedev.github.io';

describe('ponte de preços', () => {
  it('repassa só a consulta de preço do site publicado', async () => {
    const seen: { url: URL | null; token: string | null } = { url: null, token: null };
    const fetchFn: typeof fetch = async (input, init) => {
      seen.url = input instanceof URL ? input : new URL(String(input));
      seen.token = new Headers(init?.headers).get('X-Access-Token');
      return new Response('{"success":true}', {
        status: 200,
        headers: { 'content-type': 'application/json', 'set-cookie': 'segredo=1' },
      });
    };
    const response = await handleBridge(request('/aviasales/v3/prices_for_dates?origin=GRU'), fetchFn);
    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(seen.url?.origin).toBe('https://api.travelpayouts.com');
    expect(seen.url?.pathname).toBe('/aviasales/v3/prices_for_dates');
    expect(seen.token).toBe('token-de-teste');
  });

  it('recusa outra origem, outro método e outro caminho', async () => {
    const fetchFn = vi.fn<typeof fetch>();
    const foreign = await handleBridge(request('/v1/prices/cheap', 'https://exemplo.com'), fetchFn);
    const post = await handleBridge(new Request('https://ponte.local/v1/prices/cheap', { method: 'POST', headers: { Origin: ORIGIN } }), fetchFn);
    const other = await handleBridge(request('/v1/city-directions'), fetchFn);
    expect(foreign.status).toBe(403);
    expect(post.status).toBe(405);
    expect(other.status).toBe(404);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

function request(path: string, origin = ORIGIN): Request {
  return new Request(`https://ponte.local${path}`, {
    headers: { Origin: origin, 'X-Access-Token': 'token-de-teste' },
  });
}

const PRODUCTION_ORIGIN = 'https://echostars.yukidu.workers.dev';
const PRODUCTION_HOST = 'echostars.yukidu.workers.dev';

function isEchoStarsPreviewHost() {
  const host = window.location.hostname;
  return host !== PRODUCTION_HOST && host.endsWith('-echostars.yukidu.workers.dev');
}

function requestMethod(input: RequestInfo | URL, init?: RequestInit) {
  if (init?.method) return init.method.toUpperCase();
  if (input instanceof Request) return input.method.toUpperCase();
  return 'GET';
}

function requestUrl(input: RequestInfo | URL) {
  if (input instanceof Request) return new URL(input.url, window.location.origin);
  return new URL(String(input), window.location.origin);
}

function productionRequest(input: RequestInfo | URL, init?: RequestInit) {
  const url = requestUrl(input);
  url.protocol = 'https:';
  url.host = PRODUCTION_HOST;

  if (input instanceof Request) {
    return new Request(url.toString(), input);
  }
  return url.toString();
}

function rewriteProductionAssets(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.startsWith('/api/r2/file/') ? `${PRODUCTION_ORIGIN}${value}` : value;
  }
  if (Array.isArray(value)) return value.map(rewriteProductionAssets);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .map(([key, item]) => [key, rewriteProductionAssets(item)])
    );
  }
  return value;
}

function shouldReadFromProduction(url: URL, method: string) {
  if (!['GET', 'HEAD'].includes(method)) return false;
  if (url.origin !== window.location.origin) return false;
  return url.pathname === '/api/tracks' || url.pathname === '/api/categories';
}

if (isEchoStarsPreviewHost()) {
  const nativeFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = requestMethod(input, init);
    const url = requestUrl(input);

    if (!shouldReadFromProduction(url, method)) {
      return nativeFetch(input, init);
    }

    const response = await nativeFetch(productionRequest(input, init), init);
    if (url.pathname !== '/api/tracks' || method === 'HEAD' || !response.ok) {
      return response;
    }

    const payload = await response.clone().json().catch(() => null);
    if (payload === null) return response;

    const headers = new Headers(response.headers);
    headers.delete('content-length');
    headers.delete('content-encoding');
    headers.set('content-type', 'application/json; charset=utf-8');
    headers.set('cache-control', 'no-store');

    return new Response(JSON.stringify(rewriteProductionAssets(payload)), {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  };
}

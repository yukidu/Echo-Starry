import appWorker from './privacyCrawlerRouter';
import type { Env } from './index';

const NOOP_MARKER = '__ECHOSTARS_NOOP_EDIT_SAVE__';
const IGNORED_NOOP_FIELDS = new Set(['userEmail', 'stickerOperationId']);

function isTrackUpdate(request: Request) {
  const url = new URL(request.url);
  return request.method.toUpperCase() === 'PUT' && /^\/api\/tracks\/[^/]+$/.test(url.pathname);
}

function rewriteJsonRequest(request: Request, body: Record<string, unknown>) {
  const headers = new Headers(request.headers);
  headers.set('Content-Type', 'application/json');
  headers.delete('Content-Length');
  return new Request(request, { headers, body: JSON.stringify(body) });
}

/**
 * v189.2: editing an audio track and pressing Save without changing any field
 * used to reach stickerRouter's no-op branch with an empty D1 batch. Some clients
 * could remain waiting at 「儲存中…」 because that request never completed normally.
 *
 * Keep the existing save pipeline intact, but add one inert internal key when the
 * request contains only bookkeeping fields. stickerRouter therefore forwards the
 * request to the canonical partial-update route instead of executing an empty batch;
 * worker/index.ts ignores the marker and simply returns the current saved track.
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (!isTrackUpdate(request) || !(request.headers.get('Content-Type') || '').toLowerCase().includes('application/json')) {
      return appWorker.fetch(request, env);
    }

    const body: unknown = await request.clone().json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return appWorker.fetch(request, env);
    }

    const editableKeys = Object.keys(body as Record<string, unknown>)
      .filter(key => !IGNORED_NOOP_FIELDS.has(key));

    if (editableKeys.length > 0) {
      return appWorker.fetch(request, env);
    }

    return appWorker.fetch(
      rewriteJsonRequest(request, { ...(body as Record<string, unknown>), [NOOP_MARKER]: true }),
      env
    );
  }
};

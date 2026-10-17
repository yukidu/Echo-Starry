import { DurableObject } from 'cloudflare:workers';

const PORT = 8080;
const INACTIVITY_MS = 10 * 60 * 1000;

type SegmenterEnv = Record<string, never>;

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export class AudioSegmenterContainer extends DurableObject<SegmenterEnv> {
  private starting?: Promise<void>;

  async fetch(request: Request): Promise<Response> {
    this.starting ??= this.startAndWait().finally(() => {
      this.starting = undefined;
    });
    await this.starting;

    const url = new URL(request.url);
    url.protocol = 'http:';
    url.host = 'container';
    const forwarded = new Request(url.toString(), request);
    forwarded.headers.delete('host');
    return this.ctx.container!.getTcpPort(PORT).fetch(forwarded);
  }

  private async startAndWait() {
    const container: any = this.ctx.container;
    if (!container) throw new Error('Audio segmenter container is unavailable');

    await container.setInactivityTimeout(INACTIVITY_MS);
    if (!container.running) {
      container.start({
        image: container.images.base,
        instance: 'lite',
        enableInternet: false
      });
    }

    const port = container.getTcpPort(PORT);
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 120; attempt++) {
      try {
        const response = await port.fetch('http://container/health', {
          signal: AbortSignal.timeout(1000)
        });
        await response.body?.cancel();
        if (!response.ok) throw new Error(`health ${response.status}`);
        return;
      } catch (error) {
        lastError = error;
        await sleep(250);
      }
    }
    throw new Error(`Audio segmenter did not become ready: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
  }
}

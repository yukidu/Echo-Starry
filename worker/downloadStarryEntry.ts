import appWorker from './privacyCrawlerRouter';
import { handleDownloadStarrySso } from './downloadStarrySsoRouter';
import type { Env } from './index';

type DownloadStarryEnv = Env & { STARRY_ID_DB?: any };

export default {
  async fetch(request: Request, env: DownloadStarryEnv, ctx?: any): Promise<Response> {
    const sso = await handleDownloadStarrySso(request, env);
    if (sso) return sso;
    return appWorker.fetch(request, env, ctx);
  }
};

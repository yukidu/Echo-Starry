import type { Env } from './index';
import appWorker from './starryMainInlineLoginRouter';
import { handleStarrySyncCentralSso } from './starrySyncCentralSsoRouter';

export default {
  async fetch(request: Request, env: Env, ctx?: any): Promise<Response> {
    const starrySync = await handleStarrySyncCentralSso(request, env);
    if (starrySync) return starrySync;
    return appWorker.fetch(request, env, ctx);
  }
};

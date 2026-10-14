import baseWorker from './privacyCrawlerRouter';
import type { Env } from './index';
import { handleStarryIdV245Battery, enhanceStarryIdV245Response } from './starryIdV245BatteryRouter';

export default {
  async fetch(request: Request, env: Env, ctx?: any): Promise<Response> {
    const direct = await handleStarryIdV245Battery(request, env);
    if (direct) return direct;
    const response = await baseWorker.fetch(request, env, ctx);
    return enhanceStarryIdV245Response(request, response, env);
  }
};

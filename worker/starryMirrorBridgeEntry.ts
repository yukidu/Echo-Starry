import type { Env } from './index';
import appWorker from './starryMainInlineLoginRouter';
import { handleStarryMirrorBridge } from './starryMirrorBridgeRouter';

export default {
  async fetch(request: Request, env: Env, ctx?: any): Promise<Response> {
    const bridge = await handleStarryMirrorBridge(request, env);
    if (bridge) return bridge;
    return appWorker.fetch(request, env, ctx);
  }
};

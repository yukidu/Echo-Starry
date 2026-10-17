import type { Env } from './index';
import app from './starryMainInlineLoginRouter';
import { queueNextTranscriptV293 } from './transcriptSequentialSchedulerV293';

export { TranscriptWorkflow } from './transcriptWorkflowV282';
export { AudioSegmenterContainer } from './audioSegmenterContainer';

export default {
  fetch(request: Request, env: Env, ctx: any) {
    return app.fetch(request, env, ctx);
  },
  scheduled(_controller: any, env: Env, ctx: any) {
    ctx.waitUntil(queueNextTranscriptV293(env as any));
  }
};

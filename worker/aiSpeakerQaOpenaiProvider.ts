/**
 * ChatGPT API for speaker Q&A. Keep provider networking separate from
 * entitlement/battery handling in aiSpeakerQaRouter. Never expose the API key
 * or forward it to the browser; Responses use store:false.
 */
export const OPENAI_SPEAKER_QA_MODEL = 'gpt-6-luna';
export const OPENAI_SPEAKER_QA_ENDPOINT = 'https://api.openai.com/v1/responses';

export type OpenAiSpeakerQaEnv = { OPENAI_API_KEY?: string };

export async function requestOpenAiSpeakerQa(
  env: OpenAiSpeakerQaEnv,
  messages: Array<{role:string;content:string}>,
  maxOutputTokens = 1800,
  transport: typeof fetch = fetch,
): Promise<unknown> {
  const key = String(env.OPENAI_API_KEY || '').trim();
  if (!key) throw new Error('OpenAI API key not configured');
  const instructions = messages.filter(x=>x.role==='system').map(x=>x.content).join('\n');
  const input = messages.filter(x=>x.role!=='system').map(x=>x.content).join('\n');
  if (!input.trim()) throw new Error('OpenAI QA input is empty');

  const response = await transport(OPENAI_SPEAKER_QA_ENDPOINT, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer '+key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OPENAI_SPEAKER_QA_MODEL, instructions, input,
      reasoning: { effort: 'none' },
      max_output_tokens: maxOutputTokens, store: false,
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) {
    // Never log API keys, raw transcripts, member questions or provider bodies.
    throw new Error('OpenAI API request unsuccessful: HTTP '+response.status);
  }
  const payload:unknown = await response.json();
  if (!payload || typeof payload!=='object') throw new Error('OpenAI API returned invalid response');
  return payload;
}

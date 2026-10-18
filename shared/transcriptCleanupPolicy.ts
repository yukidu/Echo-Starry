/**
 * C1 conservative, versioned speech-cleanup policy.
 * Never mutate original audio, segment timecodes, raw R2 text or member rewards.
 * Only explicit removable spans may be deleted; no rewriting or translations.
 */
export type CleanupPolicy = {
  enabled: boolean;
  fillerWords: string[];
  keepWords: string[];
  conditionalWords: string[];
  removeStutters: boolean;
  semanticJudgment: boolean;
};
export const DEFAULT_CLEANUP_POLICY: CleanupPolicy = {
  enabled: true,
  fillerWords: ['呃', '呃呃', '嗯呃', '厄', '呃嗯'],
  keepWords: ['嗯', '對', '好', '喔', '非常', '重要'],
  conditionalWords: ['那個', '就是', '然後'],
  removeStutters: true,
  semanticJudgment: true
};

const punctuation = /[\s，。、：:；;！!？?.,]/u;
const wordRx = /^[\p{Script=Han}\p{Script=Latin}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul} -]{1,12}$/u;
const unique = (items: unknown, label: string): string[] => {
  if (!Array.isArray(items) || items.length > 40) throw new Error(label + '最多 40 個');
  const next: string[] = [];
  for (const raw of items) {
    if (typeof raw !== 'string') throw new Error(label + '必須是文字');
    const w = raw.trim();
    if (!wordRx.test(w)) throw new Error(label + '包含不支援的詞語');
    if (!next.includes(w)) next.push(w);
  }
  return next;
};
export function validateCleanupPolicy(raw: any): CleanupPolicy {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('設定格式錯誤');
  for (const key of ['enabled','removeStutters','semanticJudgment']) {
    if (typeof raw[key] !== 'boolean') throw new Error(key + '必須選擇開或關');
  }
  const policy: CleanupPolicy = {
    enabled: raw.enabled, removeStutters: raw.removeStutters, semanticJudgment: raw.semanticJudgment,
    fillerWords: unique(raw.fillerWords, '刪除詞'),
    keepWords: unique(raw.keepWords, '保留詞'),
    conditionalWords: unique(raw.conditionalWords, '語意判斷詞')
  };
  // Keeping a phrase always wins. Even user-defined removal words are not blindly deleted inside sentences.
  return policy;
}
export type CleanupCandidate = { id: string; start: number; end: number; word: string };
export function semanticCandidates(source: string, policy: CleanupPolicy): CleanupCandidate[] {
  if (!policy.enabled || !policy.semanticJudgment) return [];
  const text = String(source || '');
  const candidates: CleanupCandidate[] = [];
  for (const word of policy.conditionalWords) {
    if (policy.keepWords.includes(word)) continue;
    let from = 0, i = 0;
    while ((i = text.indexOf(word, from)) !== -1) {
      const start = i, end = i + word.length;
      // Context determines whether this is a filler or meaningful word.
      candidates.push({ id: String(start) + ':' + word, start, end, word });
      from = end;
      if (candidates.length >= 40) return candidates.sort((a,b)=>a.start-b.start);
    }
  }
  return candidates.sort((a,b)=>a.start-b.start);
}
function hasBoundary(value: string | undefined) {
  return !value || punctuation.test(value);
}
export function cleanTranscriptText(source: string, policy: CleanupPolicy, semanticIds: string[] = []): string {
  const raw = String(source || '');
  if (!policy.enabled || !raw) return raw;
  let next = raw;
  const selected = new Set(semanticIds);
  const targets = semanticCandidates(raw, policy).filter(c => selected.has(c.id));
  // Remove chosen spans only, never model-written replacement text.
  for (const c of targets.sort((a,b)=>b.start-a.start)) {
    next = next.slice(0,c.start) + next.slice(c.end);
  }
  for (const word of [...policy.fillerWords].sort((a,b)=>b.length-a.length)) {
    if (policy.keepWords.includes(word)) continue;
    let cursor=0;
    while (cursor < next.length) {
      const at = next.indexOf(word,cursor);
      if (at < 0) break;
      const left = at ? next[at-1] : '';
      const right = next[at+word.length] || '';
      // Do not remove the first character of real words such as "厄運".
      const conservative = hasBoundary(left) && (hasBoundary(right) || word.startsWith('呃'));
      if (conservative) {
        next = next.slice(0,at) + next.slice(at+word.length);
        cursor = at;
      } else cursor = at + word.length;
    }
  }
  if (policy.removeStutters) {
    // Only three+ repeated Han characters at clause starts; deliberate doubled emphasis stays.
    next = next.replace(/(^|[\s，。、！？!?；;])([\p{Script=Han}])\2{2,}(?=[\p{Script=Han}])/gu,'$1$2');
  }
  next = next.replace(/[ \t]{2,}/g,' ').replace(/^[，,、 \t]+/u,'').replace(/\s+([，。、！？!?；;])/gu,'$1').trim();
  // Never invent or erase the entire meaning-bearing segment.
  return next || raw;
}
export function cleanupPreview(text: string, policy: CleanupPolicy, ids: string[] = []) {
  const before = String(text || '');
  return { before, after: cleanTranscriptText(before,policy,ids), changed: before !== cleanTranscriptText(before,policy,ids) };
}

/**
 * Evidence-first excerpt selection for Echo QA.
 *
 * This is a conservative relevance floor, NOT a semantic entailment/accuracy
 * certification. A fragment with zero overlap must never be turned into
 * model context just because no stronger result was found. Authorization
 * and source-version checks must be made by the server before this step.
 */
export type QaCandidateEvidence = Readonly<{
  score: number;
  part: string;
  title: string;
}>;

export type QaSelectedEvidence = Readonly<{
  prompt: string;
  sources: string[];
}>;

export function selectRelevantQaEvidence(
  found: readonly QaCandidateEvidence[],
  terms: readonly string[],
  maxResults: number,
): QaSelectedEvidence {
  const empty: QaSelectedEvidence = { prompt: '', sources: [] };
  if (!Array.isArray(terms) || !terms.length ||
      !terms.every(term => typeof term === 'string' && term.length >= 2) ||
      !Number.isSafeInteger(maxResults) || maxResults < 1 || maxResults > 20 ||
      !Array.isArray(found)) return empty;

  const ranked = found.filter(item =>
    !!item && Number.isFinite(item.score) && item.score > 0 &&
    typeof item.part === 'string' && item.part.trim().length > 0 &&
    typeof item.title === 'string'
  ).sort((a, b) => b.score - a.score).slice(0, maxResults);

  // A zero-score search, an empty question, or invalid evidence must NOT
  // produce a potentially misleading AI response or accrue provider costs.
  const prompt = ranked.map(item => item.part).join('\n').slice(0, 9000);
  if (!prompt) return empty;
  return {
    prompt,
    sources: [...new Set(ranked.map(item => item.title).filter(Boolean))].slice(0, 3),
  };
}

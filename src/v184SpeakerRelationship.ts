// v184 historical relationship matching intentionally recognizes several legacy
// combined-name formats. Keep it separate from v187 database migration parsing:
// v187 only migrates names explicitly joined with & / ＆, as requested.
const COMBINED_SPEAKER_SEPARATOR = /\s*(?:&|＆|、|\/|／|\+|＋|,|，|\||｜|與|及)\s*/g;

export function normalizeSpeakerName(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/\s+/g, '')
    .trim();
}

export function splitSpeakerNames(value: unknown): string[] {
  const normalized = normalizeSpeakerName(value);
  if (!normalized) return [];
  const seen = new Set<string>();
  const names: string[] = [];
  for (const part of normalized.split(COMBINED_SPEAKER_SEPARATOR)) {
    const name = normalizeSpeakerName(part);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  return names;
}

export function isCombinedSpeakerName(value: unknown): boolean {
  return splitSpeakerNames(value).length > 1;
}

export function hiddenSpeakerKeys(value: string) {
  const full = normalizeSpeakerName(value);
  const parts = splitSpeakerNames(value);
  return Array.from(new Set([full, ...parts].filter(name => name.length >= 2)));
}

export function speakerMatchesHiddenEntry(trackSpeaker: unknown, hiddenEntry: unknown): boolean {
  const trackNames = new Set(splitSpeakerNames(trackSpeaker));
  if (!trackNames.size) return false;
  return splitSpeakerNames(hiddenEntry).some(name => trackNames.has(name));
}

export function speakerMatchesAnyHiddenEntry(trackSpeaker: unknown, hiddenEntries: Iterable<string>): boolean {
  for (const hiddenEntry of hiddenEntries) {
    if (speakerMatchesHiddenEntry(trackSpeaker, hiddenEntry)) return true;
  }
  return false;
}

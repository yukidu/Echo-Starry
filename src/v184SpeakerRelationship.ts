const COMBINED_SPEAKER_SEPARATOR = /\s*(?:&|＆|、|\/|／|\+|＋|,|，|\||｜|與|及)\s*/g;

export function normalizeSpeakerName(value: string) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/\s+/g, '')
    .trim();
}

export function splitSpeakerNames(value: string) {
  const raw = String(value || '').trim();
  if (!raw) return [];
  const parts = raw
    .split(COMBINED_SPEAKER_SEPARATOR)
    .map(normalizeSpeakerName)
    .filter(name => name.length >= 2);
  return Array.from(new Set(parts));
}

export function isCombinedSpeakerName(value: string) {
  return splitSpeakerNames(value).length > 1;
}

export function hiddenSpeakerKeys(value: string) {
  const full = normalizeSpeakerName(value);
  const parts = splitSpeakerNames(value);
  return Array.from(new Set([full, ...parts].filter(name => name.length >= 2)));
}

export function speakerMatchesHiddenEntry(trackSpeaker: string, hiddenEntry: string) {
  const track = normalizeSpeakerName(trackSpeaker);
  if (!track) return false;
  return hiddenSpeakerKeys(hiddenEntry).some(key => track.includes(key));
}

export function speakerMatchesAnyHiddenEntry(trackSpeaker: string, hiddenEntries: Iterable<string>) {
  for (const hiddenEntry of hiddenEntries) {
    if (speakerMatchesHiddenEntry(trackSpeaker, hiddenEntry)) return true;
  }
  return false;
}

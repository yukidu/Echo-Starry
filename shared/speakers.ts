export const MAX_TRACK_SPEAKERS = 5;

const SPEAKER_SEPARATOR = /\s*(?:&|＆|、|\/|／|\+|＋|,|，|\||｜|與|及)\s*/g;

export function normalizeSpeakerName(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/\s+/g, '')
    .trim();
}

export function splitSpeakerNames(value: unknown): string[] {
  const raw = String(value ?? '').trim();
  if (!raw) return [];
  const seen = new Set<string>();
  const names: string[] = [];
  for (const part of raw.split(SPEAKER_SEPARATOR)) {
    const name = normalizeSpeakerName(part);
    if (!name) continue;
    const key = name.toLocaleLowerCase('zh-Hant');
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names;
}

export function parseSpeakerInput(value: unknown): string[] {
  const source = Array.isArray(value) ? value : [value];
  const seen = new Set<string>();
  const names: string[] = [];
  for (const item of source) {
    for (const name of splitSpeakerNames(item)) {
      const key = name.toLocaleLowerCase('zh-Hant');
      if (seen.has(key)) continue;
      seen.add(key);
      names.push(name);
    }
  }
  return names;
}

export function normalizeTrackSpeakers(value: unknown): string[] {
  return parseSpeakerInput(value).slice(0, MAX_TRACK_SPEAKERS);
}

export function speakerDisplay(value: unknown): string {
  return normalizeTrackSpeakers(value).join('&');
}

export function isCombinedSpeakerName(value: unknown): boolean {
  return splitSpeakerNames(value).length > 1;
}

export function speakerMatchesHiddenEntry(trackSpeaker: unknown, hiddenEntry: unknown): boolean {
  const trackNames = parseSpeakerInput(trackSpeaker);
  const hiddenNames = parseSpeakerInput(hiddenEntry);
  if (!trackNames.length || !hiddenNames.length) return false;
  const trackKeys = new Set(trackNames.map(name => name.toLocaleLowerCase('zh-Hant')));
  return hiddenNames.some(name => trackKeys.has(name.toLocaleLowerCase('zh-Hant')));
}

export function speakerMatchesAnyHiddenEntry(trackSpeaker: unknown, hiddenEntries: Iterable<string>): boolean {
  for (const hiddenEntry of hiddenEntries) {
    if (speakerMatchesHiddenEntry(trackSpeaker, hiddenEntry)) return true;
  }
  return false;
}

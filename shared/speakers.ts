export const MAX_TRACK_SPEAKERS = 5;

// Existing Echo Stars data has historically represented multiple speakers with
// ASCII/full-width ampersands. Keep migration/input parsing intentionally narrow
// so names containing commas, slashes, plus signs, etc. are not reinterpreted.
const SPEAKER_SEPARATOR = /\s*[&＆]\s*/g;

export function normalizeSpeakerName(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim();
}

function speakerIdentityKey(value: unknown): string {
  return normalizeSpeakerName(value)
    .replace(/\s+/g, '')
    .toLocaleLowerCase('zh-Hant');
}

export function splitSpeakerNames(value: unknown): string[] {
  const raw = String(value ?? '').trim();
  if (!raw) return [];
  const seen = new Set<string>();
  const names: string[] = [];
  for (const part of raw.split(SPEAKER_SEPARATOR)) {
    const name = normalizeSpeakerName(part);
    const key = speakerIdentityKey(name);
    if (!name || !key || seen.has(key)) continue;
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
      const key = speakerIdentityKey(name);
      if (!key || seen.has(key)) continue;
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
  const trackKeys = new Set(parseSpeakerInput(trackSpeaker).map(speakerIdentityKey));
  if (!trackKeys.size) return false;
  return parseSpeakerInput(hiddenEntry).some(name => trackKeys.has(speakerIdentityKey(name)));
}

export function speakerMatchesAnyHiddenEntry(trackSpeaker: unknown, hiddenEntries: Iterable<string>): boolean {
  for (const hiddenEntry of hiddenEntries) {
    if (speakerMatchesHiddenEntry(trackSpeaker, hiddenEntry)) return true;
  }
  return false;
}

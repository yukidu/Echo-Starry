import {
  MAX_TRACK_SPEAKERS,
  normalizeSpeakerName,
  splitSpeakerNames,
  parseSpeakerInput,
  normalizeTrackSpeakers,
  speakerDisplay,
  isCombinedSpeakerName,
  speakerMatchesHiddenEntry,
  speakerMatchesAnyHiddenEntry
} from '../shared/speakers';

export {
  MAX_TRACK_SPEAKERS,
  normalizeSpeakerName,
  splitSpeakerNames,
  parseSpeakerInput,
  normalizeTrackSpeakers,
  speakerDisplay,
  isCombinedSpeakerName,
  speakerMatchesHiddenEntry,
  speakerMatchesAnyHiddenEntry
};

// Retain this historical export for any older consumers while using the same
// canonical parsing rules as the v187 multi-speaker model.
export function hiddenSpeakerKeys(value: string) {
  const full = normalizeSpeakerName(value);
  const parts = splitSpeakerNames(value);
  return Array.from(new Set([full, ...parts].filter(name => name.length >= 2)));
}

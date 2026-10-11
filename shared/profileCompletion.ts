// User-editable profile fields; derived numerology and audit fields are excluded.
export const PROFILE_REQUIRED_FIELDS = ['name','avatar','amwayId','residence','center','rank','joinReason','stayReason','sponsor','platinumUpline','diamondUpline','birthday'] as const;
export function missingProfileFields(profile: Record<string, unknown>) {
  return PROFILE_REQUIRED_FIELDS.filter(key => !String(profile[key] ?? '').trim());
}

// Each visual size band has one exact server-enforced reward.
// Smallest = 1.00 battery; largest = 0.01 battery.
// Ten sizes between use one-cent steps (0.11 down to 0.02).
export const METEOR_REWARD_HUNDREDTHS = [100, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1] as const;

export function meteorRewardHundredths(level: unknown): number | null {
  if (typeof level !== 'number' || !Number.isInteger(level)) return null;
  if (level < 1 || level > METEOR_REWARD_HUNDREDTHS.length) return null;
  return METEOR_REWARD_HUNDREDTHS[level - 1];
}

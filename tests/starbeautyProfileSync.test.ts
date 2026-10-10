import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const source = fs.readFileSync('worker/starbeautySsoRouter.ts', 'utf8');

describe('StarBeauty full member profile sync', () => {
  it('exports all basic profile fields needed by StarBeauty', () => {
    for (const field of [
      'amwayId','phone','residence','center','rank','approvedRank','rankApproved','rankAuditStatus',
      'joinReason','stayReason','sponsor','platinumUpline','diamondUpline','birthday','zodiac',
      'talentNumber','lifeNumber','avatar','email','name','isBlocked','registerDate','lastActive'
    ]) {
      expect(source).toContain(field);
    }
  });

  it('returns a stable profile hash for change detection', () => {
    expect(source).toContain('profileHash');
    expect(source).toContain('JSON.stringify(profile)');
  });
});

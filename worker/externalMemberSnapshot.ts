import type { Env } from './index';
import { getMemberById, MEMBER_SCHEMA_VERSION } from './memberRepository';
import {
  ensureOrganizationSchema,
  organizationForUser,
  organizationSummary,
  type UplineKind
} from './organizationModel';

export const STARBEAUTY_PROFILE_CONTRACT_VERSION = 'echostars-member-profile-v2';

function text(value: unknown): string {
  return value == null ? '' : String(value);
}

function numeric(value: unknown): number {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function organizationProjection(group: any) {
  if (!group) return null;
  return {
    groupId: text(group.id),
    dealerId: text(group.dealerId),
    displayName: text(group.displayName),
    memberIds: Array.isArray(group.members) ? group.members.map((member: any) => text(member.id)).filter(Boolean) : []
  };
}

async function canonicalUplines(db: NonNullable<Env['DB']>, userId: string) {
  await ensureOrganizationSchema(db);
  const { results } = await db.prepare(`
    SELECT kind, groupId
    FROM upline_bindings
    WHERE memberId = ? AND kind IN ('platinum','diamond')
  `).bind(userId).all();

  const output: Record<UplineKind, ReturnType<typeof organizationProjection>> = {
    platinum: null,
    diamond: null
  };

  for (const row of results || []) {
    const kind = String((row as any).kind) as UplineKind;
    if (kind !== 'platinum' && kind !== 'diamond') continue;
    const group = await organizationSummary(db, String((row as any).groupId || ''));
    output[kind] = organizationProjection(group);
  }
  return output;
}

export function stableStarBeautyProfile(profile: Record<string, unknown>) {
  // lastActive / playCount are high-frequency activity data. They stay visible in
  // the response for compatibility, but do not force StarBeauty to rewrite its
  // member snapshot on every login or playback update.
  const { lastActive: _lastActive, playCount: _playCount, ...stable } = profile;
  return stable;
}

export async function readStarBeautyMemberSnapshot(db: NonNullable<Env['DB']>, userId: string) {
  const member: any = await getMemberById(db, userId);
  if (!member) return null;

  await ensureOrganizationSchema(db);
  const [organization, uplines] = await Promise.all([
    organizationForUser(db, userId),
    canonicalUplines(db, userId)
  ]);

  const platinumLabel = uplines.platinum?.displayName || text(member.platinumUpline);
  const diamondLabel = uplines.diamond?.displayName || text(member.diamondUpline);

  const profile: Record<string, unknown> = {
    profileContractVersion: STARBEAUTY_PROFILE_CONTRACT_VERSION,
    sourceMemberSchemaVersion: MEMBER_SCHEMA_VERSION,
    id: text(member.id),
    email: text(member.email),
    name: text(member.name),
    avatar: text(member.avatar),
    googleAvatar: text(member.googleAvatar),
    amwayId: text(member.amwayId),
    phone: text(member.phone),
    residence: text(member.residence),
    center: text(member.center),
    rank: text(member.rank),
    approvedRank: text(member.approvedRank),
    rankApproved: Boolean(member.rankApproved),
    rankAuditStatus: text(member.rankAuditStatus),
    rankAuditType: text(member.rankAuditType),
    rankUpdatedAt: text(member.rankUpdatedAt),
    role: text(member.role),
    joinReason: text(member.joinReason),
    stayReason: text(member.stayReason),
    sponsor: text(member.sponsor),
    platinumUpline: platinumLabel,
    diamondUpline: diamondLabel,
    birthday: text(member.birthday || member.birthDate),
    birthDate: text(member.birthDate),
    zodiac: text(member.zodiac),
    talentNumber: member.talentNumber == null ? null : Number(member.talentNumber),
    lifeNumber: member.lifeNumber == null ? null : Number(member.lifeNumber),
    registerDate: text(member.registerDate),
    auditedBy: text(member.auditedBy),
    auditedAt: text(member.auditedAt),
    isContributor: Boolean(member.isContributor),
    isAdminUser: Boolean(member.isAdminUser),
    canUpload: Boolean(member.canUpload),
    isBlocked: Boolean(member.isBlocked),
    avatarUploadCount: numeric(member.avatarUploadCount),
    avatarUploadMonth: text(member.avatarUploadMonth),
    profileEditCount: numeric(member.profileEditCount),
    profileEditMonth: text(member.profileEditMonth),
    playCount: numeric(member.playCount),
    lastActive: text(member.lastActive),
    organization: organizationProjection(organization),
    uplines
  };

  return {
    identity: {
      id: text(member.id),
      email: text(member.email),
      name: text(member.name || member.email),
      avatar: text(member.avatar || member.googleAvatar)
    },
    profile,
    profileUpdatedAt: text(member.rankUpdatedAt || member.auditedAt || member.profileEditMonth || member.registerDate),
    blocked: Boolean(member.isBlocked)
  };
}

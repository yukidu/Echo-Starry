type StarrySyncEnv = {
  DB?: any;
  STARRY_ID_DB?: any;
};

const SHARED_PROFILE_FIELDS = [
  'name', 'avatar', 'googleAvatar', 'amwayId', 'phone', 'residence', 'center',
  'rank', 'approvedRank', 'rankApproved', 'rankAuditStatus', 'rankAuditType', 'rankUpdatedAt',
  'joinReason', 'stayReason', 'birthday', 'motto', 'zodiac', 'talentNumber', 'lifeNumber',
  'registerDate', 'auditedBy', 'auditedAt'
] as const;

const RELATIONSHIPS = [
  ['sponsor', 'sponsor'],
  ['platinum_upline', 'platinumUpline'],
  ['diamond_upline', 'diamondUpline']
] as const;

function text(value: unknown) {
  return value == null ? '' : String(value).trim();
}

function lower(value: unknown) {
  return text(value).toLowerCase();
}

function integerOrNull(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : null;
}

function normalizeBirthday(value: unknown) {
  const raw = text(value);
  if (!raw) return '';
  const match = raw.match(/^(\d{4})[-\/]?(\d{1,2})[-\/]?(\d{1,2})$/);
  if (!match) return '';
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) return '';
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function birthdayDerived(birthday: string) {
  if (!birthday) return null;
  const [year, monthText, dayText] = birthday.split('-');
  const month = Number(monthText);
  const day = Number(dayText);
  const digits = `${year}${monthText}${dayText}`.split('').map(Number);
  const talentNumber = digits.reduce((sum, value) => sum + value, 0);
  let lifeNumber = talentNumber;
  while (lifeNumber >= 10) lifeNumber = String(lifeNumber).split('').reduce((sum, value) => sum + Number(value), 0);
  let zodiac = '雙魚座';
  if ((month === 3 && day >= 21) || (month === 4 && day <= 19)) zodiac = '牡羊座';
  else if ((month === 4 && day >= 20) || (month === 5 && day <= 20)) zodiac = '金牛座';
  else if ((month === 5 && day >= 21) || (month === 6 && day <= 21)) zodiac = '雙子座';
  else if ((month === 6 && day >= 22) || (month === 7 && day <= 22)) zodiac = '巨蟹座';
  else if ((month === 7 && day >= 23) || (month === 8 && day <= 22)) zodiac = '獅子座';
  else if ((month === 8 && day >= 23) || (month === 9 && day <= 22)) zodiac = '處女座';
  else if ((month === 9 && day >= 23) || (month === 10 && day <= 23)) zodiac = '天秤座';
  else if ((month === 10 && day >= 24) || (month === 11 && day <= 22)) zodiac = '天蠍座';
  else if ((month === 11 && day >= 23) || (month === 12 && day <= 21)) zodiac = '射手座';
  else if ((month === 12 && day >= 22) || (month === 1 && day <= 19)) zodiac = '摩羯座';
  else if ((month === 1 && day >= 20) || (month === 2 && day <= 18)) zodiac = '水瓶座';
  return { zodiac, talentNumber, lifeNumber };
}

function profileValue(source: any, field: typeof SHARED_PROFILE_FIELDS[number]) {
  if (field === 'birthday') return normalizeBirthday(source.birthday ?? source.birthDate);
  if (field === 'rankApproved') return source.rankApproved ? 1 : 0;
  if (field === 'talentNumber' || field === 'lifeNumber') return integerOrNull(source[field]);
  return text(source[field]);
}

function auditStatement(
  central: any,
  centralId: string,
  actorUserId: string,
  fieldName: string,
  oldValue: unknown,
  newValue: unknown,
  now: number
) {
  return central.prepare(`INSERT INTO profile_audit_logs
    (id,userId,appId,actorUserId,fieldName,oldValue,newValue,createdAt)
    VALUES (?,?,?,?,?,?,?,?)`)
    .bind(
      crypto.randomUUID(),
      centralId,
      'echostars',
      actorUserId || 'system',
      fieldName,
      oldValue == null ? '' : String(oldValue),
      newValue == null ? '' : String(newValue),
      now
    );
}

/**
 * EchoStars -> Starry ID compatibility synchronization.
 *
 * v306 source-of-truth rules:
 * - Starry ID central profiles are the ONLY authoritative personal-profile source.
 * - Legacy Echo profile fields may seed a profile ONLY when the central profile does not exist yet.
 * - New legacy seeds normalize birthday and recompute zodiac / numerology before entering central storage.
 * - Once a central profile exists, Echo may update app_memberships / identity links only.
 * - A legacy rank-approval event may approve an already-pending CENTRAL rank, but the rank value
 *   always comes from the central pending profile; a stale Echo rank can never replace it.
 * - Existing central relationships are never rewritten from legacy Echo labels.
 * - Email alone never silently merges two users.
 */
export async function syncEchoMemberToStarry(env: StarrySyncEnv, userId: string, actorUserId = 'system') {
  if (!env.DB || !env.STARRY_ID_DB || !userId) return false;

  const source: any = await env.DB.prepare('SELECT * FROM users WHERE id = ? LIMIT 1').bind(userId).first();
  if (!source) return false;

  const central = env.STARRY_ID_DB;
  const sourceId = text(source.id);
  const email = lower(source.email);
  const googleSubject = text(source.googleSubject);
  if (!sourceId || !email) throw new Error('Starry ID sync requires source id and email');

  const legacyOwner: any = await central.prepare(
    "SELECT userId FROM legacy_links WHERE sourceApp = 'echostars' AND sourceUserId = ? LIMIT 1"
  ).bind(sourceId).first();
  const identityOwner: any = googleSubject ? await central.prepare(
    "SELECT userId FROM identities WHERE provider = 'google' AND providerSubject = ? LIMIT 1"
  ).bind(googleSubject).first() : null;
  const emailOwner: any = await central.prepare(
    'SELECT id FROM users WHERE LOWER(TRIM(primaryEmail)) = ? LIMIT 1'
  ).bind(email).first();

  const legacyId = text(legacyOwner?.userId);
  const identityId = text(identityOwner?.userId);
  const trustedIds = [...new Set([legacyId, identityId].filter(Boolean))];
  if (trustedIds.length > 1) throw new Error('Starry ID legacy link and Google identity disagree');

  const centralId = trustedIds[0] || sourceId;
  if (emailOwner && text(emailOwner.id) !== centralId) throw new Error('Starry ID email belongs to another user');

  const now = Date.now();
  const oldProfile: any = await central.prepare('SELECT * FROM profiles WHERE userId = ? LIMIT 1').bind(centralId).first();
  const statements: any[] = [
    central.prepare(`INSERT INTO users (id,primaryEmail,status,createdAt,updatedAt)
      VALUES (?,?,'active',?,?)
      ON CONFLICT(id) DO UPDATE SET updatedAt=excluded.updatedAt`)
      .bind(centralId, email, now, now),
    central.prepare(`INSERT INTO app_memberships
      (userId,appId,status,role,isAdminUser,isContributor,canUpload,joinedAt,updatedAt)
      VALUES (?,'echostars',?,?,?,?,?,?,?)
      ON CONFLICT(userId,appId) DO UPDATE SET
        status=CASE WHEN app_memberships.status='active' THEN excluded.status ELSE app_memberships.status END,
        role=excluded.role,isAdminUser=excluded.isAdminUser,
        isContributor=excluded.isContributor,canUpload=excluded.canUpload,updatedAt=excluded.updatedAt`)
      .bind(
        centralId,
        source.isBlocked ? 'blocked' : 'active',
        text(source.role),
        source.isAdminUser ? 1 : 0,
        source.isContributor ? 1 : 0,
        (source.canUpload || source.isContributor) ? 1 : 0,
        Number.isFinite(Date.parse(source.registerDate || '')) ? Date.parse(source.registerDate) : now,
        now
      ),
    central.prepare(`INSERT INTO legacy_links (sourceApp,sourceUserId,userId,sourceEmail,importedAt)
      VALUES ('echostars',?,?,?,?)
      ON CONFLICT(sourceApp,sourceUserId) DO UPDATE SET
        userId=excluded.userId,sourceEmail=excluded.sourceEmail,importedAt=excluded.importedAt`)
      .bind(sourceId, centralId, email, now)
  ];

  if (googleSubject) {
    statements.splice(1, 0, central.prepare(`INSERT INTO identities
      (provider,providerSubject,userId,providerEmail,emailVerified,createdAt,lastSeenAt)
      VALUES ('google',?,?,?,1,?,?)
      ON CONFLICT(provider,providerSubject) DO UPDATE SET
        userId=excluded.userId,providerEmail=excluded.providerEmail,emailVerified=1,lastSeenAt=excluded.lastSeenAt`)
      .bind(googleSubject, centralId, email, now, now));
  }

  if (!oldProfile) {
    const profileValues: Record<string, unknown> = { userId: centralId };
    for (const field of SHARED_PROFILE_FIELDS) profileValues[field] = profileValue(source, field);

    const birthday = text(profileValues.birthday);
    const derived = birthdayDerived(birthday);
    if (derived) {
      profileValues.zodiac = derived.zodiac;
      profileValues.talentNumber = derived.talentNumber;
      profileValues.lifeNumber = derived.lifeNumber;
    } else if (text(source.birthday ?? source.birthDate)) {
      profileValues.birthday = '';
      profileValues.zodiac = '';
      profileValues.talentNumber = null;
      profileValues.lifeNumber = null;
    }

    if (Number(profileValues.rankApproved || 0) === 1 && !text(profileValues.approvedRank)) {
      const importedRank = text(profileValues.rank);
      if (importedRank) profileValues.approvedRank = importedRank;
      else profileValues.rankApproved = 0;
    }
    if (Number(profileValues.rankApproved || 0) === 1 && !text(profileValues.rankAuditStatus)) {
      profileValues.rankAuditStatus = 'approved';
    }

    profileValues.createdAt = now;
    profileValues.updatedAt = now;
    const profileColumns = ['userId', ...SHARED_PROFILE_FIELDS, 'createdAt', 'updatedAt'];
    statements.push(central.prepare(`INSERT INTO profiles (${profileColumns.join(',')})
      VALUES (${profileColumns.map(() => '?').join(',')})`)
      .bind(...profileColumns.map(column => profileValues[column])));

    for (const [relationType, sourceField] of RELATIONSHIPS) {
      const label = text(source[sourceField]);
      if (!label) continue;
      statements.push(central.prepare(`INSERT OR IGNORE INTO member_relationships
        (userId,relationType,relatedUserId,legacyLabel,resolutionStatus,updatedAt)
        VALUES (?,?,NULL,?,'unresolved',?)`)
        .bind(centralId, relationType, label, now));
    }
  } else {
    const centralPending = text(oldProfile.rankAuditStatus) === 'pending' && !Number(oldProfile.rankApproved || 0);
    const legacyApproved = text(source.rankAuditStatus) === 'approved' && Boolean(source.rankApproved);
    const pendingRank = text(oldProfile.rank);

    if (centralPending && legacyApproved && pendingRank) {
      const nextAuditType = text(source.rankAuditType) || 'echostars-review';
      const rankUpdatedAt = text(source.rankUpdatedAt) || new Date(now).toISOString();
      const nextValues: Record<string, unknown> = {
        rank: pendingRank,
        approvedRank: pendingRank,
        rankApproved: 1,
        rankAuditStatus: 'approved',
        rankAuditType: nextAuditType,
        rankUpdatedAt
      };

      statements.push(central.prepare(`UPDATE profiles SET
        rank=?,approvedRank=?,rankApproved=1,rankAuditStatus='approved',rankAuditType=?,rankUpdatedAt=?,updatedAt=?
        WHERE userId=?`)
        .bind(pendingRank, pendingRank, nextAuditType, rankUpdatedAt, now, centralId));

      for (const [field, next] of Object.entries(nextValues)) {
        const before = oldProfile[field];
        if (String(before ?? '') === String(next ?? '')) continue;
        statements.push(auditStatement(central, centralId, actorUserId, field, before, next, now));
      }
    }
  }

  await central.batch(statements);

  if (oldProfile) {
    const centralPending = text(oldProfile.rankAuditStatus) === 'pending' && !Number(oldProfile.rankApproved || 0);
    const legacyApproved = text(source.rankAuditStatus) === 'approved' && Boolean(source.rankApproved);
    const pendingRank = text(oldProfile.rank);
    if (centralPending && legacyApproved && pendingRank) {
      await env.DB.prepare(`UPDATE users SET
        rank=?,approvedRank=?,rankApproved=1,rankAuditStatus='approved',rankAuditType=?,rankUpdatedAt=?
        WHERE id=?`)
        .bind(pendingRank, pendingRank, text(source.rankAuditType) || 'echostars-review', text(source.rankUpdatedAt) || new Date(now).toISOString(), sourceId)
        .run();
    }
  }

  return true;
}

export async function syncEchoMemberToStarryBestEffort(
  env: StarrySyncEnv,
  userId: string,
  actorUserId = 'system',
  reason = 'member-sync'
) {
  if (!env.STARRY_ID_DB) return false;
  try {
    return await syncEchoMemberToStarry(env, userId, actorUserId);
  } catch (error) {
    console.warn('Starry ID compatibility sync skipped', {
      reason,
      userId,
      error: error instanceof Error ? error.message : 'unknown'
    });
    return false;
  }
}

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

function profileValue(source: any, field: typeof SHARED_PROFILE_FIELDS[number]) {
  if (field === 'birthday') return text(source.birthday ?? source.birthDate);
  if (field === 'rankApproved') return source.rankApproved ? 1 : 0;
  if (field === 'talentNumber' || field === 'lifeNumber') return integerOrNull(source[field]);
  return text(source[field]);
}

/**
 * EchoStars -> Starry ID durable profile synchronization.
 *
 * Safety rules:
 * - EchoStars remains available even if the central database is missing/unavailable.
 * - Stable user IDs are never silently merged by email or Google subject.
 * - EchoStars-only roles/permissions are written only to app_memberships.
 * - Source EchoStars data is never deleted.
 */
export async function syncEchoMemberToStarry(env: StarrySyncEnv, userId: string, actorUserId = 'system') {
  if (!env.DB || !env.STARRY_ID_DB || !userId) return false;

  const source: any = await env.DB.prepare('SELECT * FROM users WHERE id = ? LIMIT 1').bind(userId).first();
  if (!source) return false;

  const central = env.STARRY_ID_DB;
  const id = text(source.id);
  const email = lower(source.email);
  const googleSubject = text(source.googleSubject);
  if (!id || !email) throw new Error('Starry ID sync requires source id and email');

  const emailOwner: any = await central.prepare(
    'SELECT id FROM users WHERE LOWER(TRIM(primaryEmail)) = ? LIMIT 1'
  ).bind(email).first();
  if (emailOwner && text(emailOwner.id) !== id) {
    throw new Error('Starry ID email belongs to another user');
  }

  if (googleSubject) {
    const identityOwner: any = await central.prepare(
      "SELECT userId FROM identities WHERE provider = 'google' AND providerSubject = ? LIMIT 1"
    ).bind(googleSubject).first();
    if (identityOwner && text(identityOwner.userId) !== id) {
      throw new Error('Starry ID Google identity belongs to another user');
    }
  }

  const now = Date.now();
  const oldProfile: any = await central.prepare('SELECT * FROM profiles WHERE userId = ? LIMIT 1').bind(id).first();
  const profileValues: Record<string, unknown> = { userId: id };
  for (const field of SHARED_PROFILE_FIELDS) profileValues[field] = profileValue(source, field);
  profileValues.createdAt = now;
  profileValues.updatedAt = now;

  const profileColumns = ['userId', ...SHARED_PROFILE_FIELDS, 'createdAt', 'updatedAt'];
  const profileUpdates = [...SHARED_PROFILE_FIELDS, 'updatedAt']
    .map(field => `${field}=excluded.${field}`)
    .join(',');

  const statements: any[] = [
    central.prepare(`INSERT INTO users (id,primaryEmail,status,createdAt,updatedAt)
      VALUES (?,?,'active',?,?)
      ON CONFLICT(id) DO UPDATE SET primaryEmail=excluded.primaryEmail,updatedAt=excluded.updatedAt`)
      .bind(id, email, now, now),
    central.prepare(`INSERT INTO profiles (${profileColumns.join(',')})
      VALUES (${profileColumns.map(() => '?').join(',')})
      ON CONFLICT(userId) DO UPDATE SET ${profileUpdates}`)
      .bind(...profileColumns.map(column => profileValues[column])),
    central.prepare(`INSERT INTO app_memberships
      (userId,appId,status,role,isAdminUser,isContributor,canUpload,joinedAt,updatedAt)
      VALUES (?,'echostars',?,?,?,?,?,?,?)
      ON CONFLICT(userId,appId) DO UPDATE SET
        status=excluded.status,role=excluded.role,isAdminUser=excluded.isAdminUser,
        isContributor=excluded.isContributor,canUpload=excluded.canUpload,updatedAt=excluded.updatedAt`)
      .bind(
        id,
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
      .bind(id, id, email, now)
  ];

  if (googleSubject) {
    statements.splice(1, 0, central.prepare(`INSERT INTO identities
      (provider,providerSubject,userId,providerEmail,emailVerified,createdAt,lastSeenAt)
      VALUES ('google',?,?,?,1,?,?)
      ON CONFLICT(provider,providerSubject) DO UPDATE SET
        userId=excluded.userId,providerEmail=excluded.providerEmail,emailVerified=1,lastSeenAt=excluded.lastSeenAt`)
      .bind(googleSubject, id, email, now, now));
  }

  for (const [relationType, sourceField] of RELATIONSHIPS) {
    const label = text(source[sourceField]);
    if (!label) continue;
    statements.push(central.prepare(`INSERT INTO member_relationships
      (userId,relationType,relatedUserId,legacyLabel,resolutionStatus,updatedAt)
      VALUES (?,?,NULL,?,'unresolved',?)
      ON CONFLICT(userId,relationType) DO UPDATE SET
        legacyLabel=excluded.legacyLabel,
        updatedAt=excluded.updatedAt`)
      .bind(id, relationType, label, now));
  }

  if (oldProfile) {
    for (const field of SHARED_PROFILE_FIELDS) {
      const before = oldProfile[field] == null ? '' : String(oldProfile[field]);
      const afterValue = profileValues[field];
      const after = afterValue == null ? '' : String(afterValue);
      if (before === after) continue;
      statements.push(central.prepare(`INSERT INTO profile_audit_logs
        (id,userId,appId,actorUserId,fieldName,oldValue,newValue,createdAt)
        VALUES (?,?,?,?,?,?,?,?)`)
        .bind(crypto.randomUUID(), id, 'echostars', actorUserId || id, field, before, after, now));
    }
  }

  await central.batch(statements);
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
    // No PII in logs. Central outages/conflicts must never break EchoStars login/profile saves.
    console.warn('Starry ID sync skipped', {
      reason,
      userId,
      error: error instanceof Error ? error.message : 'unknown'
    });
    return false;
  }
}

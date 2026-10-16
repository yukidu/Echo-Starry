type FastProfileSyncEnv = {
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

function firstBatchRow(result: any) {
  return Array.isArray(result?.results) ? result.results[0] || null : null;
}

/**
 * Fast, synchronous Echo -> Starry ID profile write used by the explicit Save button.
 *
 * Unlike the historical best-effort sync, this function:
 * - receives the already-saved Echo member, so it does not query Echo D1 again;
 * - resolves all central ownership keys in one D1 batch round trip;
 * - writes user/profile/membership/legacy links/relations and audit records in one batch;
 * - throws on any central failure, so the UI cannot report success before Starry ID is written.
 */
export async function syncSavedEchoProfileToStarryId(
  env: FastProfileSyncEnv,
  source: any,
  actorUserId = 'system'
) {
  const central = env.STARRY_ID_DB;
  if (!central) throw new Error('Starry ID 中央會員資料庫目前未連線');

  const sourceId = text(source?.id);
  const email = lower(source?.email);
  const googleSubject = text(source?.googleSubject);
  if (!sourceId || !email) throw new Error('Starry ID 同步缺少會員識別資料');

  const ownershipQueries = [
    central.prepare("SELECT userId FROM legacy_links WHERE sourceApp = 'echostars' AND sourceUserId = ? LIMIT 1").bind(sourceId),
    central.prepare('SELECT id FROM users WHERE LOWER(TRIM(primaryEmail)) = ? LIMIT 1').bind(email)
  ];
  if (googleSubject) {
    ownershipQueries.push(
      central.prepare("SELECT userId FROM identities WHERE provider = 'google' AND providerSubject = ? LIMIT 1").bind(googleSubject)
    );
  }

  const ownershipResults = await central.batch(ownershipQueries);
  const legacyOwner = firstBatchRow(ownershipResults[0]);
  const emailOwner = firstBatchRow(ownershipResults[1]);
  const identityOwner = googleSubject ? firstBatchRow(ownershipResults[2]) : null;

  const legacyId = text(legacyOwner?.userId);
  const identityId = text(identityOwner?.userId);
  const trustedIds = [...new Set([legacyId, identityId].filter(Boolean))];
  if (trustedIds.length > 1) throw new Error('Starry ID 會員歸戶資料不一致');

  const centralId = trustedIds[0] || sourceId;
  if (emailOwner && text(emailOwner.id) !== centralId) {
    throw new Error('此 Email 已屬於另一個 Starry ID 會員');
  }

  const now = Date.now();
  const profileValues: Record<string, unknown> = { userId: centralId };
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
      ON CONFLICT(id) DO UPDATE SET primaryEmail=excluded.primaryEmail,status='active',updatedAt=excluded.updatedAt`)
      .bind(centralId, email, now, now)
  ];

  if (googleSubject) {
    statements.push(central.prepare(`INSERT INTO identities
      (provider,providerSubject,userId,providerEmail,emailVerified,createdAt,lastSeenAt)
      VALUES ('google',?,?,?,1,?,?)
      ON CONFLICT(provider,providerSubject) DO UPDATE SET
        userId=excluded.userId,providerEmail=excluded.providerEmail,emailVerified=1,lastSeenAt=excluded.lastSeenAt`)
      .bind(googleSubject, centralId, email, now, now));
  }

  // Audit previous values without a separate SELECT round trip. Each INSERT ... SELECT
  // runs before the profile UPSERT in the same central batch.
  for (const field of SHARED_PROFILE_FIELDS) {
    const afterValue = profileValues[field];
    const after = afterValue == null ? '' : String(afterValue);
    statements.push(central.prepare(`INSERT INTO profile_audit_logs
      (id,userId,appId,actorUserId,fieldName,oldValue,newValue,createdAt)
      SELECT ?,?,'echostars',?,?,COALESCE(CAST(${field} AS TEXT),''),?,?
      FROM profiles
      WHERE userId = ? AND COALESCE(CAST(${field} AS TEXT),'') <> ?`)
      .bind(crypto.randomUUID(), centralId, actorUserId || sourceId, field, after, now, centralId, after));
  }

  statements.push(
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
  );

  for (const [relationType, sourceField] of RELATIONSHIPS) {
    const label = text(source[sourceField]);
    if (!label) continue;
    statements.push(central.prepare(`INSERT INTO member_relationships
      (userId,relationType,relatedUserId,legacyLabel,resolutionStatus,updatedAt)
      VALUES (?,?,NULL,?,'unresolved',?)
      ON CONFLICT(userId,relationType) DO UPDATE SET
        legacyLabel=excluded.legacyLabel,updatedAt=excluded.updatedAt`)
      .bind(centralId, relationType, label, now));
  }

  await central.batch(statements);
  return { centralId, syncedAt: now };
}

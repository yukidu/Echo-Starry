-- Starry ID centralized Schema-driven member profile rules.
-- Ordinary future profile fields can be added as metadata + dynamic values without ALTER TABLE.

CREATE TABLE IF NOT EXISTS profile_schema_meta (
  id TEXT PRIMARY KEY CHECK(id = 'profile'),
  version INTEGER NOT NULL DEFAULT 1,
  updatedAt INTEGER NOT NULL
);

INSERT OR IGNORE INTO profile_schema_meta (id, version, updatedAt)
VALUES ('profile', 1, CAST(strftime('%s','now') AS INTEGER) * 1000);

CREATE TABLE IF NOT EXISTS profile_field_schema (
  fieldKey TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  fieldType TEXT NOT NULL,
  storageMode TEXT NOT NULL,
  optionsCategory TEXT,
  required INTEGER NOT NULL DEFAULT 0,
  minLength INTEGER,
  maxLength INTEGER,
  pattern TEXT,
  placeholder TEXT,
  helpText TEXT,
  editableBy TEXT NOT NULL DEFAULT 'member',
  isActive INTEGER NOT NULL DEFAULT 1,
  sortOrder INTEGER NOT NULL DEFAULT 0,
  updatedAt INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS profile_field_schema_active
ON profile_field_schema(isActive, sortOrder, fieldKey);

CREATE TABLE IF NOT EXISTS profile_dynamic_values (
  userId TEXT NOT NULL,
  fieldKey TEXT NOT NULL,
  value TEXT NOT NULL DEFAULT '',
  updatedAt INTEGER NOT NULL,
  PRIMARY KEY(userId, fieldKey),
  FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(fieldKey) REFERENCES profile_field_schema(fieldKey) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS profile_dynamic_values_user
ON profile_dynamic_values(userId, fieldKey);

-- profile_option_values already exists from v220/v221. Keep the CREATE here so
-- a fresh database can apply this migration independently.
CREATE TABLE IF NOT EXISTS profile_option_values (
  category TEXT NOT NULL,
  value TEXT NOT NULL,
  sortOrder INTEGER NOT NULL,
  isActive INTEGER NOT NULL DEFAULT 1,
  sourceApp TEXT NOT NULL DEFAULT 'starry-id',
  updatedAt INTEGER NOT NULL,
  PRIMARY KEY(category, value)
);

CREATE INDEX IF NOT EXISTS profile_option_values_active
ON profile_option_values(category, isActive, sortOrder);

-- Existing shared profile fields. INSERT OR IGNORE preserves future admin edits.
INSERT OR IGNORE INTO profile_field_schema VALUES
('name','姓名或暱稱','text','core',NULL,1,1,60,NULL,'請輸入姓名或暱稱','繁星生態系共用姓名','member',1,10,CAST(strftime('%s','now') AS INTEGER)*1000),
('avatar','大頭照','image','special',NULL,0,NULL,NULL,NULL,NULL,'照片仍使用各 App 的既有安全上傳流程','special',1,20,CAST(strftime('%s','now') AS INTEGER)*1000),
('amwayId','直銷商編號','text','special',NULL,0,1,40,'^[A-Za-z0-9_-]+$','例：12345678','由中央直銷商／夫妻綁定流程管理','special',1,30,CAST(strftime('%s','now') AS INTEGER)*1000),
('phone','手機','text','core',NULL,0,0,30,NULL,'請輸入手機號碼','私人資料，公開規則另行控制','member',1,40,CAST(strftime('%s','now') AS INTEGER)*1000),
('residence','居住地','select','core','residence',0,NULL,NULL,NULL,NULL,NULL,'member',1,50,CAST(strftime('%s','now') AS INTEGER)*1000),
('center','直銷商中心','select','core','center',0,NULL,NULL,NULL,NULL,NULL,'member',1,60,CAST(strftime('%s','now') AS INTEGER)*1000),
('rank','最高獎銜','select','core','rank',0,NULL,NULL,NULL,NULL,'變更後仍依中央獎銜審核流程處理','member',1,70,CAST(strftime('%s','now') AS INTEGER)*1000),
('joinReason','初次如何認識安麗？','select','core','joinReason',0,NULL,NULL,NULL,NULL,NULL,'member',1,80,CAST(strftime('%s','now') AS INTEGER)*1000),
('stayReason','什麼原因留在安麗？','select','core','stayReason',0,NULL,NULL,NULL,NULL,NULL,'member',1,90,CAST(strftime('%s','now') AS INTEGER)*1000),
('sponsor','推薦人','relationship','special',NULL,0,NULL,NULL,NULL,NULL,'使用中央會員關聯搜尋','special',1,100,CAST(strftime('%s','now') AS INTEGER)*1000),
('platinumUpline','上手白金','relationship','special',NULL,0,NULL,NULL,NULL,NULL,'使用中央會員關聯搜尋','special',1,110,CAST(strftime('%s','now') AS INTEGER)*1000),
('diamondUpline','上手鑽石','relationship','special',NULL,0,NULL,NULL,NULL,NULL,'使用中央會員關聯搜尋','special',1,120,CAST(strftime('%s','now') AS INTEGER)*1000),
('birthday','西元生日','date','core',NULL,0,NULL,NULL,NULL,NULL,'由生日在伺服器端計算星座與生命靈數','member',1,130,CAST(strftime('%s','now') AS INTEGER)*1000),
('motto','座右銘','textarea','core',NULL,0,0,300,NULL,'寫下你的座右銘',NULL,'member',1,140,CAST(strftime('%s','now') AS INTEGER)*1000),
('zodiac','星座','text','derived',NULL,0,NULL,NULL,NULL,NULL,'由生日自動計算','readonly',1,150,CAST(strftime('%s','now') AS INTEGER)*1000),
('talentNumber','天賦數','number','derived',NULL,0,NULL,NULL,NULL,NULL,'由生日自動計算','readonly',1,160,CAST(strftime('%s','now') AS INTEGER)*1000),
('lifeNumber','生命靈數','number','derived',NULL,0,NULL,NULL,NULL,NULL,'由生日自動計算','readonly',1,170,CAST(strftime('%s','now') AS INTEGER)*1000),
('spouse','夫妻關係','relationship','special',NULL,0,NULL,NULL,NULL,NULL,'由中央夫妻雙方確認流程管理','readonly',1,180,CAST(strftime('%s','now') AS INTEGER)*1000);

-- Any direct central rule/option change automatically advances schemaVersion.
-- Apps therefore only need to compare the version/ETag; no manual sync trigger.
CREATE TRIGGER IF NOT EXISTS profile_field_schema_version_insert
AFTER INSERT ON profile_field_schema
BEGIN
  UPDATE profile_schema_meta SET version = version + 1, updatedAt = CAST(strftime('%s','now') AS INTEGER) * 1000 WHERE id = 'profile';
END;

CREATE TRIGGER IF NOT EXISTS profile_field_schema_version_update
AFTER UPDATE ON profile_field_schema
BEGIN
  UPDATE profile_schema_meta SET version = version + 1, updatedAt = CAST(strftime('%s','now') AS INTEGER) * 1000 WHERE id = 'profile';
END;

CREATE TRIGGER IF NOT EXISTS profile_field_schema_version_delete
AFTER DELETE ON profile_field_schema
BEGIN
  UPDATE profile_schema_meta SET version = version + 1, updatedAt = CAST(strftime('%s','now') AS INTEGER) * 1000 WHERE id = 'profile';
END;

CREATE TRIGGER IF NOT EXISTS profile_option_values_schema_version_insert
AFTER INSERT ON profile_option_values
BEGIN
  UPDATE profile_schema_meta SET version = version + 1, updatedAt = CAST(strftime('%s','now') AS INTEGER) * 1000 WHERE id = 'profile';
END;

CREATE TRIGGER IF NOT EXISTS profile_option_values_schema_version_update
AFTER UPDATE ON profile_option_values
BEGIN
  UPDATE profile_schema_meta SET version = version + 1, updatedAt = CAST(strftime('%s','now') AS INTEGER) * 1000 WHERE id = 'profile';
END;

CREATE TRIGGER IF NOT EXISTS profile_option_values_schema_version_delete
AFTER DELETE ON profile_option_values
BEGIN
  UPDATE profile_schema_meta SET version = version + 1, updatedAt = CAST(strftime('%s','now') AS INTEGER) * 1000 WHERE id = 'profile';
END;

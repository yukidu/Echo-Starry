-- S45A / F22-S2 OFFLINE ONLY. Do not migrate production.
-- event_key: SHA-256 stable source-event key; member_key: trusted HMAC-SHA-256.
CREATE TABLE f22_s2_events (
 event_key TEXT PRIMARY KEY NOT NULL CHECK(length(event_key)=64),
 source_version INTEGER NOT NULL CHECK(source_version>0),
 payload_hash TEXT NOT NULL CHECK(length(payload_hash)=64),
 member_key TEXT NOT NULL CHECK(length(member_key)=64),
 track_key TEXT NOT NULL, day TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('done','failed','pending')),
 active INTEGER NOT NULL CHECK(active IN (0,1))
);
CREATE TABLE f22_s2_counts (
 day TEXT NOT NULL, group_key TEXT NOT NULL,
 calls INTEGER NOT NULL CHECK(calls>=0),
 done INTEGER NOT NULL CHECK(done>=0),
 failed INTEGER NOT NULL CHECK(failed>=0),
 pending INTEGER NOT NULL CHECK(pending>=0),
 PRIMARY KEY(day,group_key), CHECK(calls=done+failed+pending)
) WITHOUT ROWID;
CREATE TABLE f22_s2_presence (
 period_day TEXT NOT NULL, group_key TEXT NOT NULL, member_key TEXT NOT NULL,
 refs INTEGER NOT NULL CHECK(refs>=0),
 PRIMARY KEY(period_day,group_key,member_key)
) WITHOUT ROWID;
CREATE INDEX f22_s2_presence_group_day ON f22_s2_presence(group_key,period_day,member_key);

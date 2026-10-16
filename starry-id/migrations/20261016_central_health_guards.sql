-- v271: Starry ID central database relationship guards.
-- These triggers prevent new orphan rows in later central tables that were created
-- without SQLite FOREIGN KEY clauses. Existing history is repaired separately.

DROP TRIGGER IF EXISTS guard_starry_notifications_user_insert;
DROP TRIGGER IF EXISTS guard_starry_notifications_user_update;
DROP TRIGGER IF EXISTS guard_card_visit_owner_insert;
DROP TRIGGER IF EXISTS guard_card_visit_owner_update;
DROP TRIGGER IF EXISTS guard_card_visit_viewer_insert;
DROP TRIGGER IF EXISTS guard_card_visit_viewer_update;
DROP TRIGGER IF EXISTS guard_starry_push_user_insert;
DROP TRIGGER IF EXISTS guard_starry_push_user_update;
DROP TRIGGER IF EXISTS guard_battery_transactions_user_insert;
DROP TRIGGER IF EXISTS guard_battery_transactions_user_update;
DROP TRIGGER IF EXISTS guard_battery_accounts_user_insert;
DROP TRIGGER IF EXISTS guard_battery_accounts_user_update;
DROP TRIGGER IF EXISTS guard_battery_hundredth_user_insert;
DROP TRIGGER IF EXISTS guard_battery_hundredth_user_update;
DROP TRIGGER IF EXISTS guard_users_central_dependents_delete;

CREATE TRIGGER guard_starry_notifications_user_insert
BEFORE INSERT ON starry_notifications
WHEN NOT EXISTS (SELECT 1 FROM users WHERE id=NEW.userId)
BEGIN
  SELECT RAISE(ABORT,'central_user_reference_missing');
END;

CREATE TRIGGER guard_starry_notifications_user_update
BEFORE UPDATE OF userId ON starry_notifications
WHEN NOT EXISTS (SELECT 1 FROM users WHERE id=NEW.userId)
BEGIN
  SELECT RAISE(ABORT,'central_user_reference_missing');
END;

CREATE TRIGGER guard_card_visit_owner_insert
BEFORE INSERT ON card_visit_events
WHEN NOT EXISTS (SELECT 1 FROM users WHERE id=NEW.ownerUserId)
BEGIN
  SELECT RAISE(ABORT,'central_user_reference_missing');
END;

CREATE TRIGGER guard_card_visit_owner_update
BEFORE UPDATE OF ownerUserId ON card_visit_events
WHEN NOT EXISTS (SELECT 1 FROM users WHERE id=NEW.ownerUserId)
BEGIN
  SELECT RAISE(ABORT,'central_user_reference_missing');
END;

CREATE TRIGGER guard_card_visit_viewer_insert
BEFORE INSERT ON card_visit_events
WHEN TRIM(COALESCE(NEW.viewerUserId,''))<>''
  AND NOT EXISTS (SELECT 1 FROM users WHERE id=NEW.viewerUserId)
BEGIN
  SELECT RAISE(ABORT,'central_user_reference_missing');
END;

CREATE TRIGGER guard_card_visit_viewer_update
BEFORE UPDATE OF viewerUserId ON card_visit_events
WHEN TRIM(COALESCE(NEW.viewerUserId,''))<>''
  AND NOT EXISTS (SELECT 1 FROM users WHERE id=NEW.viewerUserId)
BEGIN
  SELECT RAISE(ABORT,'central_user_reference_missing');
END;

CREATE TRIGGER guard_starry_push_user_insert
BEFORE INSERT ON starry_push_subscriptions
WHEN NOT EXISTS (SELECT 1 FROM users WHERE id=NEW.userId)
BEGIN
  SELECT RAISE(ABORT,'central_user_reference_missing');
END;

CREATE TRIGGER guard_starry_push_user_update
BEFORE UPDATE OF userId ON starry_push_subscriptions
WHEN NOT EXISTS (SELECT 1 FROM users WHERE id=NEW.userId)
BEGIN
  SELECT RAISE(ABORT,'central_user_reference_missing');
END;

CREATE TRIGGER guard_battery_transactions_user_insert
BEFORE INSERT ON battery_transactions
WHEN NOT EXISTS (SELECT 1 FROM users WHERE id=NEW.userId)
BEGIN
  SELECT RAISE(ABORT,'central_user_reference_missing');
END;

CREATE TRIGGER guard_battery_transactions_user_update
BEFORE UPDATE OF userId ON battery_transactions
WHEN NOT EXISTS (SELECT 1 FROM users WHERE id=NEW.userId)
BEGIN
  SELECT RAISE(ABORT,'central_user_reference_missing');
END;

CREATE TRIGGER guard_battery_accounts_user_insert
BEFORE INSERT ON battery_accounts
WHEN NOT EXISTS (SELECT 1 FROM users WHERE id=NEW.userId)
BEGIN
  SELECT RAISE(ABORT,'central_user_reference_missing');
END;

CREATE TRIGGER guard_battery_accounts_user_update
BEFORE UPDATE OF userId ON battery_accounts
WHEN NOT EXISTS (SELECT 1 FROM users WHERE id=NEW.userId)
BEGIN
  SELECT RAISE(ABORT,'central_user_reference_missing');
END;

CREATE TRIGGER guard_battery_hundredth_user_insert
BEFORE INSERT ON battery_hundredth_transactions
WHEN NOT EXISTS (SELECT 1 FROM users WHERE id=NEW.userId)
BEGIN
  SELECT RAISE(ABORT,'central_user_reference_missing');
END;

CREATE TRIGGER guard_battery_hundredth_user_update
BEFORE UPDATE OF userId ON battery_hundredth_transactions
WHEN NOT EXISTS (SELECT 1 FROM users WHERE id=NEW.userId)
BEGIN
  SELECT RAISE(ABORT,'central_user_reference_missing');
END;

-- Do not silently cascade financial or notification history when a central user is deleted.
-- A future account-deletion flow must explicitly clean or archive these rows first.
CREATE TRIGGER guard_users_central_dependents_delete
BEFORE DELETE ON users
WHEN EXISTS (SELECT 1 FROM starry_notifications WHERE userId=OLD.id)
  OR EXISTS (SELECT 1 FROM card_visit_events WHERE ownerUserId=OLD.id OR viewerUserId=OLD.id)
  OR EXISTS (SELECT 1 FROM starry_push_subscriptions WHERE userId=OLD.id)
  OR EXISTS (SELECT 1 FROM battery_transactions WHERE userId=OLD.id OR actorUserId=OLD.id OR relatedUserId=OLD.id)
  OR EXISTS (SELECT 1 FROM battery_accounts WHERE userId=OLD.id)
  OR EXISTS (SELECT 1 FROM battery_hundredth_transactions WHERE userId=OLD.id)
BEGIN
  SELECT RAISE(ABORT,'central_user_has_dependent_data');
END;

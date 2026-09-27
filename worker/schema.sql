PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL,
  subscription TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS notifications (
  device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  at INTEGER NOT NULL,
  payload TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_at INTEGER NOT NULL,
  lease_until INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (device_id, id)
);
CREATE INDEX IF NOT EXISTS notifications_due ON notifications(next_at, lease_until);

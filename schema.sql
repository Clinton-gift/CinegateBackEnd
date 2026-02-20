CREATE TABLE IF NOT EXISTS demo_sessions (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  status TEXT NOT NULL DEFAULT 'active',
  os TEXT,
  device_type TEXT,
  referrer TEXT,
  ip_hash TEXT,
  user_agent TEXT,
  expires_at TEXT
);

CREATE TABLE IF NOT EXISTS demo_download_events (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  file_type TEXT NOT NULL,
  downloaded_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(session_id) REFERENCES demo_sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_demo_download_events_session_id
  ON demo_download_events(session_id);

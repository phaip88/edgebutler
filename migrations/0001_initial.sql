CREATE TABLE IF NOT EXISTS servers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  custom_name TEXT,
  username TEXT NOT NULL DEFAULT 'root',
  host TEXT NOT NULL,
  agent_url TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  location TEXT NOT NULL DEFAULT 'unknown',
  tags TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'unknown',
  last_seen_at TEXT,
  last_snapshot TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS install_tokens (
  token_hash TEXT PRIMARY KEY,
  server_id TEXT NOT NULL,
  name TEXT,
  username TEXT,
  location TEXT,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS operation_logs (
  id TEXT PRIMARY KEY,
  server_id TEXT,
  source TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT,
  command TEXT,
  output TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notification_channels (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  url TEXT,
  chat_id TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pending_operations (
  id TEXT PRIMARY KEY,
  server_id TEXT NOT NULL,
  server_name TEXT NOT NULL,
  source TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT,
  command TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_servers_status ON servers(status);
CREATE INDEX IF NOT EXISTS idx_operation_logs_created_at ON operation_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_operation_logs_server_id ON operation_logs(server_id);
CREATE INDEX IF NOT EXISTS idx_pending_operations_expires_at ON pending_operations(expires_at);

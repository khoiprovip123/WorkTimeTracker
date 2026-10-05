-- schema "chuẩn" — chạy qua tauri-plugin-sql (Rusqlite) lúc app khởi động
CREATE TABLE IF NOT EXISTS work_logs (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  date             TEXT    NOT NULL UNIQUE,   -- ISO yyyy-mm-dd, one row per day
  check_in         TEXT,                      -- "HH:MM" (NULL = chưa chấm công)
  check_out        TEXT,                      -- "HH:MM"
  worked_minutes   INTEGER NOT NULL DEFAULT 0,
  required_minutes INTEGER,
  note             TEXT    NOT NULL DEFAULT '',
  created_at       TEXT    NOT NULL,
  updated_at       TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS leave_records (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  date    TEXT    NOT NULL UNIQUE,
  minutes INTEGER NOT NULL,
  type    TEXT    NOT NULL DEFAULT 'phép',
  note    TEXT    NOT NULL DEFAULT ''
);

-- carry_overs chỉ chứa NỢ CHƯA TRẢ (resolved = 0).
CREATE TABLE IF NOT EXISTS carry_overs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  source_date  TEXT    NOT NULL,
  target_date  TEXT    NOT NULL,
  minutes      INTEGER NOT NULL CHECK (minutes > 0),
  resolved     INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_carry_target     ON carry_overs (target_date);
CREATE INDEX IF NOT EXISTS idx_carry_unresolved ON carry_overs (resolved, source_date);

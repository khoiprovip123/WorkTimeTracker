CREATE TABLE IF NOT EXISTS attendance_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  work_date TEXT NOT NULL,
  event_time TEXT NOT NULL,
  message_text TEXT NOT NULL,
  sent_at TEXT NOT NULL,
  received_at TEXT NOT NULL,
  UNIQUE(room_id, message_id),
  UNIQUE(work_date, event_time)
);

CREATE INDEX IF NOT EXISTS idx_attendance_events_date ON attendance_events(work_date, event_time);

UPDATE work_logs SET check_in_source = CASE check_in_source
  WHEN 'tmt' THEN 'AUTO_NOTIFICATION'
  WHEN 'auto' THEN 'AUTO_START'
  WHEN 'manual' THEN 'MANUAL'
  ELSE check_in_source END;
UPDATE work_logs SET check_out_source = CASE check_out_source
  WHEN 'tmt' THEN 'AUTO_NOTIFICATION'
  WHEN 'manual' THEN 'MANUAL'
  ELSE check_out_source END;

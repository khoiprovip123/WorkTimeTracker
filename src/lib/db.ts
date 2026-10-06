import Database from '@tauri-apps/plugin-sql';
import type { CarryOver, LeaveRecord, Settings, WorkLog } from './types';

const LEGACY_STORAGE_KEY = 'worktime-tracker.sqlite';
const DEFAULT_SETTINGS: Settings = {
  morningStart: 480,
  morningEnd: 720,
  afternoonStart: 810,
  standardEnd: 1050,
  latestNormalCheckIn: 540,
  dailyRequiredMinutes: 480,
  weeklyRequiredMinutes: 2400,
  showTrayIcon: true,
  showTrayTitle: true,
  autoStartOnBoot: false,
  autoStartWorkSession: false,
};

let dbPromise: Promise<Database> | null = null;

// Rust (tauri-plugin-sql) runs migrations/001_init.sql on load; queries use $n placeholders.
async function createDatabase(): Promise<Database> {
  if (!('__TAURI_INTERNALS__' in window)) throw new Error('Ứng dụng chạy ngoài Tauri — mở bằng `npm run tauri dev`');
  const db = await Database.load('sqlite:worktime.sqlite');
  await importLegacyData(db); // the old sql.js DB lived in this same webview's localStorage
  await seedDefaults(db);
  return db;
}

// ponytail: one-time import of the legacy localStorage DB. DROP this whole block — and the
// sql.js CDN import with it — once no machine has legacy data.
async function importLegacyData(db: Database) {
  const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
  if (!raw) return;

  // static import = bundled into dist (offline, CSP-clean); -browser build + ?url wasm as before
  const initSqlJs = (await import('sql.js')).default;
  const wasmUrl = (await import('sql.js/dist/sql-wasm-browser.wasm?url')).default;
  const SQL = await initSqlJs({ wasmBinary: await fetch(wasmUrl).then((r) => r.arrayBuffer()) });
  const legacy = new SQL.Database(new Uint8Array(Array.from(atob(raw), (ch) => ch.charCodeAt(0))));
  for (const table of ['settings', 'work_logs', 'leave_records', 'carry_overs']) {
    const [result] = legacy.exec(`SELECT * FROM ${table}`);
    const placeholders = result?.columns.map((_column, i) => `$${i + 1}`).join(',');
    for (const values of result?.values ?? []) {
      await db.execute(`INSERT OR IGNORE INTO ${table} VALUES (${placeholders})`, values).catch(() => undefined);
    }
  }
  localStorage.removeItem(LEGACY_STORAGE_KEY);
}

async function seedDefaults(db: Database) {
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await db.execute('INSERT OR IGNORE INTO settings (key, value) VALUES ($1, $2)', [key, String(value)]);
  }
}

// ponytail: seed data was demo filler from the sql.js era — deleted with it. First launch = empty app.

export async function getDatabase() {
  dbPromise ??= createDatabase();
  return dbPromise;
}

export async function getSettings(): Promise<Settings> {
  const db = await getDatabase();
  const result: Record<string, string> = {};
  for (const { key, value } of await db.select<{ key: string; value: string }[]>('SELECT key, value FROM settings')) {
    result[key] = value;
  }

  return {
    morningStart: Number(result.morningStart ?? DEFAULT_SETTINGS.morningStart),
    morningEnd: Number(result.morningEnd ?? DEFAULT_SETTINGS.morningEnd),
    afternoonStart: Number(result.afternoonStart ?? DEFAULT_SETTINGS.afternoonStart),
    standardEnd: Number(result.standardEnd ?? DEFAULT_SETTINGS.standardEnd),
    latestNormalCheckIn: Number(result.latestNormalCheckIn ?? DEFAULT_SETTINGS.latestNormalCheckIn),
    dailyRequiredMinutes: Number(result.dailyRequiredMinutes ?? DEFAULT_SETTINGS.dailyRequiredMinutes),
    weeklyRequiredMinutes: Number(result.weeklyRequiredMinutes ?? DEFAULT_SETTINGS.weeklyRequiredMinutes),
    showTrayIcon: result.showTrayIcon === undefined ? DEFAULT_SETTINGS.showTrayIcon : result.showTrayIcon === 'true',
    showTrayTitle: result.showTrayTitle === undefined ? DEFAULT_SETTINGS.showTrayTitle : result.showTrayTitle === 'true',
    autoStartOnBoot: result.autoStartOnBoot === undefined ? DEFAULT_SETTINGS.autoStartOnBoot : result.autoStartOnBoot === 'true',
    autoStartWorkSession: result.autoStartWorkSession === undefined ? DEFAULT_SETTINGS.autoStartWorkSession : result.autoStartWorkSession === 'true',
  };
}

export async function saveSettings(settings: Settings) {
  const db = await getDatabase();
  for (const [key, value] of Object.entries(settings)) {
    await db.execute('INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, String(value)]);
  }
}

export async function getWorkLogs(): Promise<WorkLog[]> {
  const db = await getDatabase();
  const rows = await db.select<Record<string, string | number | null>[]>('SELECT * FROM work_logs ORDER BY date DESC');
  return rows.map((r) => ({
    id: Number(r.id),
    date: r.date as string,
    checkIn: (r.check_in as string) ?? null,
    checkOut: (r.check_out as string) ?? null,
    workedMinutes: Number(r.worked_minutes),
    requiredMinutes: (r.required_minutes as number) ?? null,
    note: r.note as string,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  }));
}

export async function upsertWorkLog(log: Omit<WorkLog, 'createdAt' | 'updatedAt'> & { createdAt?: string; updatedAt?: string }): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  await db.execute(
    `INSERT INTO work_logs (date, check_in, check_out, worked_minutes, required_minutes, note, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
     ON CONFLICT(date) DO UPDATE SET check_in = $2, check_out = $3, worked_minutes = $4, required_minutes = $5, note = $6, updated_at = $7`,
    [log.date, log.checkIn, log.checkOut, log.workedMinutes, log.requiredMinutes, log.note, now],
  );
}

export async function deleteWorkLog(date: string): Promise<void> {
  const db = await getDatabase();
  await db.execute('DELETE FROM work_logs WHERE date = $1', [date]);
}

export async function getLeaveRecords(): Promise<LeaveRecord[]> {
  const db = await getDatabase();
  const rows = await db.select<Record<string, string | number>[]>('SELECT * FROM leave_records ORDER BY date DESC');
  return rows.map((r) => ({ id: Number(r.id), date: r.date as string, minutes: Number(r.minutes), type: r.type as string, note: r.note as string }));
}

export async function getCarryOvers(): Promise<CarryOver[]> {
  const db = await getDatabase();
  const rows = await db.select<Record<string, string | number>[]>('SELECT * FROM carry_overs ORDER BY source_date DESC');
  return rows.map((r) => ({
    id: Number(r.id),
    sourceDate: r.source_date as string,
    targetDate: r.target_date as string,
    minutes: Number(r.minutes),
    resolved: Boolean(r.resolved),
    createdAt: r.created_at as string,
  }));
}

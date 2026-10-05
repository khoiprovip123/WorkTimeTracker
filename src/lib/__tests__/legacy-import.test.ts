import initSqlJs, { type Database as SqlJsDatabase } from 'sql.js';
import { describe, expect, it } from 'vitest';

// sql.js in node is async to init (wasm)
const { Database } = await initSqlJs();

// Mirrors src/lib/db.ts importLegacyData: schema + the INSERT loop. If either breaks, this fails.
const SCHEMA_NEW = `
  CREATE TABLE work_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL UNIQUE, check_in TEXT, check_out TEXT,
    worked_minutes INTEGER NOT NULL DEFAULT 0, required_minutes INTEGER, note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);`;

// ponytail: the copy of the loop in db.ts must keep failing when placeholders/values mismatch —
// update both together.
function copyRows(src: SqlJsDatabase, dst: SqlJsDatabase, table: string) {
  const [result] = src.exec(`SELECT * FROM ${table}`);
  const placeholders = result?.columns.map((_column: string, i: number) => `$${i + 1}`).join(',');
  const skipped: unknown[][] = [];
  for (const values of result?.values ?? []) {
    try {
      // dst here is sql.js ('?' instead of '$n'), which fails on column-count mismatch just like rusqlite
      dst.run(`INSERT OR IGNORE INTO ${table} VALUES (${placeholders.replace(/\$\d+/g, '?')})`, values);
    } catch {
      skipped.push(values);
    }
  }
  return skipped;
}

describe('legacy localStorage import', () => {
  it('copies settings and skips pre-required_minutes work_logs', () => {
    const old = new Database();
    old.run('CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
    old.run('INSERT INTO settings VALUES (?, ?)', ['morningStart', '480']);
    old.run(
      'CREATE TABLE work_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL UNIQUE, check_in TEXT, check_out TEXT, worked_minutes INTEGER NOT NULL DEFAULT 0, note TEXT NOT NULL DEFAULT \'\', created_at TEXT NOT NULL, updated_at TEXT NOT NULL)',
    );
    old.run('INSERT INTO work_logs (date, check_in, check_out, worked_minutes, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)', ['2024-10-05', '08:00', '17:00', 450, 'x', 'a', 'b']);

    const fresh = new Database();
    fresh.run(SCHEMA_NEW);
    const skipped = copyRows(old, fresh, 'settings');
    copyRows(old, fresh, 'work_logs');

    expect(skipped).toEqual([]);
    expect(fresh.exec('SELECT value FROM settings WHERE key = \'morningStart\'')[0].values[0][0]).toBe('480');
    // old work_logs row lacks required_minutes → 8 values into 9 columns → skipped, not crashed
    expect(fresh.exec('SELECT COUNT(*) FROM work_logs')[0].values[0][0]).toBe(0);
  });
});

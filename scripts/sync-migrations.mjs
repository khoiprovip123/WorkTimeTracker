// No-op: Rust consumes migrations/*.sql directly (include_str! in src-tauri/src/main.rs).
// Kept as the dev/build hook so `npm run dev` / muscle memory don't break.
// Rust consumes migrations/*.sql directly (include_str! in src-tauri/src/main.rs);
// legacy import needs no TS schema copy either. This only asserts the folder is readable.
import { readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const files = readdirSync(resolve(dirname(fileURLToPath(import.meta.url)), '..', 'migrations')).filter((f) => f.endsWith('.sql'));
console.log(`migrations run by Rust (tauri-plugin-sql): ${files.join(', ') || 'NONE — app starts with empty DB!'}`);

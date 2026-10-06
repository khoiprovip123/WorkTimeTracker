import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const packageJsonPath = path.join(rootDir, 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const version = packageJson.version;

const tauriConfigPath = path.join(rootDir, 'src-tauri', 'tauri.conf.json');
const tauriConfig = JSON.parse(fs.readFileSync(tauriConfigPath, 'utf8'));
tauriConfig.version = version;
fs.writeFileSync(tauriConfigPath, `${JSON.stringify(tauriConfig, null, 2)}\n`);

const cargoTomlPath = path.join(rootDir, 'src-tauri', 'Cargo.toml');
const cargoToml = fs.readFileSync(cargoTomlPath, 'utf8');
const nextCargoToml = cargoToml.replace(/^version = ".*"$/m, `version = "${version}"`);
fs.writeFileSync(cargoTomlPath, nextCargoToml);

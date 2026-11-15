import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(root, "migration_manifest_001_027.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const migrationsDir = path.join(root, "migrations");
let failures = 0;
for (const entry of manifest.baseline_migrations) {
  const filePath = path.join(migrationsDir, entry.file);
  if (!fs.existsSync(filePath)) {
    console.error(`MISSING: ${entry.file}`);
    failures++;
    continue;
  }
  const actual = crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
  if (actual !== entry.sha256) {
    console.error(`CHECKSUM_MISMATCH: ${entry.file}`);
    failures++;
  } else {
    console.log(`VERIFIED: ${entry.file}`);
  }
}
if (failures > 0) {
  console.error(`Migration manifest check failed: ${failures} issue(s).`);
  process.exit(1);
}
console.log(`PASS: all ${manifest.baseline_migrations.length} migration files match the checked-in manifest.`);

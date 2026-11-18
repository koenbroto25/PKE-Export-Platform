import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (name) => JSON.parse(fs.readFileSync(path.join(root, name), "utf8"));
const hashFile = (name) => crypto.createHash("sha256").update(fs.readFileSync(path.join(root, name))).digest("hex");
const fail = (message) => { console.error("FAIL: " + message); process.exitCode = 1; };

const baseline = readJson("migration_manifest_001_027.json");
const ledger = readJson("migration_history_manifest_001_038.json");
const runner = fs.readFileSync(path.join(root, "scripts/migrate.mjs"), "utf8");

if (ledger.purpose !== "verified_production_history_only_not_sql_source") fail("history manifest purpose marker is missing.");
if (ledger.applied_count !== 38 || ledger.entries.length !== 38) fail("Production history ledger must contain exactly 37 entries.");
if (ledger.project_id !== "purple-base-63944903" || ledger.branch_id !== "br-damp-shape-b3xlh4nr" || ledger.database !== "neondb") fail("history ledger target identity mismatch.");

for (let i = 0; i < ledger.entries.length; i++) {
  const entry = ledger.entries[i];
  if (entry.id !== i + 1) fail("history sequence is not contiguous at " + (i + 1) + ".");
  if (!/^[a-f0-9]{64}$/.test(entry.sha256)) fail("invalid SHA-256 for " + entry.filename + ".");
  if (i < 28) {
    const base = baseline.baseline_migrations[i];
    if (!base || base.file !== entry.filename || base.sha256 !== entry.sha256) fail("legacy baseline mismatch at " + entry.filename + ".");
  }
  if (i >= 28 && i <= 34 && entry.source_sha_verified !== false) fail("029-035 must remain marked as unrecovered authentic source.");
}
if (ledger.entries[35]?.filename !== "036_validate_production_schema_invariants.sql" ||
    ledger.entries[35]?.sha256 !== "4a70d8b343c44e26c9592402c4c8dceb3b6a0d11c5f4e619847baff774034a52" ||
    hashFile("migrations/036_validate_production_schema_invariants.sql") !== ledger.entries[35].sha256) {
  fail("Migration 036 source/hash does not match verified Production history.");
}
if (ledger.entries[36]?.filename !== "037_restrict_security_definer_execute.sql" ||
    ledger.entries[36]?.sha256 !== "c74f472812aca4e5eb6d7c2e9096b883ddfb232bc011f5096eec745e02b90b85" ||
    hashFile("migrations/037_restrict_security_definer_execute.sql") !== ledger.entries[36].sha256) {
  fail("Migration 037 source/hash does not match verified Production history.");
}

const expected038 = "37344eb4794c36cfd8c5b10e85a4f0ee947cd6bd0951bde8c6b8fb94f147c8d5";
const applied038 = ledger.entries[37];
if (!applied038 || applied038.id !== 38 ||
    applied038.filename !== "038_admin_managed_neon_auth_user_lifecycle.sql" ||
    applied038.sha256 !== expected038 || applied038.status !== "applied" ||
    applied038.source_sha_verified !== true ||
    hashFile("migrations/038_admin_managed_neon_auth_user_lifecycle.sql") !== expected038) {
  fail("Migration 038 must match the exact hash-verified applied Production ledger entry.");
}
if ((ledger.pending_migrations || []).some((m) => m.file === "038_admin_managed_neon_auth_user_lifecycle.sql")) {
  fail("Migration 038 is already applied and must not remain in pending_migrations.");
}

for (const required of ["MIGRATE_038_CONFIRM", "MIGRATION_038_APPROVED_SHA256", "MIGRATION_038_APPROVAL_REFERENCE", expected038]) {
  if (!runner.includes(required)) fail("Migration runner is missing explicit 038 approval guard: " + required);
}
if (!runner.includes("releaseManifest.entries.length !== 38")) fail("Migration runner does not require exact Production history length 001-038.");
if (!runner.includes("Production migration_history differs from the verified 001-038 release manifest")) fail("Migration runner is missing exact history reconciliation.");
if (!runner.includes("Production history ledger:")) fail("Migration status mode does not compare the verified Production ledger.");
if (!runner.includes("SOURCE_NAME_MISMATCH")) fail("Migration status mode does not flag local files that conflict with applied historical names.");

if (process.exitCode) process.exit(process.exitCode);
console.log("PASS: baseline 001-028, verified Production history 001-038, and exact source hashes for migrations 036-038.");
console.log("NOTICE: authentic SQL source for historical migrations 029-035 remains unrecovered; candidates are not executable.");

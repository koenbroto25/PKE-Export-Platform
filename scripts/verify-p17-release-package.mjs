import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const migrationsDir = path.join(root, "migrations");
const readJson = (name) => JSON.parse(fs.readFileSync(path.join(root, name), "utf8"));
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const hashFile = (name) => hash(fs.readFileSync(path.join(migrationsDir, name)));
const fail = (message) => { console.error("FAIL: " + message); process.exitCode = 1; };

const history = readJson("migration_history_manifest_001_053.json");
const uat = readJson("migration_history_manifest_uat_001_109.json");
const release = readJson("migration_release_manifest_p17_096_109.json");
const runner = fs.readFileSync(path.join(root, "scripts/apply-p17-migrations.mjs"), "utf8");

if (history.project_id !== "purple-base-63944903" ||
    history.branch_id !== "br-damp-shape-b3xlh4nr" ||
    history.database !== "neondb" ||
    history.applied_count !== 53 || history.entries?.length !== 53 ||
    history.entries[52]?.filename !== "053_project_admin_accounting_reports_read_only.sql") {
  fail("Canonical Production baseline manifest must pin exactly migration history 001-053.");
}

if (uat.purpose !== "verified_uat_history_only_not_production_history" ||
    uat.branch_id !== "br-young-boat-b3re832d" || uat.ledger_row_count !== 109 ||
    uat.applied_count !== 93 || uat.entries?.length !== 109 ||
    uat.entries[108]?.filename !== "109_p17f_buyer_self_read_rls_recursion_fix.sql") {
  fail("UAT manifest must remain isolated and reconcile through ledger 109.");
}

if (release.purpose !== "production_p17_release_package_exact_sql_hashes_owner_approval_required" ||
    release.project_id !== "purple-base-63944903" ||
    release.branch_id !== "br-damp-shape-b3xlh4nr" ||
    release.starting_history_count !== 53 ||
    release.migrations?.length !== 14) {
  fail("P17 Production release manifest target/scope mismatch.");
}

function removeTransactionWrapper(sql) {
  const begin = /^\s*(?:--[^\r\n]*(?:\r?\n|$))*BEGIN;\s*/i;
  const commit = /\s*COMMIT;\s*$/i;
  if (!begin.test(sql) || !commit.test(sql)) throw new Error("transaction wrapper missing");
  return sql.replace(begin, "").replace(commit, "");
}

for (let i = 0; i < release.migrations.length; i++) {
  const item = release.migrations[i];
  const ledgerId = 54 + i;
  if (item.ledger_id !== ledgerId || item.status !== "pending" ||
      item.source_sha_verified !== true ||
      hashFile(item.filename) !== item.sha256) {
    fail("P17 release SQL/hash mismatch: " + item.filename);
  }
  const sql = fs.readFileSync(path.join(migrationsDir, item.filename), "utf8");
  if ((sql.match(/^BEGIN;\s*$/gim) || []).length !== 1 ||
      (sql.match(/^COMMIT;\s*$/gim) || []).length !== 1) {
    fail("Migration must have exactly one atomic transaction boundary: " + item.filename);
  }
  if (/^\s*(DROP\s+TABLE|DROP\s+SCHEMA|TRUNCATE)\b/im.test(sql)) {
    fail("Unexpected destructive DDL in " + item.filename);
  }
}

for (let n = 96; n <= 98; n++) {
  const item = release.migrations[n - 96];
  const uatEntry = uat.entries.find(x => x.filename === item.filename);
  const normalizedHash = hash(Buffer.from(removeTransactionWrapper(fs.readFileSync(path.join(migrationsDir, item.filename), "utf8"))));
  if (!uatEntry || normalizedHash !== uatEntry.sha256) {
    fail("P17 migration " + n + " SQL body differs from the historical UAT-applied source; only transaction wrappers may differ.");
  }
}
for (let n = 99; n <= 103; n++) {
  const item = release.migrations[n - 96];
  const uatEntry = uat.entries.find(x => x.filename === item.filename);
  if (!uatEntry || uatEntry.sha256 !== item.sha256) {
    fail("P17 migration " + n + " must match its exact UAT-applied source hash.");
  }
}
for (let n = 104; n <= 109; n++) {
  const item = release.migrations[n - 96];
  const uatEntry = uat.entries.find(x => x.filename === item.filename);
  if (!uatEntry || uatEntry.sha256 !== item.sha256) {
    fail("P17 migration " + n + " must match its exact UAT-applied source hash.");
  }
}

for (const guard of [
  "MIGRATE_P17_CONFIRM",
  "MIGRATION_P17_APPROVED_MANIFEST_SHA256",
  "MIGRATION_P17_APPROVAL_REFERENCE",
  "MIGRATE_P17_108_109_CONFIRM",
  "MIGRATION_P17_108_109_APPROVED_SHA256",
  "MIGRATION_P17_108_109_APPROVAL_REFERENCE",
  "pg_advisory_lock(424242)",
  "P17 package failed; all migrations 096-109 were rolled back",
]) {
  if (!runner.includes(guard)) fail("P17 migration runner is missing required guard: " + guard);
}

if (!runner.includes("P17 096-109 atomic Production release PASS")) {
  fail("P17 migration runner is missing post-commit verification.");
}

if (!process.exitCode) console.log("P17 release package contract PASS: Production baseline 001-053, UAT 001-109, source hashes 096-109, and owner-gated atomic runner verified.");

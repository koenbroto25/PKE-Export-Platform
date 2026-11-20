import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => fs.readFileSync(path.join(root, name));
const json = (name) => JSON.parse(read(name).toString("utf8"));
const hash = (name) => crypto.createHash("sha256").update(read(name)).digest("hex");
const fail = (message) => { console.error("FAIL: " + message); process.exitCode = 1; };

const file = "052_funder_finance_report_scope_isolation.sql";
const expectedSha = "cc8d34c12d34eab9c4cc9aeabd46d9da59b1ec7ef0c7c89345d4b49455a6ac0b";
const runner = read("scripts/apply-migration-052.mjs").toString("utf8");
const latest = json("migration_history_manifest_001_051.json");
const backup = json("docs/audits/NEON_PRE_052_BACKUP_MANIFEST_20261120.json");

if (hash("migrations/" + file) !== expectedSha) fail("Migration 052 SQL hash mismatch.");
if (latest.project_id !== "purple-base-63944903" ||
    latest.branch_id !== "br-damp-shape-b3xlh4nr" ||
    latest.database !== "neondb" ||
    latest.applied_count !== 51 ||
    latest.entries?.length !== 51) fail("Latest verified Production ledger manifest target/count mismatch.");
for (let i = 0; i < 51; i++) {
  const row = latest.entries[i];
  if (row?.id !== i + 1 || !/^[a-f0-9]{64}$/.test(row.sha256) ||
      !["applied", "baselined"].includes(row.status)) fail("Latest Production manifest invalid at sequence " + (i + 1) + ".");
}
if (latest.entries[50]?.filename !== "051_task_notification_recipient_rls_helper.sql" ||
    latest.entries[50]?.sha256 !== "acda688d928ef06e2a8a069953976d0fa57f8fa7a5a0d988534d7da189d8a927" ||
    latest.entries[50]?.status !== "applied") fail("Migration 051 ledger tail is not exact.");
if (latest.pending_migrations?.length !== 1 ||
    latest.pending_migrations[0]?.id !== 52 ||
    latest.pending_migrations[0]?.sha256 !== expectedSha) fail("Migration 052 must be the only exact pending migration.");

if (backup.project_id !== latest.project_id ||
    backup.production_branch_id !== latest.branch_id ||
    backup.backup_branch_id !== "br-snowy-credit-b336z950" ||
    backup.backup_branch_state !== "ready" ||
    backup.migration_052_applied !== false ||
    JSON.stringify(backup.production_counts) !== JSON.stringify(backup.backup_counts)) {
  fail("Fresh backup manifest is not bound to this Production target or its parity evidence.");
}

for (const token of [
  "MIGRATE_CONFIRM", "MIGRATE_052_CONFIRM", "MIGRATION_052_APPROVED_SHA256",
  "MIGRATION_052_APPROVAL_REFERENCE", "MIGRATION_BACKUP_REFERENCE",
  "MIGRATION_BACKUP_SHA256", "pg_advisory_lock", "pg_advisory_unlock",
  "rejectUnauthorized: true", "app_runtime_secure", "exactly 51 migration ledger rows",
  "Migration 052 and ledger row 52 committed atomically",
  "Funder generic Finance/Accounting/Reports/Payment grants = 0",
  "finance_view !== false", "reports_view !== false", "await client.query(body)",
]) if (!runner.includes(token)) fail("Dedicated Migration 052 runner is missing safety contract: " + token);

const sql = read("migrations/" + file).toString("utf8");
if (!/^\s*--[^\n]*\n(?:--[^\n]*\n)*\s*BEGIN\s*;/i.test(sql) || !/COMMIT\s*;\s*$/.test(sql)) {
  fail("Migration 052 must keep an explicit transaction wrapper for safe atomic composition.");
}
if (process.exitCode) process.exit(process.exitCode);
console.log("PASS: exact Migration 052 source, 001-051 Production ledger, fresh backup parity and fail-closed atomic release runner verified.");
console.log("NOTICE: applying to Production still requires the separate owner approval environment values and backup evidence digest.");

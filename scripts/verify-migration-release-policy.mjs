import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (name) => JSON.parse(fs.readFileSync(path.join(root, name), "utf8"));
const hashFile = (name) => crypto.createHash("sha256").update(fs.readFileSync(path.join(root, name))).digest("hex");
const fail = (message) => { console.error("FAIL: " + message); process.exitCode = 1; };

const baseline = readJson("migration_manifest_001_027.json");
const ledger = readJson("migration_history_manifest_001_047.json");
const runner = fs.readFileSync(path.join(root, "scripts/migrate.mjs"), "utf8");
const migration052Runner = fs.readFileSync(path.join(root, "scripts/apply-migration-052.mjs"), "utf8");
const latestLedger = JSON.parse(fs.readFileSync(path.join(root, "migration_history_manifest_001_051.json"), "utf8"));
const appliedLedger = JSON.parse(fs.readFileSync(path.join(root, "migration_history_manifest_001_052.json"), "utf8"));
const backupEvidence = JSON.parse(fs.readFileSync(path.join(root, "docs/audits/NEON_PRE_052_BACKUP_MANIFEST_20261120.json"), "utf8"));

if (ledger.purpose !== "verified_production_history_only_not_sql_source") fail("history manifest purpose marker is missing.");
if (ledger.applied_count !== 47 || ledger.entries.length !== 47) fail("Production history ledger must contain exactly 47 entries.");
if ((ledger.pending_migrations || []).length !== 0) fail("No pending migration may remain after Migration 047 application.");
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
if ((ledger.pending_migrations || []).some((m) => ["038_admin_managed_neon_auth_user_lifecycle.sql", "039_project_scoped_contract_cob_cycles.sql", "040_finance_reporting_notifications.sql"].some((file) => m.file === file || m.file === "migrations/" + file))) {
  fail("Migrations 038-040 are already applied and must not remain pending.");
}
const expected039 = "2478220b8813c90ab0461ea4e810b663607b57cc43c6728b9cc82647104ea168";
const applied039 = ledger.entries[38];
if (!applied039 || applied039.id !== 39 ||
    applied039.filename !== "039_project_scoped_contract_cob_cycles.sql" ||
    applied039.sha256 !== expected039 || applied039.status !== "applied" ||
    applied039.source_sha_verified !== true ||
    hashFile("migrations/039_project_scoped_contract_cob_cycles.sql") !== expected039) {
  fail("Migration 039 must match the exact hash-verified applied Production ledger entry.");
}

const expected040 = "3dcba30a1592617e8747f144ed650de5d6af50112c8b105bec62681ddf1b485f";
const applied040 = ledger.entries[39];
if (!applied040 || applied040.id !== 40 ||
    applied040.filename !== "040_finance_reporting_notifications.sql" ||
    applied040.sha256 !== expected040 || applied040.status !== "applied" ||
    applied040.source_sha_verified !== true ||
    hashFile("migrations/040_finance_reporting_notifications.sql") !== expected040) {
  fail("Migration 040 must match the exact hash-verified applied Production ledger entry.");
}


const expected041 = "96bf6ea57d68bc9913bc402cadeeb85beee6938a57b9acb9bd13c8d6c5ad2770";
const applied041 = ledger.entries[40];
if (!applied041 || applied041.id !== 41 ||
    applied041.filename !== "041_finance_notification_rls_recipient_guard.sql" ||
    applied041.sha256 !== expected041 || applied041.status !== "applied" ||
    applied041.source_sha_verified !== true ||
    hashFile("migrations/041_finance_notification_rls_recipient_guard.sql") !== expected041) {
  fail("Migration 041 must match the exact hash-verified applied Production ledger entry.");
}

const expectedApplied = [
  [42, "042_inventory_reservation_release_reason.sql", "4894520de17e45b38a3d50db96e9aaa1c5fa5603186e13bab0ee0f32e3bb4996"],
  [43, "043_project_role_assignments_and_history.sql", "15e73e189b4b454582a6e2ce996eb13605bdb5157e9f3ea93837bd5c97f22086"],
  [44, "044_project_change_delete_permission.sql", "618726680810cce39225442cd3cb5d87cdc118136aba33c092091c756122b48d"],
  [45, "045_cash_advance_financial_audit.sql", "da80dc506ec81389232068fc84c810b62e7d85493aaa4b59f7870007c72c0261"],
];
if ((ledger.pending_migrations || []).length !== 0) {
  fail("No pending migrations may remain after applied Migration 047.");
}
for (const [id, file, sha] of expectedApplied) {
  const applied = ledger.entries[id - 1];
  if (!applied || applied.id !== id || applied.filename !== file || applied.sha256 !== sha ||
      applied.status !== "applied" || applied.source_sha_verified !== true ||
      hashFile("migrations/" + file) !== sha) {
    fail("Applied Production migration source/hash mismatch: " + file);
  }
}

for (const required of ["MIGRATE_038_CONFIRM", "MIGRATION_038_APPROVED_SHA256", "MIGRATION_038_APPROVAL_REFERENCE", expected038]) {
  if (!runner.includes(required)) fail("Migration runner is missing explicit 038 approval guard: " + required);
}
if (!runner.includes("Production Migration 039 is already applied and ledger-verified; no SQL re-execution performed.")) fail("Migration runner is missing the safe Migration 039 verification-only path.");
if (!runner.includes("verifiedManifest.entries?.length !== 39")) fail("Migration runner does not require exact Production history length 001-039.");
if (!runner.includes("Production Migration 045 is already applied and all 45 ledger rows are verified; no SQL re-execution performed.")) fail("Migration runner is missing the safe already-applied 045 verification-only path.");
if (!runner.includes("migration_history_manifest_001_047.json") || !runner.includes("verifiedManifest.entries?.length !== 41")) fail("Migration runner does not bind to the 001-046 verified history manifest and historical pre-042 gate.");
if (!runner.includes("Production migration_history mismatch at sequence")) fail("Migration runner is missing exact history reconciliation.");
if (!runner.includes("Production Migration 040 is already applied and ledger-verified; no SQL re-execution performed.")) fail("Migration runner is missing the safe Migration 040 verification-only path.");
if (!runner.includes("MIGRATE_041_CONFIRM") || !runner.includes("MIGRATION_041_APPROVED_SHA256") || !runner.includes("MIGRATION_041_APPROVAL_REFERENCE") || !runner.includes(expected041)) fail("Migration runner is missing exact Migration 041 owner-approval guards.");
for (const [n, sha] of [["042", expectedApplied[0][2]], ["043", expectedApplied[1][2]], ["044", expectedApplied[2][2]]]) {
  if (!runner.includes("MIGRATE_" + n + "_CONFIRM") ||
      !runner.includes("MIGRATION_" + n + "_APPROVED_SHA256") ||
      !runner.includes("MIGRATION_" + n + "_APPROVAL_REFERENCE") ||
      !runner.includes(sha)) fail("Migration runner is missing exact Migration " + n + " owner-approval guards.");
}
if (!runner.includes("exact036to044") || !runner.includes("verifiedManifest.entries?.length !== 41")) fail("Migration runner does not require exact Production history 001-041 before 042-044.");
if (!runner.includes("alreadyAppliedManifest.entries?.length === 44") || !runner.includes("all 44 ledger rows are verified; no SQL re-execution performed")) fail("Migration runner lacks the safe already-applied 042-044 verification path.");
if (!runner.includes("Production history ledger:")) fail("Migration status mode does not compare the verified Production ledger.");
if (!runner.includes("Migrations 042-044 and all ledger rows committed atomically as one approved package.")) fail("Migration runner must apply 042-044 atomically as one all-or-nothing package.");
if (!runner.includes("Migration package 042-044 failed and the entire transaction was rolled back")) fail("Migration runner is missing atomic rollback handling for 042-044.");
if (!runner.includes("SOURCE_NAME_MISMATCH")) fail("Migration status mode does not flag local files that conflict with applied historical names.");

const expected046 = "4697eebc8e2187a52143d5d1748d8e062c5b6bbee8a7b98fbf21da91135b7d31";
const applied046 = ledger.entries[45];
if (!applied046 || applied046.id !== 46 ||
    applied046.filename !== "046_cash_advance_finance_role_guard.sql" ||
    applied046.sha256 !== expected046 || applied046.status !== "applied" ||
    applied046.source_sha_verified !== true ||
    hashFile("migrations/046_cash_advance_finance_role_guard.sql") !== expected046) {
  fail("Migration 046 must match the exact hash-verified applied Production ledger entry.");
}
const expected047 = "1ad12527d79db45d4f3a7bd3e6764268679709f2ebec9f2f3c1b902cbc767682";
const applied047 = ledger.entries[46];
if (!applied047 || applied047.id !== 47 ||
    applied047.filename !== "047_project_admin_finance_read_only.sql" ||
    applied047.sha256 !== expected047 || applied047.status !== "applied" ||
    applied047.source_sha_verified !== true ||
    hashFile("migrations/047_project_admin_finance_read_only.sql") !== expected047) {
  fail("Migration 047 must match the exact hash-verified applied Production ledger entry.");
}
if (!runner.includes("exact036to047") ||
    !runner.includes("Production Migration 047 is already applied and all 47 ledger rows are verified; no SQL re-execution performed.")) {
  fail("Migration runner is missing the safe already-applied Migration 047 verification-only path.");
}


const preparedAndApplied = [
  [48, "048_buyer_accounting_ap_ar_document_hardening.sql", "48eea58270848cc90945cf42972f1a01216e66bb1f6b90c56204b47e877bcdc3"],
  [49, "049_project_work_item_task_engine.sql", "f61edb6ee54d7294a13cfd0a7319c4dee03299f718a3efdb6805081a50df2780"],
  [50, "050_inventory_holds_legacy_schema_alignment.sql", "e6c883652c841c3ffb597b81ae403c09f6f9015ee48d914ec6a0216a17c488ab"],
  [51, "051_task_notification_recipient_rls_helper.sql", "acda688d928ef06e2a8a069953976d0fa57f8fa7a5a0d988534d7da189d8a927"],
  [52, "052_funder_finance_report_scope_isolation.sql", "cc8d34c12d34eab9c4cc9aeabd46d9da59b1ec7ef0c7c89345d4b49455a6ac0b"],
];
for (const [id, file, sha] of preparedAndApplied) {
  if (hashFile("migrations/" + file) !== sha) fail("Migration source checksum mismatch: " + file);
  if (!runner.includes(file) || !runner.includes(sha)) fail("Migration runner is missing exact source pin: " + file);
  const gate = id <= 49 ? "exact036to049" : "exact036to" + String(id).padStart(3, "0");
  if (!runner.includes(gate)) fail("Migration runner is missing fail-closed release verification path through Migration " + id + ".");
}
if (!runner.includes("[49, 50, 51, 52].includes(applied.rows.length)")) {
  fail("Migration status mode does not accept exact verified Production ledger lengths 049-052.");
}

if (latestLedger.project_id !== "purple-base-63944903" ||
    latestLedger.branch_id !== "br-damp-shape-b3xlh4nr" ||
    latestLedger.applied_count !== 51 || latestLedger.entries?.length !== 51 ||
    latestLedger.entries[50]?.filename !== "051_task_notification_recipient_rls_helper.sql" ||
    latestLedger.entries[50]?.sha256 !== "acda688d928ef06e2a8a069953976d0fa57f8fa7a5a0d988534d7da189d8a927") {
  fail("Migration 052 release requires the exact verified 001-051 Production ledger.");
}
if (appliedLedger.project_id !== "purple-base-63944903" ||
    appliedLedger.branch_id !== "br-damp-shape-b3xlh4nr" ||
    appliedLedger.applied_count !== 52 || appliedLedger.entries?.length !== 52 ||
    appliedLedger.pending_migrations?.length !== 0 ||
    appliedLedger.entries[51]?.filename !== "052_funder_finance_report_scope_isolation.sql" ||
    appliedLedger.entries[51]?.sha256 !== "cc8d34c12d34eab9c4cc9aeabd46d9da59b1ec7ef0c7c89345d4b49455a6ac0b" ||
    appliedLedger.entries[51]?.status !== "applied") {
  fail("Canonical Production migration ledger 001-052 is not verified.");
}
if (!runner.includes("migration_history_manifest_001_052.json")) {
  fail("Migration status runner does not use the canonical applied 001-052 ledger.");
}
if (backupEvidence.backup_branch_id !== "br-snowy-credit-b336z950" ||
    backupEvidence.backup_branch_state !== "ready" ||
    backupEvidence.migration_052_applied !== false ||
    JSON.stringify(backupEvidence.production_counts) !== JSON.stringify(backupEvidence.backup_counts)) {
  fail("Migration 052 release requires verified fresh Production backup parity evidence.");
}
for (const token of [
  "MIGRATE_052_CONFIRM", "MIGRATION_052_APPROVED_SHA256",
  "MIGRATION_052_APPROVAL_REFERENCE", "MIGRATION_BACKUP_REFERENCE",
  "MIGRATION_BACKUP_SHA256", "pg_advisory_lock", "await client.query(body)",
  'await client.query("COMMIT")', 'await client.query("ROLLBACK")',
]) {
  if (!migration052Runner.includes(token)) fail("Dedicated Migration 052 runner missing safety guard: " + token);
}
if (hashFile("migrations/052_funder_finance_report_scope_isolation.sql") !==
    "cc8d34c12d34eab9c4cc9aeabd46d9da59b1ec7ef0c7c89345d4b49455a6ac0b") {
  fail("Migration 052 exact approved SHA-256 mismatch.");
}

if (process.exitCode) process.exit(process.exitCode);
console.log("PASS: baseline 001-028, verified Production history 001-047, exact ledger 048-051, fresh backup evidence and dedicated fail-closed Migration 052 runner are verified.");
console.log("NOTICE: authentic SQL source for historical migrations 029-035 remains unrecovered; candidates are not executable.");

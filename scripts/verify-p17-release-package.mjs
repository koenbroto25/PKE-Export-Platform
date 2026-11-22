import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const migrationsDir = path.join(root, "migrations");
const readJson = (name) => JSON.parse(fs.readFileSync(path.join(root, name), "utf8"));
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const hashFile = (name) => hash(fs.readFileSync(path.join(migrationsDir, name)));
const fail = (message) => { console.error("FAIL: " + message); process.exitCode = 1; };
const historyBase = readJson("migration_history_manifest_001_056.json");
const historyCurrent = readJson("migration_history_manifest_001_071.json");
const uat = readJson("migration_history_manifest_uat_001_110.json");
const release = readJson("migration_release_manifest_p17_096_109.json");
const p17d110 = readJson("migration_release_manifest_p17d_110.json");
const runner = fs.readFileSync(path.join(root, "scripts/apply-p17-migrations.mjs"), "utf8");

if (historyBase.project_id !== "purple-base-63944903" || historyBase.branch_id !== "br-damp-shape-b3xlh4nr" ||
    historyBase.database !== "neondb" || historyBase.applied_count !== 56 || historyBase.entries?.length !== 56 ||
    historyBase.entries[55]?.filename !== "083_p2b_port_warehouse_governance_prod.sql") {
  fail("Production pre-P17 baseline manifest must pin exactly ledger 001-056.");
}
if (historyCurrent.project_id !== "purple-base-63944903" || historyCurrent.branch_id !== "br-damp-shape-b3xlh4nr" ||
    historyCurrent.database !== "neondb" || historyCurrent.applied_count !== 71 || historyCurrent.entries?.length !== 71 ||
    historyCurrent.entries[70]?.filename !== "110_p17d_vessel_position_runtime_rls_fix.sql") {
  fail("Current Production manifest must reconcile exactly ledger 001-070.");
}
if (uat.purpose !== "verified_uat_history_only_not_production_history" || uat.branch_id !== "br-young-boat-b3re832d" ||
    uat.ledger_row_count !== 110 || uat.applied_count !== 94 || uat.entries?.length !== 110 ||
    uat.entries[109]?.filename !== "110_p17d_vessel_position_runtime_rls_fix.sql") {
  fail("UAT history must remain isolated and reconcile through migration 110.");
}
if (release.purpose !== "production_p17_release_package_exact_sql_hashes_owner_approval_required" ||
    release.project_id !== "purple-base-63944903" || release.branch_id !== "br-damp-shape-b3xlh4nr" ||
    release.starting_history_count !== 56 || release.expected_first_ledger_id !== 57 ||
    release.expected_last_ledger_id !== 70 || release.migrations?.length !== 14) {
  fail("P17 Production release manifest target/scope mismatch.");
}

if (p17d110.purpose !== "production_p17d_runtime_rls_correction_applied" ||
    p17d110.project_id !== "purple-base-63944903" || p17d110.branch_id !== "br-damp-shape-b3xlh4nr" ||
    p17d110.owner_approval?.status !== "approved" || p17d110.production_application?.ledger_id !== 71 ||
    p17d110.migrations?.length !== 1 || p17d110.migrations[0]?.status !== "applied" ||
    p17d110.migrations[0]?.production_applied !== true ||
    hashFile("110_p17d_vessel_position_runtime_rls_fix.sql") !== p17d110.migrations[0]?.sha256) {
  fail("P17-D migration 110 must match its approved Production application and exact source hash.");
}
const production110 = historyCurrent.entries[70];
if (production110?.id !== 71 || production110?.filename !== "110_p17d_vessel_position_runtime_rls_fix.sql" ||
    production110?.sha256 !== p17d110.migrations[0]?.sha256 || production110?.status !== "applied") {
  fail("Production ledger manifest does not reconcile migration 110 at ID 71.");
}

for (let i = 0; i < 56; i++) {
  const a=historyBase.entries[i], b=historyCurrent.entries[i];
  if (!a || !b || a.id!==i+1 || b.id!==i+1 || a.filename!==b.filename || a.sha256!==b.sha256 || a.status!==b.status) {
    fail("Production baseline/current manifest diverges at ID " + (i+1));
  }
}
function removeTransactionWrapper(sql) {
  const normalized = sql.replace(/\r\n/g, "\n");
  if (!/^\s*(?:--[^\r\n]*(?:\r?\n|$))*BEGIN;\s*/i.test(normalized) || !/COMMIT;\s*$/.test(normalized)) {
    throw new Error("transaction wrapper missing");
  }
  return normalized.replace(/\nBEGIN;\n\n/, "\n").replace(/COMMIT;\n?$/, "");
}
for (let i = 0; i < release.migrations.length; i++) {
  const item = release.migrations[i], n=96+i;
  if (item.ledger_id !== 57+i || item.status !== "applied" || item.source_sha_verified !== true ||
      hashFile(item.filename) !== item.sha256) fail("P17 source/hash/ledger mismatch: " + item.filename);
  const live=historyCurrent.entries[56+i];
  if (live?.id !== item.ledger_id || live?.filename !== item.filename || live?.sha256 !== item.sha256 || live?.status !== "applied") {
    fail("Production ledger row differs from P17 release entry: " + item.filename);
  }
  const sql=fs.readFileSync(path.join(migrationsDir,item.filename),"utf8");
  if ((sql.match(/^BEGIN;\s*$/gim)||[]).length!==1 || (sql.match(/^COMMIT;\s*$/gim)||[]).length!==1) fail("Atomic wrapper missing: "+item.filename);
  if (/^\s*(DROP\s+TABLE|DROP\s+SCHEMA|TRUNCATE)\b/im.test(sql)) fail("Unexpected destructive DDL: "+item.filename);
  if (n>=96 && n<=98) {
    const u=uat.entries.find(x=>x.filename===item.filename);
    if (!u || hash(Buffer.from(removeTransactionWrapper(sql)))!==u.sha256) fail("Historical UAT SQL body differs for "+item.filename);
  } else {
    const u=uat.entries.find(x=>x.filename===item.filename);
    if (!u || u.sha256!==item.sha256) fail("UAT source hash mismatch for "+item.filename);
  }
}
const ais=uat.entries.find(x=>x.filename==="110_p17d_vessel_position_runtime_rls_fix.sql");
if (!ais || ais.sha256!==hashFile("110_p17d_vessel_position_runtime_rls_fix.sql")) fail("UAT AIS runtime RLS corrective migration 110 hash mismatch.");
for (const guard of ["pg_advisory_lock(424242)","LIVE VERIFY PASS","P17 096-109 are already applied","P17 096-109 applied at IDs 57-70"]) {
  if (!runner.includes(guard)) fail("P17 release verifier missing required guard: "+guard);
}
if (!process.exitCode) console.log("P17 release package PASS: Production ledger 001-071, pre-release baseline 001-056, UAT 001-110, P17 096-109 exact hashes and Production-applied migration 110 verified.");

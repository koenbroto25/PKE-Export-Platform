import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import pg from "pg";
import dotenv from "dotenv";

dotenv.config();
dotenv.config({ path: ".env.migrate", override: false });

const mode = process.argv[2] || "dry-run";
const ROOT = process.cwd();
const HISTORY_BASELINE_PATH = path.join(ROOT, "migration_history_manifest_001_056.json");
const HISTORY_CURRENT_PATH = path.join(ROOT, "migration_history_manifest_001_070.json");
const RELEASE_PATH = path.join(ROOT, "migration_release_manifest_p17_096_109.json");
const EXPECTED = Object.freeze({
  projectId: "purple-base-63944903",
  branchId: "br-damp-shape-b3xlh4nr",
  database: "neondb",
  host: "ep-odd-resonance-b3zb42fw.c-4.ap-southeast-1.aws.neon.tech",
  port: 5432,
  firstLedgerId: 57,
  lastLedgerId: 70,
});
const fail = (message) => { throw new Error("BLOCKED: " + message); };
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const readJson = (file) => {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (error) { fail("Unable to read " + path.basename(file) + ": " + (error?.message || "invalid JSON")); }
};
const sameEntry = (a, e, i) =>
  Number(a?.id) === Number(e?.id) && Number(e?.id) === i + 1 &&
  a?.filename === e?.filename && a?.sha256 === e?.sha256 && a?.status === e?.status;

function validateManifest() {
  const baseline = readJson(HISTORY_BASELINE_PATH);
  const current = readJson(HISTORY_CURRENT_PATH);
  const release = readJson(RELEASE_PATH);
  if (baseline.purpose !== "verified_production_history_only_not_sql_source" ||
      baseline.project_id !== EXPECTED.projectId || baseline.branch_id !== EXPECTED.branchId ||
      baseline.database !== EXPECTED.database || baseline.applied_count !== 56 ||
      baseline.entries?.length !== 56 || baseline.entries[55]?.id !== 56 ||
      baseline.entries[55]?.filename !== "083_p2b_port_warehouse_governance_prod.sql") {
    fail("Production baseline manifest 001-056 is missing or does not match the prerequisite release.");
  }
  if (current.project_id !== EXPECTED.projectId || current.branch_id !== EXPECTED.branchId ||
      current.database !== EXPECTED.database || current.applied_count !== 70 ||
      current.entries?.length !== 70 || current.entries[69]?.id !== 70 ||
      current.entries[69]?.filename !== "109_p17f_buyer_self_read_rls_recursion_fix.sql") {
    fail("Current Production ledger manifest 001-070 is missing or invalid.");
  }
  if (release.purpose !== "production_p17_release_package_exact_sql_hashes_owner_approval_required" ||
      release.project_id !== EXPECTED.projectId || release.branch_id !== EXPECTED.branchId ||
      release.database !== EXPECTED.database || release.starting_history_count !== 56 ||
      release.expected_first_ledger_id !== EXPECTED.firstLedgerId ||
      release.expected_last_ledger_id !== EXPECTED.lastLedgerId ||
      release.migrations?.length !== 14) {
    fail("P17 release manifest must pin exactly migrations 096-109 at ledger IDs 57-70.");
  }
  for (let i = 0; i < 56; i++) {
    if (!sameEntry(current.entries[i], baseline.entries[i], i)) fail("Current ledger diverges from pre-P17 baseline at ID " + (i + 1));
  }
  for (let i = 0; i < release.migrations.length; i++) {
    const item = release.migrations[i];
    const n = 96 + i;
    if (item.ledger_id !== EXPECTED.firstLedgerId + i ||
        !item.filename.startsWith(String(n).padStart(3, "0") + "_") ||
        !/^[a-f0-9]{64}$/.test(item.sha256) || item.status !== "applied" ||
        item.source_sha_verified !== true) fail("Malformed applied P17 release entry at sequence " + (i + 1));
    const actual = sha256(fs.readFileSync(path.join(ROOT, "migrations", item.filename)));
    if (actual !== item.sha256) fail("SHA-256 mismatch for " + item.filename);
    const sql = fs.readFileSync(path.join(ROOT, "migrations", item.filename), "utf8");
    if ((sql.match(/^BEGIN;\s*$/gim) || []).length !== 1 ||
        (sql.match(/^COMMIT;\s*$/gim) || []).length !== 1) fail(item.filename + " must have one explicit BEGIN/COMMIT boundary.");
    if (/^\s*(DROP\s+TABLE|DROP\s+SCHEMA|TRUNCATE)\b/im.test(sql)) fail("Unexpected destructive DDL in " + item.filename);
    const ledger = current.entries[56 + i];
    if (!sameEntry(ledger, { ...item, id: item.ledger_id }, 56 + i)) fail("Production ledger does not match release manifest for " + item.filename);
  }
  return { baseline, current, release };
}

function validateDatabaseUrl(raw) {
  if (!raw || typeof raw !== "string" || /\s/.test(raw)) fail("MIGRATION_DATABASE_URL is missing or malformed.");
  let url;
  try { url = new URL(raw); } catch { fail("MIGRATION_DATABASE_URL is not a valid PostgreSQL URL."); }
  if (!["postgres:", "postgresql:"].includes(url.protocol)) fail("MIGRATION_DATABASE_URL must use PostgreSQL.");
  if (url.hostname !== EXPECTED.host || (url.port ? Number(url.port) : 5432) !== EXPECTED.port) fail("Database host/port is not canonical Production.");
  if (url.pathname.replace(/^\//, "") !== EXPECTED.database) fail("Database name is not neondb.");
  if (!["require", "verify-ca", "verify-full"].includes(url.searchParams.get("sslmode"))) fail("TLS sslmode=require/verify-ca/verify-full is mandatory.");
  const username = decodeURIComponent(url.username || "");
  if (!username || ["app_runtime", "app_runtime_secure"].includes(username)) fail("Use a dedicated maintenance/owner role, never an application runtime role.");
}

async function verifyLiveLedger(client, manifest) {
  const result = await client.query("SELECT id,filename,sha256,status FROM public.migration_history ORDER BY id");
  if (result.rows.length !== manifest.entries.length) fail("Live Production ledger count differs from manifest.");
  for (let i = 0; i < manifest.entries.length; i++) {
    if (!sameEntry(result.rows[i], manifest.entries[i], i)) fail("Live Production ledger mismatch at ID " + (i + 1));
  }
  return result.rows.length;
}

async function main() {
  const { baseline, current, release } = validateManifest();
  const packageHash = sha256(fs.readFileSync(RELEASE_PATH));
  console.log("Target: " + EXPECTED.projectId + " / " + EXPECTED.branchId + " / " + EXPECTED.database);
  console.log("Production ledger: 001-070; P17 096-109 applied at IDs 57-70.");
  console.log("Release manifest SHA-256: " + packageHash);
  if (mode === "dry-run") {
    console.log("DRY-RUN PASS: all 14 P17 source files match pinned hashes and the reconciled Production ledger manifest.");
    return;
  }
  if (mode === "apply") fail("P17 096-109 are already applied. Replay is disabled; use verify.");
  if (mode !== "verify") fail("Use dry-run or verify.");
  validateDatabaseUrl(process.env.MIGRATION_DATABASE_URL);
  const client = new pg.Client({
    connectionString: process.env.MIGRATION_DATABASE_URL,
    connectionTimeoutMillis: 15000,
    ssl: { rejectUnauthorized: true },
  });
  await client.connect();
  let locked = false;
  try {
    const identity = await client.query("SELECT current_database() AS db,current_user AS usr,inet_server_port() AS port");
    const ident = identity.rows[0] || {};
    if (ident.db !== EXPECTED.database || Number(ident.port) !== EXPECTED.port ||
        ["app_runtime", "app_runtime_secure"].includes(ident.usr)) fail("Connected identity is not canonical Production maintenance role.");
    await client.query("SELECT pg_advisory_lock(424242)");
    locked = true;
    const count = await verifyLiveLedger(client, current);
    console.log("LIVE VERIFY PASS: " + count + " ledger rows match 001-070, including all 14 P17 hashes.");
  } finally {
    if (locked) await client.query("SELECT pg_advisory_unlock(424242)").catch(() => {});
    await client.end();
  }
}
main().catch(error => { console.error(error?.message || error); process.exit(1); });

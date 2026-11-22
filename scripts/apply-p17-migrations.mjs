import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import pg from "pg";
import dotenv from "dotenv";

dotenv.config();
dotenv.config({ path: ".env.migrate", override: false });

const mode = process.argv[2] || "dry-run";
const ROOT = process.cwd();
const MIGRATIONS_DIR = path.join(ROOT, "migrations");
const HISTORY_MANIFEST_PATH = path.join(ROOT, "migration_history_manifest_001_053.json");
const RELEASE_MANIFEST_PATH = path.join(ROOT, "migration_release_manifest_p17_096_109.json");
const EXPECTED = Object.freeze({
  projectId: "purple-base-63944903",
  branchId: "br-damp-shape-b3xlh4nr",
  database: "neondb",
  host: "ep-odd-resonance-b3zb42fw.c-4.ap-southeast-1.aws.neon.tech",
  port: 5432,
  firstLedgerId: 54,
  lastLedgerId: 67,
});
const fail = (message) => { throw new Error("BLOCKED: " + message); };
const sha256Buffer = (value) => crypto.createHash("sha256").update(value).digest("hex");
const sha256File = (file) => sha256Buffer(fs.readFileSync(path.join(MIGRATIONS_DIR, file)));

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (error) { fail("Unable to read " + path.basename(file) + ": " + (error?.message || "invalid JSON")); }
}

function validateManifest() {
  const history = readJson(HISTORY_MANIFEST_PATH);
  const release = readJson(RELEASE_MANIFEST_PATH);
  if (history.purpose !== "verified_production_history_only_not_sql_source" ||
      history.project_id !== EXPECTED.projectId || history.branch_id !== EXPECTED.branchId ||
      history.database !== EXPECTED.database || history.applied_count !== 53 ||
      !Array.isArray(history.entries) || history.entries.length !== 53 ||
      history.entries[52]?.id !== 53 ||
      history.entries[52]?.filename !== "053_project_admin_accounting_reports_read_only.sql") {
    fail("Verified Production history manifest 001-053 is missing or has the wrong target/ledger baseline.");
  }
  if (release.purpose !== "production_p17_release_package_exact_sql_hashes_owner_approval_required" ||
      release.project_id !== EXPECTED.projectId || release.branch_id !== EXPECTED.branchId ||
      release.database !== EXPECTED.database || release.starting_history_count !== 53 ||
      release.expected_first_ledger_id !== EXPECTED.firstLedgerId ||
      release.expected_last_ledger_id !== EXPECTED.lastLedgerId ||
      !Array.isArray(release.migrations) || release.migrations.length !== 14) {
    fail("P17 release manifest must pin exactly migrations 096-109 for the canonical Production target.");
  }
  for (let i = 0; i < release.migrations.length; i++) {
    const item = release.migrations[i];
    const n = 96 + i;
    if (item.ledger_id !== EXPECTED.firstLedgerId + i ||
        !item.filename.startsWith(String(n).padStart(3, "0") + "_") ||
        !/^[a-f0-9]{64}$/.test(item.sha256) || item.status !== "pending" ||
        item.source_sha_verified !== true) {
      fail("Malformed P17 release manifest entry at sequence " + (i + 1) + ".");
    }
    if (!fs.existsSync(path.join(MIGRATIONS_DIR, item.filename))) fail("Missing SQL file " + item.filename + ".");
    if (sha256File(item.filename) !== item.sha256) fail("SHA-256 mismatch for " + item.filename + ".");
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, item.filename), "utf8");
    const beginLines = sql.match(/^BEGIN;\s*$/gim) || [];
    const commitLines = sql.match(/^COMMIT;\s*$/gim) || [];
    if (beginLines.length !== 1 || commitLines.length !== 1) fail(item.filename + " must have exactly one explicit BEGIN/COMMIT boundary.");
    if (/^\s*(DROP\s+TABLE|DROP\s+SCHEMA|TRUNCATE)\b/im.test(sql)) fail("Destructive table/schema operation is prohibited in " + item.filename + ".");
  }
  return { history, release, releaseManifestSha256: sha256Buffer(fs.readFileSync(RELEASE_MANIFEST_PATH)) };
}

function validateDatabaseUrl(raw) {
  if (!raw || typeof raw !== "string" || /\s/.test(raw)) fail("MIGRATION_DATABASE_URL is missing or malformed.");
  let url;
  try { url = new URL(raw); } catch { fail("MIGRATION_DATABASE_URL is not a valid PostgreSQL URL."); }
  if (!["postgres:", "postgresql:"].includes(url.protocol)) fail("MIGRATION_DATABASE_URL must use PostgreSQL.");
  if (url.hostname !== EXPECTED.host || (url.port ? Number(url.port) : 5432) !== EXPECTED.port) fail("Database host/port is not the approved Production branch.");
  if (url.pathname.replace(/^\//, "") !== EXPECTED.database) fail("Database name is not neondb.");
  if (!["require", "verify-ca", "verify-full"].includes(url.searchParams.get("sslmode"))) fail("TLS sslmode=require/verify-ca/verify-full is mandatory.");
  const username = decodeURIComponent(url.username || "");
  if (!username || ["app_runtime", "app_runtime_secure"].includes(username)) fail("Use a dedicated maintenance/owner role, never an application runtime role.");
  return { username };
}

function migrationBody(sql, filename) {
  const begin = /^\s*(?:--[^\r\n]*(?:\r?\n|$))*BEGIN;\s*/i;
  const commit = /\s*COMMIT;\s*$/i;
  if (!begin.test(sql) || !commit.test(sql)) fail("Missing transaction wrapper in " + filename + ".");
  return sql.replace(begin, "").replace(commit, "");
}

async function verifyHistory(client, historyManifest, expectedLength = 53) {
  const result = await client.query("SELECT id,filename,sha256,status FROM public.migration_history ORDER BY id");
  if (result.rows.length !== expectedLength) fail("Production migration_history must contain exactly " + expectedLength + " rows; found " + result.rows.length + ".");
  const expected = expectedLength === 53
    ? historyManifest.entries
    : null;
  if (expected) {
    for (let i = 0; i < expected.length; i++) {
      const a = result.rows[i], e = expected[i];
      if (Number(a.id) !== i + 1 || Number(e.id) !== i + 1 ||
          a.filename !== e.filename || a.sha256 !== e.sha256 || a.status !== e.status) {
        fail("Production migration_history differs from verified manifest at sequence " + (i + 1) + ".");
      }
    }
  }
  return result.rows;
}

async function main() {
  const { history, release, releaseManifestSha256 } = validateManifest();
  const items = release.migrations;
  console.log("Target: " + EXPECTED.projectId + " / " + EXPECTED.branchId + " / " + EXPECTED.database);
  console.log("Package SHA-256: " + releaseManifestSha256);
  for (const item of items) console.log(item.ledger_id + " " + item.filename + " sha256=" + item.sha256);

  if (mode === "dry-run") {
    console.log("DRY-RUN PASS: all 14 SQL files match the exact pinned SHA-256 values; no database connection attempted.");
    return;
  }
  if (mode !== "apply") fail("Use dry-run or apply.");
  validateDatabaseUrl(process.env.MIGRATION_DATABASE_URL);

  if (process.env.MIGRATE_P17_CONFIRM !== "1") fail("Set MIGRATE_P17_CONFIRM=1 only after owner approval of the exact 096-109 package.");
  if (process.env.MIGRATION_P17_APPROVED_MANIFEST_SHA256 !== releaseManifestSha256) fail("P17 package approval SHA-256 is absent or does not match the pinned manifest.");
  if (!process.env.MIGRATION_P17_APPROVAL_REFERENCE?.trim()) fail("P17 package approval reference is required.");
  const corrective = items.slice(-2);
  const correctiveApprovalSha = sha256Buffer(corrective.map(x => x.sha256).join("\n"));
  if (process.env.MIGRATE_P17_108_109_CONFIRM !== "1" ||
      process.env.MIGRATION_P17_108_109_APPROVED_SHA256 !== correctiveApprovalSha ||
      !process.env.MIGRATION_P17_108_109_APPROVAL_REFERENCE?.trim()) {
    fail("Migrations 108-109 are corrective Buyer RLS fixes and require separate explicit owner approval of their exact combined SHA-256.");
  }

  const client = new pg.Client({
    connectionString: process.env.MIGRATION_DATABASE_URL,
    connectionTimeoutMillis: 15000,
    ssl: { rejectUnauthorized: true },
  });
  await client.connect();
  let lockHeld = false;
  try {
    const identity = await client.query("SELECT current_database() AS db,current_user AS usr,session_user AS sess,inet_server_port() AS port");
    const ident = identity.rows[0] || {};
    if (ident.db !== EXPECTED.database || Number(ident.port) !== EXPECTED.port ||
        ["app_runtime", "app_runtime_secure"].includes(ident.usr)) {
      fail("Connected database identity does not match approved Production maintenance target.");
    }
    await client.query("SELECT pg_advisory_lock(424242)");
    lockHeld = true;
    await verifyHistory(client, history, 53);
    const pending = await client.query(
      "SELECT filename FROM public.migration_history WHERE filename = ANY($1::text[])",
      [items.map(x => x.filename)]
    );
    if (pending.rows.length) fail("One or more P17 migrations already exist in Production history; refusing replay.");

    await client.query("BEGIN");
    try {
      for (const item of items) {
        const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, item.filename), "utf8");
        await client.query(migrationBody(sql, item.filename));
        const inserted = await client.query(
          "INSERT INTO public.migration_history(filename,sha256,status) VALUES($1,$2,'applied') RETURNING id",
          [item.filename, item.sha256]
        );
        if (Number(inserted.rows[0]?.id) !== item.ledger_id) {
          fail("Unexpected migration_history sequence for " + item.filename + ".");
        }
        console.log("Applied in package transaction: " + item.filename);
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      fail("P17 package failed; all migrations 096-109 were rolled back: " + (error?.message || "unknown error"));
    }
    const after = await client.query(
      "SELECT id,filename,sha256,status FROM public.migration_history WHERE id BETWEEN $1 AND $2 ORDER BY id",
      [EXPECTED.firstLedgerId, EXPECTED.lastLedgerId]
    );
    if (after.rows.length !== items.length || items.some((e,i) => {
      const a=after.rows[i]; return !a || Number(a.id)!==e.ledger_id || a.filename!==e.filename || a.sha256!==e.sha256 || a.status!=="applied";
    })) fail("Post-commit P17 ledger verification failed.");
    console.log("P17 096-109 atomic Production release PASS. Approval reference: " + process.env.MIGRATION_P17_APPROVAL_REFERENCE);
  } finally {
    if (lockHeld) await client.query("SELECT pg_advisory_unlock(424242)").catch(() => {});
    await client.end();
  }
}

main().catch(error => {
  console.error(error?.message || error);
  process.exit(1);
});

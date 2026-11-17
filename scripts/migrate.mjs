import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import pg from "pg";
import dotenv from "dotenv";

dotenv.config();
dotenv.config({ path: ".env.migrate", override: false });

const mode = process.argv[2] || "dry-run";
const migrationsDir = path.resolve("migrations");
const manifestPath = path.resolve("migration_manifest_001_027.json");

// REVISION 5.6 safety policy:
// - Migrations 001-035 are immutable; no apply/baseline may rerun or mutate them.
// - New migrations only 036+ and require specific owner-approved SHA-256/exact-SQL review (not implemented here).
// - Single-branch mandated target only, no local/legacy/alternate hosts or roles.
const EXPECTED_HOST = "ep-odd-resonance-b3zb42fw.c-4.ap-southeast-1.aws.neon.tech";
const EXPECTED_DB = "neondb";
const EXPECTED_PORT = 5432;
const LEGACY_HOST_HINTS = [
  "ep-restless-hat-b35j9x0d", "ep-blue-rice-b3ywrqrq",
  "br-calm-glade-b3nrleet", "br-billowing-math-b31f4wos",
  "lucky-glitter-99553107", "localhost", "127.0.0.1", "[::1]"
];

function sha256File(filePath) {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function fail(message) {
  console.error(`BLOCKED: ${message}`);
  process.exit(1);
}

function loadManifest() {
  if (!fs.existsSync(manifestPath)) return null;
  try { return JSON.parse(fs.readFileSync(manifestPath, "utf8")); } catch { return null; }
}

function listSqlFiles() {
  return fs.readdirSync(migrationsDir).filter((f) => /^\d{3}_.*\.sql$/i.test(f)).sort();
}

function parseMigrationNumber(file) {
  const m = /^(\d{3})_/.exec(file);
  return m ? Number.parseInt(m[1], 10) : NaN;
}

function validateTargetUrl(rawUrl, label, { requireMaintenanceRole = false } = {}) {
  if (!rawUrl || typeof rawUrl !== "string" || !rawUrl.trim()) fail(`${label} is not set.`);
  if (/\s/.test(rawUrl)) fail(`${label} contains whitespace.`);
  let u;
  try { u = new URL(rawUrl); } catch { fail(`${label} is not a valid URL.`); }
  if (u.protocol !== "postgres:" && u.protocol !== "postgresql:") fail(`${label} must use postgres/postgresql protocol.`);
  if (u.hostname !== EXPECTED_HOST) fail(`${label} host is not the mandated single-branch target (${EXPECTED_HOST}).`);
  for (const h of LEGACY_HOST_HINTS) { if (u.hostname.includes(h) || rawUrl.includes(h)) fail(`${label} references a legacy/local/forbidden host.`); }
  const port = u.port ? Number.parseInt(u.port, 10) : 5432;
  if (port !== EXPECTED_PORT) fail(`${label} port must be ${EXPECTED_PORT}.`);
  const db = u.pathname.replace(/^\//, "");
  if (db !== EXPECTED_DB) fail(`${label} database must be ${EXPECTED_DB}.`);
  const sslmode = u.searchParams.get("sslmode");
  if (!sslmode || !["require", "verify-ca", "verify-full"].includes(sslmode)) fail(`${label} must require TLS (sslmode=require|verify-ca|verify-full).`);
  const username = decodeURIComponent(u.username || "");
  if (!username) fail(`${label} username is missing.`);
  if (requireMaintenanceRole) {
    if (username === "app_runtime_secure" || username === "app_runtime") {
      fail(`${label} must use a separate database-owner/maintenance role, never an application runtime role.`);
    }
  } else {
    // status/read-only checks also must not run against runtime role for migration operations
    if (username === "app_runtime_secure" || username === "app_runtime") {
      fail(`${label} must not use application runtime role for migration operations.`);
    }
  }
  return { url: rawUrl, username, db, host: u.hostname, port };
}

async function main() {
  const databaseUrl = process.env.MIGRATION_DATABASE_URL;
  const files = listSqlFiles();
  const manifest = loadManifest();
  const manifestMap = new Map((manifest?.baseline_migrations || []).map((m) => [m.file, m.sha256]));

  console.log(`Found ${files.length} numbered migration files in migrations/.`);
  console.log(`Mode: ${mode}`);
  if (manifest) console.log(`Manifest: migration_manifest_001_027.json (${manifest.baseline_migrations.length} entries, revision ${manifest.revision || "unknown"}).`);
  else console.log("Manifest: not found (cannot prove approved hashes for all files).");

  // Fail closed if unapproved/new migration files are present for mutating modes.
  const nums = files.map((f) => ({ f, n: parseMigrationNumber(f) })).filter((x) => Number.isInteger(x.n));
  const has036Plus = nums.some((x) => x.n >= 36);
  const has029to032or035Gap = [29,30,31,32,35].some((n) => !files.some((f) => parseMigrationNumber(f) === n));
  if (has029to032or035Gap) {
    console.log("NOTICE: migration files 029-032 and/or 035 are not present in migrations/ (cannot assume applied or approved from local files).");
  }
  if (has036Plus) {
    console.log("NOTICE: migration file(s) >= 036 detected. 036+ requires owner-approved exact SQL + SHA-256 review before any apply/baseline.");
  }

  // Checksum comparison for files present in manifest
  for (const file of files) {
    const expected = manifestMap.get(file);
    if (!expected) continue;
    const actual = sha256File(path.join(migrationsDir, file));
    if (actual !== expected) {
      console.error(`CHECKSUM_MISMATCH (manifest): ${file}`);
      if (mode !== "dry-run") fail(`Manifest checksum mismatch for ${file}. Refusing mutating/read-target operation.`);
    }
  }

  if (mode === "dry-run") {
    for (const file of files) {
      const fullPath = path.join(migrationsDir, file);
      const sha = sha256File(fullPath);
      const inManifest = manifestMap.has(file) ? "manifest=known" : "manifest=absent";
      console.log(`${file} sha256=${sha} ${inManifest}`);
    }
    if (has036Plus) console.log("DRY-RUN NOTE: 036+ files present but NOT approved for apply/baseline by this runner.");
    console.log("Dry-run complete. No database changes made. No target connection attempted.");
    return;
  }

  if (mode === "status") {
    validateTargetUrl(databaseUrl, "MIGRATION_DATABASE_URL", { requireMaintenanceRole: true });
    const client = new pg.Client({ connectionString: databaseUrl, connectionTimeoutMillis: 15000, ssl: { rejectUnauthorized: true } });
    await client.connect();
    try {
      // verify identity (fail-closed) — read-only
      const ident = await client.query(`SELECT current_database() AS db, current_user AS usr, session_user AS sess, inet_server_port() AS port`);
      const row = ident.rows[0] || {};
      if (row.db !== EXPECTED_DB || row.usr === "app_runtime_secure" || row.usr === "app_runtime" || Number(row.port) !== EXPECTED_PORT) {
        fail(`Connected identity/port mismatch for status (db=${row.db}, user=${row.usr}, port=${row.port}).`);
      }
      const exists = await client.query("SELECT to_regclass('public.migration_history') IS NOT NULL AS exists");
      if (!exists.rows[0].exists) {
        console.log("migration_history table: NOT FOUND");
        for (const file of files) console.log(`${file}: PENDING (no history table)`);
        return;
      }
      const applied = await client.query("SELECT filename, sha256, status, applied_at FROM migration_history ORDER BY id");
      const appliedMap = new Map(applied.rows.map((r) => [r.filename, r]));
      for (const file of files) {
        const row = appliedMap.get(file);
        if (!row) console.log(`${file}: PENDING`);
        else if (row.sha256 !== sha256File(path.join(migrationsDir, file))) console.log(`${file}: CHECKSUM_MISMATCH`);
        else console.log(`${file}: ${String(row.status).toUpperCase()}_VERIFIED`);
      }
      // show history-only applied files not present locally (important for 029-032/035 gaps)
      for (const [fname, row] of appliedMap.entries()) {
        if (!files.includes(fname)) console.log(`${fname}: APPLIED_IN_DB_BUT_FILE_MISSING_LOCALLY (status=${row.status})`);
      }
    } finally {
      await client.end();
    }
    return;
  }

  if (mode === "baseline" || mode === "apply") {
    if (mode === "apply" && process.env.MIGRATE_CONFIRM !== "1") fail("Apply requires MIGRATE_CONFIRM=1.");
    validateTargetUrl(databaseUrl, "MIGRATION_DATABASE_URL", { requireMaintenanceRole: true });

    // Explicit owner-approved one-shot exception: migration 036 only.
    // SHA-256 is pinned to the reviewed SQL; 001-035 remain immutable.
    if (mode === "apply") {
      const approved036 = "036_validate_production_schema_invariants.sql";
      const approved036Sha = "4a70d8b343c44e26c9592402c4c8dceb3b6a0d11c5f4e619847baff774034a52";
      const newFiles = files.filter((f) => parseMigrationNumber(f) >= 36);
      if (newFiles.length !== 1 || newFiles[0] !== approved036) {
        fail("Approved apply is restricted to exactly 036_validate_production_schema_invariants.sql.");
      }
      const approvedPath = path.join(migrationsDir, approved036);
      const actual036Sha = sha256File(approvedPath);
      if (actual036Sha !== approved036Sha) fail("036 checksum mismatch; refusing to apply.");
      const client = new pg.Client({ connectionString: databaseUrl, connectionTimeoutMillis: 15000, ssl: { rejectUnauthorized: true } });
      await client.connect();
      let lockHeld = false;
      try {
        const identity = await client.query("SELECT current_database() AS db, current_user AS usr, inet_server_port() AS port");
        const ident = identity.rows[0] || {};
        if (ident.db !== EXPECTED_DB || ident.usr === "app_runtime_secure" || ident.usr === "app_runtime" || Number(ident.port) !== EXPECTED_PORT) {
          fail("036 target identity verification failed.");
        }
        await client.query("SELECT pg_advisory_lock(424242)");
        lockHeld = true;
        const history = await client.query("SELECT id, filename, sha256, status FROM public.migration_history ORDER BY id");
        if (history.rows.length !== 35 || history.rows.some((r, i) => Number(r.id) !== i + 1)) {
          fail("036 requires an exact, contiguous migration_history 001-035; refusing.");
        }
        if (history.rows.some((r) => r.filename === approved036)) fail("036 already exists in migration_history; refusing re-apply.");
        const sql = fs.readFileSync(approvedPath, "utf8");
        await client.query("BEGIN");
        try {
          await client.query(sql);
          await client.query(
            "INSERT INTO public.migration_history (filename, sha256, status) VALUES ($1, $2, 'applied')",
            [approved036, approved036Sha]
          );
          await client.query("COMMIT");
          console.log("Applied approved migration 036; SQL and history row committed atomically.");
        } catch (error) {
          await client.query("ROLLBACK");
          fail(`036 apply failed and transaction rolled back: ${error?.message || "unknown error"}`);
        }
      } finally {
        if (lockHeld) await client.query("SELECT pg_advisory_unlock(424242)").catch(() => {});
        await client.end();
      }
      return;
    }

    if (has036Plus) fail("Migration file(s) >= 036 detected. Refusing baseline/apply until 036+ has owner-approved exact SQL and SHA-256 review.");
    // Refuse if any numbered file lacks manifest approval (prevents applying untracked SQL files)
    const unapproved = files.filter((f) => !manifestMap.has(f));
    if (unapproved.length > 0) {
      fail(`Unapproved/non-manifest migration file(s) present: ${unapproved.join(", ")}. Baseline/apply refused (only manifest-approved immutable migrations allowed).`);
    }

    const client = new pg.Client({ connectionString: databaseUrl, connectionTimeoutMillis: 15000, ssl: { rejectUnauthorized: true } });
    await client.connect();
    try {
      const roleCheck = await client.query(`
        SELECT current_database() AS db, current_user AS current_role, session_user AS session_user, inet_server_port() AS port,
               has_database_privilege(current_user, current_database(), 'CREATE') AS can_create,
               rolsuper, rolcreatedb, rolcreaterole
        FROM pg_roles WHERE rolname = current_user
      `);
      const r = roleCheck.rows[0] || {};
      if (r.db !== EXPECTED_DB || r.current_role === "app_runtime_secure" || r.current_role === "app_runtime" || Number(r.port) !== EXPECTED_PORT) {
        fail(`Database identity/target proof failed for ${mode} (db=${r.db}, user=${r.current_role}, port=${r.port}).`);
      }
      if (!r.can_create) fail("Maintenance role lacks CREATE privilege; refusing mutating operation.");

      await client.query("SELECT pg_advisory_lock(424242)");
      await client.query(`
        CREATE TABLE IF NOT EXISTS migration_history (
          id serial PRIMARY KEY,
          filename text NOT NULL UNIQUE,
          sha256 text NOT NULL,
          applied_at timestamptz NOT NULL DEFAULT now(),
          status text NOT NULL
        );
      `);

      if (mode === "baseline") {
        // Baseline only manifest-approved immutable set present locally (001-028 in current manifest).
        // This records history only; it does not execute migration SQL.
        for (const file of files) {
          const fullPath = path.join(migrationsDir, file);
          const sha256 = sha256File(fullPath);
          const expected = manifestMap.get(file);
          if (!expected || expected !== sha256) fail(`Refusing to baseline ${file}: not in approved manifest or checksum mismatch.`);
          const existing = await client.query("SELECT sha256, status FROM migration_history WHERE filename = $1", [file]);
          if (existing.rows.length > 0) { console.log(`Skipping existing: ${file}`); continue; }
          await client.query("INSERT INTO migration_history (filename, sha256, status) VALUES ($1, $2, 'baselined')", [file, sha256]);
          console.log(`Baselined: ${file}`);
        }
        console.log("Baseline complete (history records only; no migration SQL executed).");
        return;
      }

      // apply: only manifest-approved immutable files 001-035 max in this runner (and none missing approval)
      for (const file of files) {
        const n = parseMigrationNumber(file);
        if (!Number.isInteger(n) || n < 1 || n > 35) fail(`Refusing to apply ${file}: only immutable migrations 001-035 are allowed.`);
        const fullPath = path.join(migrationsDir, file);
        const sha256 = sha256File(fullPath);
        const expected = manifestMap.get(file);
        if (!expected || expected !== sha256) fail(`Refusing to apply ${file}: not in approved manifest or checksum mismatch.`);
        const existing = await client.query("SELECT sha256, status FROM migration_history WHERE filename = $1", [file]);
        if (existing.rows.length > 0) {
          if (existing.rows[0].sha256 !== sha256) fail(`Checksum mismatch for ${file} in migration_history. Aborting.`);
          console.log(`Skipping already applied migration: ${file}`);
          continue;
        }
        const sql = fs.readFileSync(fullPath, "utf8");
        console.log(`Applying ${file}...`);
        try {
          await client.query("BEGIN");
          await client.query(sql);
          await client.query("INSERT INTO migration_history (filename, sha256, status) VALUES ($1, $2, 'applied')", [file, sha256]);
          await client.query("COMMIT");
          console.log(`Applied ${file}`);
        } catch (error) {
          await client.query("ROLLBACK");
          fail(`Failed to apply ${file}: ${error?.message || "unknown error"}`);
        }
      }
      console.log("Migration apply complete.");
    } finally {
      await client.query("SELECT pg_advisory_unlock(424242)").catch(() => {});
      await client.end();
    }
    return;
  }

  fail("Unknown mode. Use dry-run, status, baseline, or apply.");
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});

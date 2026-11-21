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
const productionHistoryManifestPath = path.resolve("migration_history_manifest_001_047.json");
const currentProductionHistoryManifestPath = path.resolve("migration_history_manifest_001_052.json");

// REVISION 5.6 safety policy:
// - Migrations 001-035 are immutable; no apply/baseline may rerun or mutate them.
// - 036-047 remain pinned to verified historical Production history; 048-051 are verified applied extensions.
// - 052 is applied through the dedicated fail-closed scripts/apply-migration-052.mjs path and is never replayed by this generic runner.
// - Single-branch mandated target only, no local/legacy/alternate hosts or roles.
const EXPECTED_HOST = "ep-odd-resonance-b3zb42fw.c-4.ap-southeast-1.aws.neon.tech";
const EXPECTED_DB = "neondb";
const EXPECTED_PORT = 5432;
const PREPARED_MIGRATION_PINS = Object.freeze({
  "048_buyer_accounting_ap_ar_document_hardening.sql": "48eea58270848cc90945cf42972f1a01216e66bb1f6b90c56204b47e877bcdc3",
  "049_project_work_item_task_engine.sql": "f61edb6ee54d7294a13cfd0a7319c4dee03299f718a3efdb6805081a50df2780",
  "050_inventory_holds_legacy_schema_alignment.sql": "e6c883652c841c3ffb597b81ae403c09f6f9015ee48d914ec6a0216a17c488ab",
  "051_task_notification_recipient_rls_helper.sql": "acda688d928ef06e2a8a069953976d0fa57f8fa7a5a0d988534d7da189d8a927",
  "052_funder_finance_report_scope_isolation.sql": "cc8d34c12d34eab9c4cc9aeabd46d9da59b1ec7ef0c7c89345d4b49455a6ac0b",
});

const P1_UAT_ONLY_START = 58; // P1 domain workflows are applied and validated on the isolated UAT branch only.

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

function loadProductionHistoryManifest() {
  if (!fs.existsSync(productionHistoryManifestPath)) return null;
  try { return JSON.parse(fs.readFileSync(productionHistoryManifestPath, "utf8")); } catch { return null; }
}

function loadCurrentProductionHistoryManifest() {
  if (!fs.existsSync(currentProductionHistoryManifestPath)) return null;
  try { return JSON.parse(fs.readFileSync(currentProductionHistoryManifestPath, "utf8")); } catch { return null; }
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
  const productionHistoryManifest = loadProductionHistoryManifest();
  const currentProductionHistoryManifest = loadCurrentProductionHistoryManifest();
  const manifestMap = new Map((manifest?.baseline_migrations || []).map((m) => [m.file, m.sha256]));

  console.log(`Found ${files.length} numbered migration files in migrations/.`);
  console.log(`Mode: ${mode}`);
  if (manifest) console.log(`Manifest: migration_manifest_001_027.json (${manifest.baseline_migrations.length} entries, revision ${manifest.revision || "unknown"}).`);
  else console.log("Manifest: not found (cannot prove approved hashes for all files).");

  // Fail closed if unapproved/new migration files are present for mutating modes.
  const nums = files.map((f) => ({ f, n: parseMigrationNumber(f) })).filter((x) => Number.isInteger(x.n));
  const has036Plus = nums.some((x) => x.n >= 36);
  const p1UatOnlyFiles = nums.filter((x) => x.n >= P1_UAT_ONLY_START);
  if (["apply", "baseline"].includes(mode) && p1UatOnlyFiles.length) {
    fail("P1 migrations are UAT-only; generic Production migration apply/baseline is prohibited for migrations 058+.");
  }
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
    for (const [file, expectedSha] of Object.entries(PREPARED_MIGRATION_PINS)) {
      if (!files.includes(file)) fail(`Required prepared migration file missing: ${file}`);
      const actualSha = sha256File(path.join(migrationsDir, file));
      if (actualSha !== expectedSha) fail(`Prepared migration checksum mismatch: ${file}`);
    }
    for (const file of files) {
      const fullPath = path.join(migrationsDir, file);
      const sha = sha256File(fullPath);
      const inManifest = manifestMap.has(file) ? "manifest=known" : "manifest=absent";
      console.log(`${file} sha256=${sha} ${inManifest}`);
    }
    if (has036Plus) console.log("DRY-RUN NOTE: 036-047 are pinned to the immutable Production baseline; 048-051 are reconciled from the verified Production history and Migration 052 is verified in canonical ledger 001-052. The generic runner never replays Migration 052.");
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

      const statusManifest = currentProductionHistoryManifest || productionHistoryManifest;
      if (statusManifest) {
        const expected = statusManifest.entries || [];
        let exactLedgerMatch = expected.length === applied.rows.length &&
          expected.every((entry, i) => {
            const actual = applied.rows[i];
            return actual &&
              Number(actual.id) === Number(entry.id) &&
              actual.filename === entry.filename &&
              actual.sha256 === entry.sha256 &&
              actual.status === entry.status;
          });
      // The committed 001-047 manifest remains the immutable baseline.
      // After the explicitly approved 048/049 pair is applied, verify its exact extension from local SQL.
      if (!exactLedgerMatch && expected.length === 47 && [49, 50, 51, 52].includes(applied.rows.length)) {
        const migration048 = files.find((file) => parseMigrationNumber(file) === 48);
        const migration049 = files.find((file) => parseMigrationNumber(file) === 49);
        const migration050 = files.find((file) => parseMigrationNumber(file) === 50);
        const migration051 = files.find((file) => parseMigrationNumber(file) === 51);
        const migration052 = files.find((file) => parseMigrationNumber(file) === 52);
        const prefixMatches = expected.every((entry, i) => {
          const actual = applied.rows[i];
          return actual && Number(actual.id) === Number(entry.id) &&
            actual.filename === entry.filename && actual.sha256 === entry.sha256 && actual.status === entry.status;
        });
        const extension048049Matches = migration048 && migration049 &&
          applied.rows[47]?.filename === migration048 &&
          applied.rows[47]?.sha256 === sha256File(path.join(migrationsDir, migration048)) &&
          applied.rows[47]?.status === "applied" &&
          applied.rows[48]?.filename === migration049 &&
          applied.rows[48]?.sha256 === sha256File(path.join(migrationsDir, migration049)) &&
          applied.rows[48]?.status === "applied";
        const extension050Matches = applied.rows.length === 49 ||
          (migration050 && applied.rows[49]?.filename === migration050 &&
            applied.rows[49]?.sha256 === sha256File(path.join(migrationsDir, migration050)) &&
            applied.rows[49]?.status === "applied");
        const extension051Matches = applied.rows.length < 51 ||
          (migration051 && applied.rows[50]?.filename === migration051 &&
            applied.rows[50]?.sha256 === sha256File(path.join(migrationsDir, migration051)) &&
            applied.rows[50]?.status === "applied");
        const extension052Matches = applied.rows.length < 52 ||
          (migration052 && applied.rows[51]?.filename === migration052 &&
            applied.rows[51]?.sha256 === sha256File(path.join(migrationsDir, migration052)) &&
            applied.rows[51]?.status === "applied");
        exactLedgerMatch = Boolean(prefixMatches && extension048049Matches && extension050Matches && extension051Matches && extension052Matches);
      }
        console.log(`Production history ledger: ${exactLedgerMatch ? "PASS" : "MISMATCH"} (expected=${expected.length}, actual=${applied.rows.length}).`);
        console.log("Historical authentic SQL source for migrations 029-035: NOT RECOVERED; apply is permitted only when the exact Production ledger 001-047 manifest is independently verified.");
      } else {
        console.log("Production history ledger manifest: NOT FOUND; full historical release verification unavailable.");
      }

      for (const file of files) {
        const row = appliedMap.get(file);
        if (!row) {
          const n = parseMigrationNumber(file);
          const sameSequence = applied.rows.find((r) => parseMigrationNumber(r.filename) === n);
          if (sameSequence && sameSequence.filename !== file) {
            console.log(`${file}: SOURCE_NAME_MISMATCH (Production history records ${sameSequence.filename}; local file is not accepted as its source).`);
          } else {
            console.log(`${file}: PENDING`);
          }
        } else if (row.sha256 !== sha256File(path.join(migrationsDir, file))) {
          console.log(`${file}: CHECKSUM_MISMATCH`);
        } else {
          console.log(`${file}: ${String(row.status).toUpperCase()}_VERIFIED`);
        }
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
      const approved037 = "037_restrict_security_definer_execute.sql";
      const approved037Sha = "c74f472812aca4e5eb6d7c2e9096b883ddfb232bc011f5096eec745e02b90b85";
      const approved038 = "038_admin_managed_neon_auth_user_lifecycle.sql";
      const approved038Sha = "37344eb4794c36cfd8c5b10e85a4f0ee947cd6bd0951bde8c6b8fb94f147c8d5";
      const approved039 = "039_project_scoped_contract_cob_cycles.sql";
      const approved039Sha = "2478220b8813c90ab0461ea4e810b663607b57cc43c6728b9cc82647104ea168";
      const approved040 = "040_finance_reporting_notifications.sql";
      const approved040Sha = "3dcba30a1592617e8747f144ed650de5d6af50112c8b105bec62681ddf1b485f";
      const approved041 = "041_finance_notification_rls_recipient_guard.sql";
      const approved041Sha = "96bf6ea57d68bc9913bc402cadeeb85beee6938a57b9acb9bd13c8d6c5ad2770";
      const approved042 = "042_inventory_reservation_release_reason.sql";
      const approved042Sha = "4894520de17e45b38a3d50db96e9aaa1c5fa5603186e13bab0ee0f32e3bb4996";
      const approved043 = "043_project_role_assignments_and_history.sql";
      const approved043Sha = "15e73e189b4b454582a6e2ce996eb13605bdb5157e9f3ea93837bd5c97f22086";
      const approved044 = "044_project_change_delete_permission.sql";
      const approved044Sha = "618726680810cce39225442cd3cb5d87cdc118136aba33c092091c756122b48d";
      const approved045 = "045_cash_advance_financial_audit.sql";
      const approved045Sha = "da80dc506ec81389232068fc84c810b62e7d85493aaa4b59f7870007c72c0261";
      const approved046 = "046_cash_advance_finance_role_guard.sql";
      const approved046Sha = "4697eebc8e2187a52143d5d1748d8e062c5b6bbee8a7b98fbf21da91135b7d31";
      const approved047 = "047_project_admin_finance_read_only.sql";
      const approved047Sha = "1ad12527d79db45d4f3a7bd3e6764268679709f2ebec9f2f3c1b902cbc767682";
      const approved048 = "048_buyer_accounting_ap_ar_document_hardening.sql";
      const approved048Sha = PREPARED_MIGRATION_PINS[approved048];
      const approved049 = "049_project_work_item_task_engine.sql";
      const approved049Sha = PREPARED_MIGRATION_PINS[approved049];
      const approved050 = "050_inventory_holds_legacy_schema_alignment.sql";
      const approved050Sha = PREPARED_MIGRATION_PINS[approved050];
      const approved051 = "051_task_notification_rls_helper.sql";
      const approved051Sha = PREPARED_MIGRATION_PINS[approved051];
      const approved052 = "052_funder_finance_report_scope_isolation.sql";
      const approved052Sha = PREPARED_MIGRATION_PINS[approved052];
      const newFiles = files.filter((f) => parseMigrationNumber(f) >= 36);

      const client = new pg.Client({ connectionString: databaseUrl, connectionTimeoutMillis: 15000, ssl: { rejectUnauthorized: true } });
      await client.connect();
      let lockHeld = false;
      try {
        const identity = await client.query("SELECT current_database() AS db, current_user AS usr, inet_server_port() AS port");
        const ident = identity.rows[0] || {};
        if (ident.db !== EXPECTED_DB || ident.usr === "app_runtime_secure" || ident.usr === "app_runtime" || Number(ident.port) !== EXPECTED_PORT) {
          fail("Migration apply target identity verification failed.");
        }
        await client.query("SELECT pg_advisory_lock(424242)");
        lockHeld = true;

        if (newFiles.length === 1 && newFiles[0] === approved036) {
          if (sha256File(path.join(migrationsDir, approved036)) !== approved036Sha) fail("036 checksum mismatch; refusing to apply.");
          const history = await client.query("SELECT id, filename, sha256, status FROM public.migration_history ORDER BY id");
          if (history.rows.length !== 35 || history.rows.some((r, i) => Number(r.id) !== i + 1)) {
            fail("036 requires an exact, contiguous migration_history 001-035; refusing.");
          }
          if (history.rows.some((r) => r.filename === approved036)) fail("036 already exists in migration_history; refusing re-apply.");
          const sql = fs.readFileSync(path.join(migrationsDir, approved036), "utf8");
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
            fail("036 apply failed and transaction rolled back: " + (error?.message || "unknown error"));
          }
          return;
        }

        const exact036to038 = newFiles.length === 3 && [approved036, approved037, approved038].every((f) => newFiles.includes(f));
        const exact036to039 = newFiles.length === 4 && [approved036, approved037, approved038, approved039].every((f) => newFiles.includes(f));
        const exact036to040 = newFiles.length === 5 && [approved036, approved037, approved038, approved039, approved040].every((f) => newFiles.includes(f));
        const exact036to041 = newFiles.length === 6 && [approved036, approved037, approved038, approved039, approved040, approved041].every((f) => newFiles.includes(f));
        const exact036to044 = newFiles.length === 9 && [approved036, approved037, approved038, approved039, approved040, approved041, approved042, approved043, approved044].every((f) => newFiles.includes(f));
        const exact036to045 = newFiles.length === 10 && [approved036, approved037, approved038, approved039, approved040, approved041, approved042, approved043, approved044, approved045].every((f) => newFiles.includes(f));
        const exact036to046 = newFiles.length === 11 && [approved036, approved037, approved038, approved039, approved040, approved041, approved042, approved043, approved044, approved045, approved046].every((f) => newFiles.includes(f));
        const exact036to047 = newFiles.length === 12 && [approved036, approved037, approved038, approved039, approved040, approved041, approved042, approved043, approved044, approved045, approved046, approved047].every((f) => newFiles.includes(f));
        const exact036to049 = newFiles.length === 14 && [approved036, approved037, approved038, approved039, approved040, approved041, approved042, approved043, approved044, approved045, approved046, approved047, approved048, approved049].every((f) => newFiles.includes(f));
        const exact036to050 = newFiles.length === 15 && [approved036, approved037, approved038, approved039, approved040, approved041, approved042, approved043, approved044, approved045, approved046, approved047, approved048, approved049, approved050].every((f) => newFiles.includes(f));
        const exact036to051 = newFiles.length === 16 && [approved036, approved037, approved038, approved039, approved040, approved041, approved042, approved043, approved044, approved045, approved046, approved047, approved048, approved049, approved050, approved051].every((f) => newFiles.includes(f));
        // Migration 052 is checksum-pinned and already applied through the dedicated release runner.
        // This generic runner intentionally does not replay or mutate Migration 052.
        const exact036to052 = newFiles.length === 17 && [approved036, approved037, approved038, approved039, approved040, approved041, approved042, approved043, approved044, approved045, approved046, approved047, approved048, approved049, approved050, approved051, approved052].every((f) => newFiles.includes(f));
        if (!exact036to038 && !exact036to039 && !exact036to040 && !exact036to041 && !exact036to044 && !exact036to045 && !exact036to046 && !exact036to047 && !exact036to049 && !exact036to050 && !exact036to051 && !(newFiles.length === 1 && newFiles[0] === approved036)) {
          fail("Apply is restricted to exact pinned migration sequences; 042-044 require separate exact owner approval and a verified 001-041 Production ledger.");
        }

        if (exact036to051) {
          if (sha256File(path.join(migrationsDir, approved050)) !== approved050Sha ||
              sha256File(path.join(migrationsDir, approved051)) !== approved051Sha) {
            fail("050/051 checksum mismatch; refusing P0 runtime compatibility verification.");
          }
          const manifest = productionHistoryManifest;
          if (!manifest || manifest.applied_count !== 47 || manifest.entries?.length !== 47 ||
              (manifest.pending_migrations || []).length !== 0 ||
              manifest.entries[46]?.filename !== approved047 || manifest.entries[46]?.sha256 !== approved047Sha ||
              manifest.entries[46]?.status !== "applied") {
            fail("050/051 verification requires the exact verified Production history manifest 001-047.");
          }
          const history = await client.query("SELECT id, filename, sha256, status FROM public.migration_history ORDER BY id");
          const prefixMatches = manifest.entries.every((expected, i) => {
            const actual = history.rows[i];
            return actual && Number(actual.id) === i + 1 && actual.filename === expected.filename &&
              actual.sha256 === expected.sha256 && actual.status === expected.status;
          });
          const extension048049 = history.rows[47]?.filename === approved048 &&
            history.rows[47]?.sha256 === approved048Sha && history.rows[47]?.status === "applied" &&
            history.rows[48]?.filename === approved049 &&
            history.rows[48]?.sha256 === approved049Sha && history.rows[48]?.status === "applied";
          const extension050 = history.rows[49]?.filename === approved050 &&
            history.rows[49]?.sha256 === approved050Sha && history.rows[49]?.status === "applied";
          if (!prefixMatches || !extension048049 || !extension050) fail("Production history prefix 001-050 is not exact; refusing 051 verification.");
          if (history.rows.length === 51 &&
              history.rows[50]?.filename === approved051 &&
              history.rows[50]?.sha256 === approved051Sha &&
              history.rows[50]?.status === "applied") {
            console.log("Migration 051 is already applied; exact 001-047 baseline and 048-051 extension rows verified. No SQL re-execution performed.");
            return;
          }
          if (history.rows.length !== 50) fail("Migration 051 verification requires exactly 50 prior Production ledger rows; partial or unexpected history is blocked.");
          fail("Migration 051 is prepared only. Apply requires separate owner approval of this exact SQL SHA-256.");
        }

        if (exact036to050) {
          if (sha256File(path.join(migrationsDir, approved050)) !== approved050Sha) fail("050 checksum mismatch; refusing inventory-holds schema alignment.");
          const manifest = productionHistoryManifest;
          if (!manifest || manifest.applied_count !== 47 || manifest.entries?.length !== 47 ||
              (manifest.pending_migrations || []).length !== 0 ||
              manifest.entries[46]?.filename !== approved047 || manifest.entries[46]?.sha256 !== approved047Sha ||
              manifest.entries[46]?.status !== "applied") {
            fail("050 verification requires the exact verified Production history manifest 001-047.");
          }
          const history = await client.query("SELECT id, filename, sha256, status FROM public.migration_history ORDER BY id");
          const prefixMatches = manifest.entries.every((expected, i) => {
            const actual = history.rows[i];
            return actual && Number(actual.id) === i + 1 && actual.filename === expected.filename &&
              actual.sha256 === expected.sha256 && actual.status === expected.status;
          });
          const extension048049 = history.rows[47]?.filename === approved048 &&
            history.rows[47]?.sha256 === approved048Sha && history.rows[47]?.status === "applied" &&
            history.rows[48]?.filename === approved049 &&
            history.rows[48]?.sha256 === approved049Sha && history.rows[48]?.status === "applied";
          if (!prefixMatches || !extension048049) fail("Production history prefix 001-049 is not exact; refusing 050 verification.");
          if (history.rows.length === 50 &&
              history.rows[49]?.filename === approved050 &&
              history.rows[49]?.sha256 === approved050Sha &&
              history.rows[49]?.status === "applied") {
            console.log("Migration 050 is already applied; exact 001-047 baseline and 048-050 extension rows verified. No SQL re-execution performed.");
            return;
          }
          if (history.rows.length !== 49) fail("Migration 050 verification requires exactly 49 prior Production ledger rows; partial or unexpected history is blocked.");
          fail("Migration 050 is prepared only. Apply requires separate owner approval of this exact SQL SHA-256 and the controlled Neon migration completion workflow.");
        }

        if (exact036to049) {
          const migration048Hash = sha256File(path.join(migrationsDir, approved048));
          const migration049Hash = sha256File(path.join(migrationsDir, approved049));
          if (migration048Hash !== approved048Sha || migration049Hash !== approved049Sha) {
            fail("048/049 checksum mismatch; refusing the task-engine migration sequence.");
          }
          // Re-verify every pinned 036-047 source before extending the Production ledger.
          for (const [file, sha] of [
            [approved036, approved036Sha], [approved037, approved037Sha], [approved038, approved038Sha],
            [approved039, approved039Sha], [approved040, approved040Sha], [approved041, approved041Sha],
            [approved042, approved042Sha], [approved043, approved043Sha], [approved044, approved044Sha],
            [approved045, approved045Sha], [approved046, approved046Sha], [approved047, approved047Sha],
          ]) {
            if (sha256File(path.join(migrationsDir, file)) !== sha) fail(file + " checksum mismatch; refusing 048/049.");
          }
          const manifest = productionHistoryManifest;
          if (!manifest || manifest.applied_count !== 47 || manifest.entries?.length !== 47 ||
              (manifest.pending_migrations || []).length !== 0 ||
              manifest.entries[46]?.filename !== approved047 || manifest.entries[46]?.sha256 !== approved047Sha ||
              manifest.entries[46]?.status !== "applied") {
            fail("048/049 require the exact verified Production history manifest 001-047.");
          }
          const history = await client.query("SELECT id, filename, sha256, status FROM public.migration_history ORDER BY id");
          const prefixMatches = history.rows.length >= 47 && manifest.entries.every((expected, i) => {
            const actual = history.rows[i];
            return actual && Number(actual.id) === i + 1 && Number(expected.id) === i + 1 &&
              actual.filename === expected.filename && actual.sha256 === expected.sha256 && actual.status === expected.status;
          });
          if (!prefixMatches) fail("Production migration_history does not exactly match the verified 001-047 manifest.");
          if (history.rows.length === 49 &&
              history.rows[47]?.filename === approved048 && history.rows[47]?.sha256 === approved048Sha && history.rows[47]?.status === "applied" &&
              history.rows[48]?.filename === approved049 && history.rows[48]?.sha256 === approved049Sha && history.rows[48]?.status === "applied") {
            console.log("Migrations 048/049 are already applied; exact 001-047 baseline and both extension rows verified. No SQL re-execution performed.");
            return;
          }
          if (history.rows.length !== 47) fail("048/049 require exactly 47 prior Production migration_history rows; partial or unexpected history is blocked.");
          if (process.env.MIGRATE_048_CONFIRM !== "1" || process.env.MIGRATION_048_APPROVED_SHA256 !== approved048Sha ||
              !process.env.MIGRATION_048_APPROVAL_REFERENCE?.trim()) {
            fail("Migration 048 requires MIGRATE_048_CONFIRM=1, its exact approved SHA-256 and an approval reference.");
          }
          if (process.env.MIGRATE_049_CONFIRM !== "1" || process.env.MIGRATION_049_APPROVED_SHA256 !== approved049Sha ||
              !process.env.MIGRATION_049_APPROVAL_REFERENCE?.trim()) {
            fail("Migration 049 requires MIGRATE_049_CONFIRM=1, its exact approved SHA-256 and an approval reference.");
          }
          if (!process.env.MIGRATION_BACKUP_REFERENCE?.trim() || !/^[a-f0-9]{64}$/i.test(process.env.MIGRATION_BACKUP_SHA256 || "")) {
            fail("048/049 require a completed Production backup reference and its 64-character SHA-256 before apply.");
          }
          await client.query("BEGIN");
          try {
            await client.query(fs.readFileSync(path.join(migrationsDir, approved048), "utf8"));
            await client.query(
              "INSERT INTO public.migration_history (filename, sha256, status) VALUES ($1, $2, 'applied')",
              [approved048, approved048Sha]
            );
            await client.query(fs.readFileSync(path.join(migrationsDir, approved049), "utf8"));
            await client.query(
              "INSERT INTO public.migration_history (filename, sha256, status) VALUES ($1, $2, 'applied')",
              [approved049, approved049Sha]
            );
            await client.query("COMMIT");
            console.log("Applied owner-approved Migrations 048 and 049 atomically; SQL and both ledger rows committed together.");
            console.log("Refresh migration_history_manifest_001_047.json to a new verified 001-049 manifest from the resulting ledger before the next release.");
          } catch (error) {
            await client.query("ROLLBACK");
            fail("048/049 apply failed; both migrations rolled back atomically: " + (error?.message || "unknown error"));
          }
          return;
        }

        if (exact036to047) {
          if (sha256File(path.join(migrationsDir, approved047)) !== approved047Sha) fail("047 checksum mismatch; refusing.");
          const manifest = productionHistoryManifest;
          if (!manifest || !Array.isArray(manifest.entries)) fail("Verified Production history manifest 001-046 is required for Migration 047.");
          const history = await client.query("SELECT id, filename, sha256, status FROM public.migration_history ORDER BY id");
          const appliedAlready = manifest.applied_count === 47 && manifest.entries.length === 47 &&
            (manifest.pending_migrations || []).length === 0 &&
            manifest.entries[46]?.id === 47 && manifest.entries[46]?.filename === approved047 &&
            manifest.entries[46]?.sha256 === approved047Sha && manifest.entries[46]?.status === "applied";
          if (appliedAlready) {
            if (history.rows.length !== 47) fail("Applied 047 verification requires exactly 47 Production history rows.");
            for (let i = 0; i < manifest.entries.length; i++) {
              const expected = manifest.entries[i], actual = history.rows[i];
              if (Number(actual.id) !== i + 1 || Number(expected.id) !== i + 1 ||
                  actual.filename !== expected.filename || actual.sha256 !== expected.sha256 ||
                  actual.status !== expected.status) fail("Production migration_history mismatch at sequence " + (i + 1) + ".");
            }
            console.log("Production Migration 047 is already applied and all 47 ledger rows are verified; no SQL re-execution performed.");
            return;
          }
          if (manifest.applied_count !== 46 || manifest.entries.length !== 46 ||
              (manifest.pending_migrations || []).length !== 1 ||
              !manifest.pending_migrations.some((m) =>
                (m.file === "migrations/" + approved047 || m.file === approved047) && m.sha256 === approved047Sha)) {
            fail("Migration 047 requires the exact 001-046 applied manifest and one exact pending 047 entry.");
          }
          if (history.rows.length !== 46) fail("Migration 047 requires exactly 46 prior Production history rows.");
          for (let i = 0; i < manifest.entries.length; i++) {
            const expected = manifest.entries[i], actual = history.rows[i];
            if (Number(actual.id) !== i + 1 || Number(expected.id) !== i + 1 ||
                actual.filename !== expected.filename || actual.sha256 !== expected.sha256 ||
                actual.status !== expected.status) fail("Production migration_history mismatch at sequence " + (i + 1) + ".");
          }
          if (process.env.MIGRATE_047_CONFIRM !== "1") fail("Migration 047 requires MIGRATE_047_CONFIRM=1 after explicit owner approval.");
          if (process.env.MIGRATION_047_APPROVED_SHA256 !== approved047Sha) fail("Migration 047 approved SHA-256 is absent or mismatched.");
          if (!process.env.MIGRATION_047_APPROVAL_REFERENCE || !process.env.MIGRATION_047_APPROVAL_REFERENCE.trim()) fail("Migration 047 requires an explicit owner approval reference.");
          if (history.rows.some((row) => row.filename === approved047)) fail("Migration 047 already exists in Production migration_history; refusing replay.");
          await client.query("BEGIN");
          try {
            const sql = fs.readFileSync(path.join(migrationsDir, approved047), "utf8");
            await client.query(sql);
            await client.query(
              "INSERT INTO public.migration_history (filename, sha256, status) VALUES ($1, $2, 'applied')",
              [approved047, approved047Sha]
            );
            await client.query("COMMIT");
            console.log("Applied owner-approved Migration 047; SQL and ledger row committed atomically.");
          } catch (error) {
            await client.query("ROLLBACK");
            fail("Migration 047 apply failed and transaction rolled back: " + (error?.message || "unknown error"));
          }
          return;
        }

        if (exact036to046) {
          const appliedManifest = productionHistoryManifest;
          if (!appliedManifest || appliedManifest.applied_count !== 46 ||
              appliedManifest.entries?.length !== 46 ||
              (appliedManifest.pending_migrations || []).length !== 0) {
            fail("Applied Migration 046 requires the verified exact Production history manifest 001-046.");
          }
          for (const [file, sha] of [
            [approved042, approved042Sha], [approved043, approved043Sha],
            [approved044, approved044Sha], [approved045, approved045Sha],
            [approved046, approved046Sha],
          ]) {
            if (sha256File(path.join(migrationsDir, file)) !== sha) fail(file + " checksum mismatch against applied Production history; refusing.");
          }
          const history046 = await client.query("SELECT id, filename, sha256, status FROM public.migration_history ORDER BY id");
          if (history046.rows.length !== 46) fail("Applied 046 verification requires exactly 46 Production history rows.");
          for (let i = 0; i < appliedManifest.entries.length; i++) {
            const expected = appliedManifest.entries[i], actual = history046.rows[i];
            if (Number(actual.id) !== i + 1 || Number(expected.id) !== i + 1 ||
                actual.filename !== expected.filename || actual.sha256 !== expected.sha256 ||
                actual.status !== expected.status) {
              fail("Production migration_history mismatch at sequence " + (i + 1) + "; refusing to accept Migration 046.");
            }
          }
          const finalEntry = appliedManifest.entries[45];
          if (finalEntry?.id !== 46 || finalEntry.filename !== approved046 ||
              finalEntry.sha256 !== approved046Sha || finalEntry.status !== "applied" ||
              finalEntry.source_sha_verified !== true) {
            fail("Applied Migration 046 manifest entry mismatch.");
          }
          console.log("Production Migration 046 is already applied and all 46 ledger rows are verified; no SQL re-execution performed.");
          return;
        }

        if (exact036to045) {
          const appliedManifest = productionHistoryManifest;
          if (!appliedManifest || appliedManifest.applied_count !== 45 ||
              appliedManifest.entries?.length !== 45 ||
              (appliedManifest.pending_migrations || []).length !== 0) {
            fail("Applied Migration 045 requires the verified exact Production history manifest 001-045.");
          }
          for (const [file, sha] of [
            [approved042, approved042Sha], [approved043, approved043Sha],
            [approved044, approved044Sha], [approved045, approved045Sha],
          ]) {
            if (sha256File(path.join(migrationsDir, file)) !== sha) fail(file + " checksum mismatch against applied Production history; refusing.");
          }
          const history045 = await client.query("SELECT id, filename, sha256, status FROM public.migration_history ORDER BY id");
          if (history045.rows.length !== 45) fail("Applied 045 verification requires exactly 45 Production history rows.");
          for (let i = 0; i < appliedManifest.entries.length; i++) {
            const expected = appliedManifest.entries[i], actual = history045.rows[i];
            if (Number(actual.id) !== i + 1 || Number(expected.id) !== i + 1 ||
                actual.filename !== expected.filename || actual.sha256 !== expected.sha256 ||
                actual.status !== expected.status) {
              fail("Production migration_history mismatch at sequence " + (i + 1) + "; refusing to accept Migration 045.");
            }
          }
          const finalEntry = appliedManifest.entries[44];
          if (finalEntry?.id !== 45 || finalEntry.filename !== approved045 ||
              finalEntry.sha256 !== approved045Sha || finalEntry.status !== "applied" ||
              finalEntry.source_sha_verified !== true) {
            fail("Applied Migration 045 manifest entry mismatch.");
          }
          console.log("Production Migration 045 is already applied and all 45 ledger rows are verified; no SQL re-execution performed.");
          return;
        }

        if (exact036to044) {
          const alreadyAppliedManifest = productionHistoryManifest;
          if (alreadyAppliedManifest?.applied_count === 44 &&
              alreadyAppliedManifest.entries?.length === 44 &&
              (alreadyAppliedManifest.pending_migrations || []).length === 0) {
            for (const [file, sha] of [[approved042, approved042Sha], [approved043, approved043Sha], [approved044, approved044Sha]]) {
              if (sha256File(path.join(migrationsDir, file)) !== sha) fail(file + " checksum mismatch against applied Production history; refusing.");
            }
            const appliedHistory = await client.query("SELECT id, filename, sha256, status FROM public.migration_history ORDER BY id");
            if (appliedHistory.rows.length !== 44) fail("Applied 042-044 verification requires exactly 44 Production history rows.");
            for (let i = 0; i < alreadyAppliedManifest.entries.length; i++) {
              const expected = alreadyAppliedManifest.entries[i], actual = appliedHistory.rows[i];
              if (Number(actual.id) !== i + 1 || Number(expected.id) !== i + 1 ||
                  actual.filename !== expected.filename || actual.sha256 !== expected.sha256 ||
                  actual.status !== expected.status) {
                fail("Production migration_history mismatch at sequence " + (i + 1) + "; refusing to treat 042-044 as complete.");
              }
            }
            for (const [index, file, sha] of [
              [41, approved042, approved042Sha],
              [42, approved043, approved043Sha],
              [43, approved044, approved044Sha],
            ]) {
              const row = alreadyAppliedManifest.entries[index];
              if (row?.filename !== file || row?.sha256 !== sha || row?.status !== "applied" || row?.source_sha_verified !== true) {
                fail("Applied migration manifest entry mismatch for " + file + ".");
              }
            }
            console.log("Production migrations 042-044 are already applied and all 44 ledger rows are verified; no SQL re-execution performed.");
            return;
          }

          const expectedNew = [
            [approved042, approved042Sha, "MIGRATE_042_CONFIRM", "MIGRATION_042_APPROVED_SHA256", "MIGRATION_042_APPROVAL_REFERENCE"],
            [approved043, approved043Sha, "MIGRATE_043_CONFIRM", "MIGRATION_043_APPROVED_SHA256", "MIGRATION_043_APPROVAL_REFERENCE"],
            [approved044, approved044Sha, "MIGRATE_044_CONFIRM", "MIGRATION_044_APPROVED_SHA256", "MIGRATION_044_APPROVAL_REFERENCE"],
          ];
          for (const [file, sha] of [[approved042, approved042Sha], [approved043, approved043Sha], [approved044, approved044Sha]]) {
            if (sha256File(path.join(migrationsDir, file)) !== sha) fail(file + " checksum mismatch; refusing.");
          }

          const verifiedManifest = productionHistoryManifest;
          if (!verifiedManifest || verifiedManifest.applied_count !== 41 ||
              verifiedManifest.entries?.length !== 41 ||
              verifiedManifest.entries[40]?.id !== 41 ||
              verifiedManifest.entries[40]?.filename !== approved041 ||
              verifiedManifest.entries[40]?.sha256 !== approved041Sha ||
              verifiedManifest.entries[40]?.status !== "applied") {
            fail("Verified Production migration manifest 001-041 is required before 042-044.");
          }
          for (const [file, sha, confirmEnv, hashEnv, referenceEnv] of expectedNew) {
            const pending = verifiedManifest.pending_migrations?.find((m) =>
              (m.file === "migrations/" + file || m.file === file) && m.sha256 === sha
            );
            if (!pending) fail("Exact pending manifest entry is missing for " + file + ".");
            if (process.env[confirmEnv] !== "1") fail(file + " requires " + confirmEnv + "=1 after explicit owner approval.");
            if (process.env[hashEnv] !== sha) fail(file + " approved SHA-256 is absent or mismatched.");
            if (!process.env[referenceEnv] || !process.env[referenceEnv].trim()) fail(file + " requires an explicit owner approval reference.");
          }

          const history = await client.query("SELECT id, filename, sha256, status FROM public.migration_history ORDER BY id");
          if (history.rows.length !== 41) fail("Migration 042-044 requires exactly 41 prior Production history rows.");
          for (let i = 0; i < verifiedManifest.entries.length; i++) {
            const expected = verifiedManifest.entries[i], actual = history.rows[i];
            if (Number(actual.id) !== i + 1 || actual.filename !== expected.filename ||
                actual.sha256 !== expected.sha256 || actual.status !== expected.status) {
              fail("Production migration_history mismatch at sequence " + (i + 1) + "; refusing 042-044.");
            }
          }

          for (const [file] of [[approved042], [approved043], [approved044]]) {
            const existing = await client.query("SELECT filename FROM public.migration_history WHERE filename = $1", [file]);
            if (existing.rows.length > 0) fail(file + " already exists in Production migration_history; refusing replay.");
          }
          await client.query("BEGIN");
          try {
            for (const [file, sha] of [[approved042, approved042Sha], [approved043, approved043Sha], [approved044, approved044Sha]]) {
              const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
              await client.query(sql);
              await client.query(
                "INSERT INTO public.migration_history (filename, sha256, status) VALUES ($1, $2, 'applied')",
                [file, sha]
              );
              console.log("Applied in transaction: " + file);
            }
            await client.query("COMMIT");
            console.log("Migrations 042-044 and all ledger rows committed atomically as one approved package.");
          } catch (error) {
            await client.query("ROLLBACK");
            fail("Migration package 042-044 failed and the entire transaction was rolled back: " + (error?.message || "unknown error"));
          }
          return;
        }

        if (newFiles.length === 4 && newFiles.includes(approved039) &&
            newFiles.includes(approved036) && newFiles.includes(approved037) && newFiles.includes(approved038)) {
          if (sha256File(path.join(migrationsDir, approved039)) !== approved039Sha) fail("039 checksum mismatch; refusing.");
          const verifiedManifest = productionHistoryManifest;
          if (!verifiedManifest || verifiedManifest.applied_count !== 39 ||
              verifiedManifest.entries?.length !== 39 ||
              verifiedManifest.entries[37]?.filename !== approved038 ||
              verifiedManifest.entries[37]?.sha256 !== approved038Sha ||
              verifiedManifest.entries[38]?.filename !== approved039 ||
              verifiedManifest.entries[38]?.sha256 !== approved039Sha) {
            fail("Verified Production migration manifest 001-039 missing or inconsistent.");
          }
          const history039 = await client.query("SELECT id, filename, sha256, status FROM public.migration_history ORDER BY id");
          if (history039.rows.length !== 39) fail("Production migration history is not exactly 39 rows.");
          for (let i = 0; i < verifiedManifest.entries.length; i++) {
            const expected = verifiedManifest.entries[i], actual = history039.rows[i];
            if (Number(actual.id) !== i + 1 || actual.filename !== expected.filename ||
                actual.sha256 !== expected.sha256 || actual.status !== expected.status) {
              fail("Production migration_history mismatch at sequence " + (i + 1) + ".");
            }
          }
          if (history039.rows[38].filename !== approved039 ||
              history039.rows[38].sha256 !== approved039Sha ||
              sha256File(path.join(migrationsDir, approved039)) !== approved039Sha) {
            fail("Production Migration 039 is not byte-for-byte verified; refusing.");
          }
          console.log("Production Migration 039 is already applied and ledger-verified; no SQL re-execution performed.");
          return;
        }

        if (newFiles.length === 5 && newFiles.includes(approved040)) {
          if (sha256File(path.join(migrationsDir, approved040)) !== approved040Sha) fail("040 checksum mismatch; refusing.");
          const verifiedManifest = productionHistoryManifest;
          if (!verifiedManifest || verifiedManifest.applied_count !== 40 ||
              verifiedManifest.entries?.length !== 40 ||
              verifiedManifest.entries[37]?.filename !== approved038 ||
              verifiedManifest.entries[37]?.sha256 !== approved038Sha ||
              verifiedManifest.entries[38]?.filename !== approved039 ||
              verifiedManifest.entries[38]?.sha256 !== approved039Sha ||
              verifiedManifest.entries[39]?.filename !== approved040 ||
              verifiedManifest.entries[39]?.sha256 !== approved040Sha) {
            fail("Verified Production migration manifest 001-040 missing or inconsistent.");
          }
          const history040 = await client.query("SELECT id, filename, sha256, status FROM public.migration_history ORDER BY id");
          if (history040.rows.length !== 40) fail("Production migration history is not exactly 40 rows.");
          for (let i = 0; i < verifiedManifest.entries.length; i++) {
            const expected = verifiedManifest.entries[i], actual = history040.rows[i];
            if (Number(actual.id) !== i + 1 || actual.filename !== expected.filename ||
                actual.sha256 !== expected.sha256 || actual.status !== expected.status) {
              fail("Production migration_history mismatch at sequence " + (i + 1) + ".");
            }
          }
          if (history040.rows[39].filename !== approved040 ||
              history040.rows[39].sha256 !== approved040Sha ||
              sha256File(path.join(migrationsDir, approved040)) !== approved040Sha) {
            fail("Production Migration 040 is not byte-for-byte verified; refusing.");
          }
          console.log("Production Migration 040 is already applied and ledger-verified; no SQL re-execution performed.");
          return;
        }

        if (newFiles.length === 6 && newFiles.includes(approved041)) {
          if (sha256File(path.join(migrationsDir, approved041)) !== approved041Sha) fail("041 checksum mismatch; refusing.");
          const verifiedManifest = productionHistoryManifest;
          const pending041 = verifiedManifest?.pending_migrations?.find((m) => m.file === "migrations/" + approved041 && m.sha256 === approved041Sha);
          if (!verifiedManifest || verifiedManifest.applied_count !== 40 ||
              verifiedManifest.entries?.length !== 40 ||
              verifiedManifest.entries[39]?.filename !== approved040 ||
              verifiedManifest.entries[39]?.sha256 !== approved040Sha ||
              !pending041) {
            fail("Verified Production history 001-040 and exact pending Migration 041 entry are required.");
          }
          const history041 = await client.query("SELECT id, filename, sha256, status FROM public.migration_history ORDER BY id");
          if (history041.rows.length !== 40) fail("Migration 041 requires exactly 40 prior Production history rows.");
          for (let i = 0; i < verifiedManifest.entries.length; i++) {
            const expected = verifiedManifest.entries[i], actual = history041.rows[i];
            if (Number(actual.id) !== i + 1 || actual.filename !== expected.filename ||
                actual.sha256 !== expected.sha256 || actual.status !== expected.status) {
              fail("Production migration_history mismatch at sequence " + (i + 1) + ".");
            }
          }
          if (process.env.MIGRATE_041_CONFIRM !== "1") fail("Migration 041 requires MIGRATE_041_CONFIRM=1 after separate owner approval.");
          if (process.env.MIGRATION_041_APPROVED_SHA256 !== approved041Sha) fail("Migration 041 approval SHA-256 is absent or does not match the exact reviewed SQL.");
          if (!process.env.MIGRATION_041_APPROVAL_REFERENCE || !process.env.MIGRATION_041_APPROVAL_REFERENCE.trim()) {
            fail("Migration 041 requires MIGRATION_041_APPROVAL_REFERENCE identifying the owner's explicit approval.");
          }
          const sql = fs.readFileSync(path.join(migrationsDir, approved041), "utf8");
          await client.query("BEGIN");
          try {
            await client.query(sql);
            await client.query(
              "INSERT INTO public.migration_history (filename, sha256, status) VALUES ($1, $2, 'applied')",
              [approved041, approved041Sha]
            );
            await client.query("COMMIT");
            console.log("Applied explicitly owner-approved Migration 041; SQL and history row committed atomically.");
          } catch (error) {
            await client.query("ROLLBACK");
            fail("041 apply failed and transaction rolled back: " + (error?.message || "unknown error"));
          }
          return;
        }

        if (process.env.MIGRATE_038_CONFIRM !== "1") {
          fail("Migration 038 requires MIGRATE_038_CONFIRM=1 after separate owner approval.");
        }
        if (process.env.MIGRATION_038_APPROVED_SHA256 !== approved038Sha) {
          fail("Migration 038 approval SHA-256 is absent or does not match the exact reviewed SQL.");
        }
        if (!process.env.MIGRATION_038_APPROVAL_REFERENCE || !process.env.MIGRATION_038_APPROVAL_REFERENCE.trim()) {
          fail("Migration 038 requires MIGRATION_038_APPROVAL_REFERENCE identifying the owner's explicit approval.");
        }
        if (newFiles.some((f) => {
          const expected = f === approved036 ? approved036Sha : f === approved037 ? approved037Sha : approved038Sha;
          return sha256File(path.join(migrationsDir, f)) !== expected;
        })) {
          fail("One or more 036-038 SQL files do not match their pinned SHA-256 values.");
        }

        const releaseManifest = productionHistoryManifest;
        if (
          !releaseManifest ||
          releaseManifest.purpose !== "verified_production_history_only_not_sql_source" ||
          releaseManifest.applied_count !== 38 ||
          !Array.isArray(releaseManifest.entries) ||
          releaseManifest.entries.length !== 38 ||
          !Array.isArray(releaseManifest.pending_migrations) ||
          releaseManifest.entries[37]?.filename !== approved038 || releaseManifest.entries[37]?.sha256 !== approved038Sha || releaseManifest.entries[37]?.status !== "applied"
        ) {
          fail("Verified Production history manifest 001-038 is missing, malformed, or does not record applied migration 038.");
        }

        const history = await client.query("SELECT id, filename, sha256, status FROM public.migration_history ORDER BY id");
        if (history.rows.length !== 38) {
          fail("Migration 038 replay requires 37 history rows; Production already has 38, so refusing re-apply.");
        }
        for (let i = 0; i < releaseManifest.entries.length; i++) {
          const expected = releaseManifest.entries[i];
          const actual = history.rows[i];
          if (
            Number(actual.id) !== i + 1 ||
            Number(expected.id) !== i + 1 ||
            actual.filename !== expected.filename ||
            actual.sha256 !== expected.sha256 ||
            actual.status !== expected.status
          ) {
            fail("Production migration_history differs from the verified 001-038 release manifest at sequence " + (i + 1) + "; refusing.");
          }
        }
        if (history.rows.some((r) => r.filename === approved038)) {
          fail("Migration 038 already exists in Production history; refusing re-apply.");
        }

        const sql = fs.readFileSync(path.join(migrationsDir, approved038), "utf8");
        await client.query("BEGIN");
        try {
          await client.query(sql);
          await client.query(
            "INSERT INTO public.migration_history (filename, sha256, status) VALUES ($1, $2, 'applied')",
            [approved038, approved038Sha]
          );
          await client.query("COMMIT");
          console.log("Applied explicitly owner-approved migration 038; approval reference: " + process.env.MIGRATION_038_APPROVAL_REFERENCE);
        } catch (error) {
          await client.query("ROLLBACK");
          fail("038 apply failed and transaction rolled back: " + (error?.message || "unknown error"));
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

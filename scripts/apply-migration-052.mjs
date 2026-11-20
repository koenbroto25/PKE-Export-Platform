import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import pg from "pg";
import dotenv from "dotenv";

dotenv.config();
dotenv.config({ path: ".env.migrate", override: false });

const ROOT = process.cwd();
const FILE = "052_funder_finance_report_scope_isolation.sql";
const EXPECTED_SHA = "cc8d34c12d34eab9c4cc9aeabd46d9da59b1ec7ef0c7c89345d4b49455a6ac0b";
const EXPECTED_HOST = "ep-odd-resonance-b3zb42fw.c-4.ap-southeast-1.aws.neon.tech";
const EXPECTED_DB = "neondb";
const PROJECT_ID = "purple-base-63944903";
const PRODUCTION_BRANCH_ID = "br-damp-shape-b3xlh4nr";
const BACKUP_BRANCH_ID = "br-snowy-credit-b336z950";

function stop(message) {
  console.error("BLOCKED: " + message);
  process.exit(1);
}
function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}
function readJson(file) {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf8")); }
  catch (error) { stop("Cannot read/parse " + file + ": " + (error?.message || error)); }
}
function exactRow(actual, expected, index) {
  return actual && Number(actual.id) === index + 1 &&
    Number(expected.id) === index + 1 &&
    actual.filename === expected.filename &&
    actual.sha256 === expected.sha256 &&
    actual.status === expected.status;
}

async function main() {
  if (process.argv[2] !== "apply") stop("Usage: node scripts/apply-migration-052.mjs apply");
  if (process.env.MIGRATE_CONFIRM !== "1" || process.env.MIGRATE_052_CONFIRM !== "1") {
    stop("Both MIGRATE_CONFIRM=1 and MIGRATE_052_CONFIRM=1 are required.");
  }

  const sqlPath = path.join(ROOT, "migrations", FILE);
  if (!fs.existsSync(sqlPath)) stop("Migration source is missing: " + FILE);
  const sqlBytes = fs.readFileSync(sqlPath);
  const actualSha = sha256(sqlBytes);
  if (actualSha !== EXPECTED_SHA) stop("Migration 052 source SHA-256 mismatch.");

  if (process.env.MIGRATION_052_APPROVED_SHA256 !== EXPECTED_SHA) {
    stop("Exact Migration 052 owner-approved SHA-256 is absent or mismatched.");
  }
  if (!process.env.MIGRATION_052_APPROVAL_REFERENCE?.trim()) {
    stop("A non-empty Migration 052 approval reference is required.");
  }

  const manifest = readJson("migration_history_manifest_001_051.json");
  if (manifest.project_id !== PROJECT_ID || manifest.branch_id !== PRODUCTION_BRANCH_ID ||
      manifest.database !== EXPECTED_DB || manifest.applied_count !== 51 ||
      !Array.isArray(manifest.entries) || manifest.entries.length !== 51) {
    stop("The verified Production ledger manifest must identify this exact Production target and contain 51 entries.");
  }
  if (!Array.isArray(manifest.pending_migrations) || manifest.pending_migrations.length !== 1 ||
      manifest.pending_migrations[0]?.id !== 52 || manifest.pending_migrations[0]?.sha256 !== EXPECTED_SHA) {
    stop("The 001-051 manifest must list only the exact Migration 052 as pending.");
  }
  if (manifest.entries.some((entry, i) => Number(entry.id) !== i + 1) ||
      manifest.entries[50]?.filename !== "051_task_notification_recipient_rls_helper.sql" ||
      manifest.entries[50]?.sha256 !== "acda688d928ef06e2a8a069953976d0fa57f8fa7a5a0d988534d7da189d8a927" ||
      manifest.entries[50]?.status !== "applied") {
    stop("The 001-051 Production manifest is not contiguous or its Migration 051 tail is invalid.");
  }

  const backup = readJson("docs/audits/NEON_PRE_052_BACKUP_MANIFEST_20261120.json");
  const backupBytes = fs.readFileSync(path.join(ROOT, "docs/audits/NEON_PRE_052_BACKUP_MANIFEST_20261120.json"));
  const backupSha = sha256(backupBytes);
  if (backup.project_id !== PROJECT_ID || backup.production_branch_id !== PRODUCTION_BRANCH_ID ||
      backup.backup_branch_id !== BACKUP_BRANCH_ID || backup.backup_branch_state !== "ready" ||
      backup.migration_052_applied !== false) {
    stop("The recorded pre-052 backup does not match the approved Production/backup branches.");
  }
  if (JSON.stringify(backup.production_counts) !== JSON.stringify(backup.backup_counts) ||
      backup.production_counts?.migration_ledger_rows !== 51) {
    stop("Backup parity evidence is incomplete or mismatched.");
  }
  if (process.env.MIGRATION_BACKUP_REFERENCE !== BACKUP_BRANCH_ID) {
    stop("MIGRATION_BACKUP_REFERENCE must equal the verified fresh backup branch ID.");
  }
  if (process.env.MIGRATION_BACKUP_SHA256 !== backupSha) {
    stop("MIGRATION_BACKUP_SHA256 must equal the SHA-256 of the committed backup evidence manifest.");
  }

  const rawUrl = process.env.MIGRATION_DATABASE_URL;
  if (!rawUrl) stop("MIGRATION_DATABASE_URL is not set.");
  let target;
  try { target = new URL(rawUrl); } catch { stop("MIGRATION_DATABASE_URL is invalid."); }
  const username = decodeURIComponent(target.username || "");
  if (!["postgres:", "postgresql:"].includes(target.protocol) ||
      target.hostname !== EXPECTED_HOST || Number(target.port || 5432) !== 5432 ||
      target.pathname.replace(/^\//, "") !== EXPECTED_DB ||
      !["require", "verify-ca", "verify-full"].includes(target.searchParams.get("sslmode")) ||
      !username || ["app_runtime", "app_runtime_secure"].includes(username)) {
    stop("Database URL is not the exact Neon Production maintenance target (TLS, host, database, port and non-runtime role required).");
  }

  const client = new pg.Client({
    connectionString: rawUrl,
    connectionTimeoutMillis: 15000,
    ssl: { rejectUnauthorized: true },
  });
  await client.connect();
  let lockHeld = false;
  try {
    const identity = await client.query(
      "SELECT current_database() AS db, current_user AS usr, inet_server_port() AS port"
    );
    const ident = identity.rows[0] || {};
    if (ident.db !== EXPECTED_DB || ident.usr !== username ||
        ["app_runtime", "app_runtime_secure"].includes(ident.usr) || Number(ident.port) !== 5432) {
      stop("Connected database identity does not match the approved Production maintenance target.");
    }

    await client.query("SELECT pg_advisory_lock(424252)");
    lockHeld = true;

    const history = await client.query(
      "SELECT id, filename, sha256, status FROM public.migration_history ORDER BY id"
    );
    if (history.rows.length !== 51) stop("Production must contain exactly 51 migration ledger rows before Migration 052.");
    for (let i = 0; i < 51; i++) {
      if (!exactRow(history.rows[i], manifest.entries[i], i)) {
        stop("Production migration_history mismatch at sequence " + (i + 1) + ".");
      }
    }
    if (history.rows.some((row) => row.filename === FILE || Number(row.id) >= 52)) {
      stop("Migration 052 or an unexpected later migration already exists; refusing replay/out-of-order apply.");
    }

    const wrapper = sqlBytes.toString("utf8");
    if (!/^\s*--[^\n]*\n(?:--[^\n]*\n)*\s*BEGIN\s*;/i.test(wrapper) ||
        !/COMMIT\s*;\s*$/.test(wrapper)) {
      stop("Migration 052 must retain its explicit outer BEGIN/COMMIT wrapper.");
    }
    const body = wrapper
      .replace(/^\s*(?:--[^\n]*\n)*\s*BEGIN\s*;/i, "")
      .replace(/COMMIT\s*;\s*$/, "");
    if (/\b(?:BEGIN|COMMIT|ROLLBACK)\s*;/i.test(body)) {
      stop("Unexpected transaction control found inside Migration 052 body.");
    }

    await client.query("BEGIN");
    try {
      await client.query(body);
      await client.query(
        "INSERT INTO public.migration_history (filename, sha256, status) VALUES ($1, $2, 'applied')",
        [FILE, EXPECTED_SHA]
      );

      const grantAudit = await client.query(`
        SELECT COUNT(*)::int AS count
          FROM public.project_roles pr
          JOIN public.project_role_permissions prp
            ON prp.project_role_id = pr.id AND prp.project_id = pr.project_id
          JOIN public.permissions perm ON perm.id = prp.permission_id
         WHERE pr.role_code = 'funder'
           AND (
             perm.code LIKE 'finance.%' OR perm.code LIKE 'accounting.%' OR
             perm.code LIKE 'reports.%' OR perm.code LIKE 'payment.%' OR
             perm.code IN ('report.view', 'view_financial', 'view_rab')
           )
      `);
      if (Number(grantAudit.rows[0]?.count) !== 0) {
        throw new Error("Funder generic Finance/Accounting/Reports/Payment grants remain after migration.");
      }

      const funder = await client.query(`
        SELECT a.user_id, a.project_id, a.project_role_id
          FROM public.project_role_assignments a
          JOIN public.project_roles pr ON pr.id = a.project_role_id AND pr.project_id = a.project_id
          JOIN public.project_members pm ON pm.id = a.project_member_id AND pm.project_id = a.project_id
         WHERE pr.role_code = 'funder' AND a.is_active = true AND a.revoked_at IS NULL
           AND (a.expires_at IS NULL OR a.expires_at > now())
           AND pm.is_active = true AND pm.deactivated_at IS NULL
           AND (pm.expires_at IS NULL OR pm.expires_at > now())
         ORDER BY a.project_id LIMIT 1
      `);
      if (!funder.rows[0]?.user_id) throw new Error("No active Funder assignment available for post-migration denial backtest.");
      await client.query("SELECT set_config('app.current_user_id', $1, true)", [funder.rows[0].user_id]);
      const probePermissions = await client.query(
        "SELECT id, code FROM public.permissions WHERE code IN ('finance.view', 'reports.view') AND is_active = true ORDER BY code"
      );
      if (probePermissions.rows.length !== 2) {
        throw new Error("Required finance.view and reports.view permission catalog entries are missing for the Funder backtest.");
      }
      for (const permission of probePermissions.rows) {
        await client.query(
          "INSERT INTO public.project_role_permissions (project_id, project_role_id, permission_id) VALUES ($1, $2, $3)",
          [funder.rows[0].project_id, funder.rows[0].project_role_id, permission.id]
        );
      }
      const denied = await client.query(`
        SELECT
          public.pke_has_project_permission($1, 'finance.view') AS finance_view,
          public.pke_has_project_permission($1, 'reports.view') AS reports_view
      `, [funder.rows[0].project_id]);
      if (denied.rows[0]?.finance_view !== false || denied.rows[0]?.reports_view !== false) {
        throw new Error("Funder permission helper did not deny generic Finance/Reports access when legacy grants were temporarily reintroduced.");
      }
      await client.query(
        "DELETE FROM public.project_role_permissions WHERE project_id = $1 AND project_role_id = $2 AND permission_id = ANY($3::uuid[])",
        [funder.rows[0].project_id, funder.rows[0].project_role_id, probePermissions.rows.map((row) => row.id)]
      );

      const ledger = await client.query(
        "SELECT id, filename, sha256, status FROM public.migration_history ORDER BY id"
      );
      if (ledger.rows.length !== 52 || Number(ledger.rows[51]?.id) !== 52 ||
          ledger.rows[51]?.filename !== FILE || ledger.rows[51]?.sha256 !== EXPECTED_SHA ||
          ledger.rows[51]?.status !== "applied") {
        throw new Error("Migration 052 ledger postcondition failed.");
      }
      await client.query("COMMIT");
      console.log("PASS: Migration 052 and ledger row 52 committed atomically.");
      console.log("PASS: Funder generic Finance/Accounting/Reports/Payment grants = 0.");
      console.log("PASS: active Funder backtest denies finance.view and reports.view.");
      console.log("PASS: Production migration_history is contiguous through 052.");
    } catch (error) {
      await client.query("ROLLBACK");
      stop("Migration 052 and post-apply checks failed; transaction rolled back: " + (error?.message || "unknown error"));
    }
  } finally {
    if (lockHeld) await client.query("SELECT pg_advisory_unlock(424252)").catch(() => {});
    await client.end();
  }
}

main().catch((error) => {
  console.error("BLOCKED: " + (error?.message || "unknown error"));
  process.exit(1);
});

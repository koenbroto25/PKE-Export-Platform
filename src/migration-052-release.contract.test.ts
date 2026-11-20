import { describe, expect, it } from "vitest";
import fs from "node:fs";
import crypto from "node:crypto";

const migration = fs.readFileSync("migrations/052_funder_finance_report_scope_isolation.sql");
const runner = fs.readFileSync("scripts/apply-migration-052.mjs", "utf8");
const manifest = JSON.parse(fs.readFileSync("migration_history_manifest_001_051.json", "utf8"));
const appliedManifest = JSON.parse(fs.readFileSync("migration_history_manifest_001_052.json", "utf8"));
const backup = JSON.parse(fs.readFileSync("docs/audits/NEON_PRE_052_BACKUP_MANIFEST_20261120.json", "utf8"));
const sha = crypto.createHash("sha256").update(migration).digest("hex");

describe("Migration 052 release safety contract", () => {
  it("pins the exact approved migration source", () => {
    expect(sha).toBe("cc8d34c12d34eab9c4cc9aeabd46d9da59b1ec7ef0c7c89345d4b49455a6ac0b");
    expect(runner).toContain(sha);
  });

  it("requires independent exact owner approval and backup evidence", () => {
    for (const token of [
      "MIGRATE_CONFIRM", "MIGRATE_052_CONFIRM", "MIGRATION_052_APPROVED_SHA256",
      "MIGRATION_052_APPROVAL_REFERENCE", "MIGRATION_BACKUP_REFERENCE",
      "MIGRATION_BACKUP_SHA256", "NEON_PRE_052_BACKUP_MANIFEST_20261120.json",
    ]) expect(runner).toContain(token);
  });

  it("binds release to the exact 001-051 Production ledger", () => {
    expect(manifest.project_id).toBe("purple-base-63944903");
    expect(manifest.branch_id).toBe("br-damp-shape-b3xlh4nr");
    expect(manifest.database).toBe("neondb");
    expect(manifest.applied_count).toBe(51);
    expect(manifest.entries).toHaveLength(51);
    expect(manifest.entries[50]).toMatchObject({
      id: 51,
      filename: "051_task_notification_recipient_rls_helper.sql",
      sha256: "acda688d928ef06e2a8a069953976d0fa57f8fa7a5a0d988534d7da189d8a927",
      status: "applied",
    });
  });

  it("records Migration 052 as applied in the canonical 001-052 ledger", () => {
    expect(appliedManifest.applied_count).toBe(52);
    expect(appliedManifest.entries).toHaveLength(52);
    expect(appliedManifest.pending_migrations).toEqual([]);
    expect(appliedManifest.entries[51]).toMatchObject({
      id: 52,
      filename: "052_funder_finance_report_scope_isolation.sql",
      sha256: "cc8d34c12d34eab9c4cc9aeabd46d9da59b1ec7ef0c7c89345d4b49455a6ac0b",
      status: "applied",
    });
  });

  it("requires the fresh Neon Production clone and matching backup parity", () => {
    expect(backup.production_branch_id).toBe("br-damp-shape-b3xlh4nr");
    expect(backup.backup_branch_id).toBe("br-snowy-credit-b336z950");
    expect(backup.backup_branch_state).toBe("ready");
    expect(backup.migration_052_applied).toBe(false);
    expect(backup.production_counts).toEqual(backup.backup_counts);
  });

  it("pins the exact backup evidence manifest digest", () => {
    const digest = crypto.createHash("sha256").update(fs.readFileSync("docs/audits/NEON_PRE_052_BACKUP_MANIFEST_20261120.json")).digest("hex");
    expect(digest).toBe("cbb6216e1c86a238d97e9e7bd400c2073fda75d3dd7224a707ee0bbdcc4d8a7a");
  });

  it("executes migration and ledger write atomically, then backtests Funder denial", () => {
    expect(runner).toContain('await client.query("BEGIN")');
    expect(runner).toContain('"INSERT INTO public.migration_history (filename, sha256, status) VALUES ($1, $2, \'applied\')"');
    expect(runner).toContain('await client.query("COMMIT")');
    expect(runner).toContain('await client.query("ROLLBACK")');
    expect(runner).toContain("Funder generic Finance/Accounting/Reports/Payment grants = 0");
    expect(runner).toContain("finance_view !== false");
    expect(runner).toContain("reports_view !== false");
  });

  it("rejects runtime DB roles and any non-Production database target", () => {
    expect(runner).toContain("EXPECTED_HOST");
    expect(runner).toContain("EXPECTED_DB");
    expect(runner).toContain("app_runtime_secure");
    expect(runner).toContain("rejectUnauthorized: true");
  });
});

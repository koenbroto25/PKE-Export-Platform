import { describe, expect, it } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const manifest = JSON.parse(fs.readFileSync(path.join(root, "migration_history_manifest_001_047.json"), "utf8"));
const runner = fs.readFileSync(path.join(root, "scripts/migrate.mjs"), "utf8");
const verifier = fs.readFileSync(path.join(root, "scripts/verify-migration-release-policy.mjs"), "utf8");

function sha256(file: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(path.join(root, file))).digest("hex");
}

describe("Production migration ledger 001-047", () => {
  it("records the exact contiguous applied ledger with no pending migrations", () => {
    expect(manifest.applied_count).toBe(47);
    expect(manifest.entries).toHaveLength(47);
    expect(manifest.pending_migrations).toEqual([]);
    manifest.entries.forEach((entry: any, index: number) => {
      expect(entry.id).toBe(index + 1);
      expect(entry.status).toBe(index < 16 ? "baselined" : "applied");
      expect(entry.sha256).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  it.each([
    [42, "migrations/042_inventory_reservation_release_reason.sql", "4894520de17e45b38a3d50db96e9aaa1c5fa5603186e13bab0ee0f32e3bb4996"],
    [43, "migrations/043_project_role_assignments_and_history.sql", "15e73e189b4b454582a6e2ce996eb13605bdb5157e9f3ea93837bd5c97f22086"],
    [44, "migrations/044_project_change_delete_permission.sql", "618726680810cce39225442cd3cb5d87cdc118136aba33c092091c756122b48d"],
    [45, "migrations/045_cash_advance_financial_audit.sql", "da80dc506ec81389232068fc84c810b62e7d85493aaa4b59f7870007c72c0261"],
    [46, "migrations/046_cash_advance_finance_role_guard.sql", "4697eebc8e2187a52143d5d1748d8e062c5b6bbee8a7b98fbf21da91135b7d31"],
    [47, "migrations/047_project_admin_finance_read_only.sql", "1ad12527d79db45d4f3a7bd3e6764268679709f2ebec9f2f3c1b902cbc767682"],
  ])("pins applied migration %i to its Production source hash", (id, file, expectedHash) => {
    const entry = manifest.entries[id - 1];
    expect(entry.filename).toBe(file.split("/").at(-1));
    expect(entry.sha256).toBe(expectedHash);
    expect(entry.source_sha_verified).toBe(true);
    expect(sha256(file)).toBe(expectedHash);
  });

  it("uses the 001-047 manifest and verification-only path for already-applied 047", () => {
    expect(runner).toContain("migration_history_manifest_001_047.json");
    expect(runner).toContain("exact036to047");
    expect(runner).toContain("Production Migration 047 is already applied and all 47 ledger rows are verified; no SQL re-execution performed.");
    expect(verifier).toContain("Migration 047 must match the exact hash-verified applied Production ledger entry.");
    expect(verifier).toContain("No pending migration may remain after Migration 047 application.");
  });
});

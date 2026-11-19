import { describe, expect, it } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const manifest = JSON.parse(fs.readFileSync(path.join(root, "migration_history_manifest_001_044.json"), "utf8"));
const runner = fs.readFileSync(path.join(root, "scripts/migrate.mjs"), "utf8");
const verifier = fs.readFileSync(path.join(root, "scripts/verify-migration-release-policy.mjs"), "utf8");

function sha256(file: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(path.join(root, file))).digest("hex");
}

describe("Production migration ledger 001-044", () => {
  it("records the exact contiguous applied ledger and no pending migrations", () => {
    expect(manifest.applied_count).toBe(44);
    expect(manifest.entries).toHaveLength(44);
    expect(manifest.pending_migrations).toEqual([]);
    manifest.entries.forEach((entry: any, index: number) => {
      expect(entry.id).toBe(index + 1);
      expect(entry.status).toBe("applied");
      expect(entry.sha256).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  it.each([
    [42, "migrations/042_inventory_reservation_release_reason.sql", "4894520de17e45b38a3d50db96e9aaa1c5fa5603186e13bab0ee0f32e3bb4996"],
    [43, "migrations/043_project_role_assignments_and_history.sql", "15e73e189b4b454582a6e2ce996eb13605bdb5157e9f3ea93837bd5c97f22086"],
    [44, "migrations/044_project_change_delete_permission.sql", "618726680810cce39225442cd3cb5d87cdc118136aba33c092091c756122b48d"],
  ])("pins migration %i to its applied Production source hash", (id, file, expectedHash) => {
    const entry = manifest.entries[id - 1];
    expect(entry.filename).toBe(file.split("/").at(-1));
    expect(entry.sha256).toBe(expectedHash);
    expect(entry.source_sha_verified).toBe(true);
    expect(sha256(file)).toBe(expectedHash);
  });

  it("uses the 44-row manifest and never replays an already-applied 042-044 package", () => {
    expect(runner).toContain("migration_history_manifest_001_044.json");
    expect(runner).toContain("alreadyAppliedManifest.entries?.length === 44");
    expect(runner).toContain("all 44 ledger rows are verified; no SQL re-execution performed");
    expect(verifier).toContain("migration_history_manifest_001_044.json");
    expect(verifier).toContain("No pending migration may remain after Production 042-044 application.");
  });
});

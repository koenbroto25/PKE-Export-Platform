import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

const ROOT = process.cwd();
const read = (file: string) => readFileSync(join(ROOT, file), "utf8");
const json = (file: string) => JSON.parse(read(file)) as Record<string, any>;
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

describe("P20 release boundary and evidence integrity", () => {
  const production = json("migration_history_manifest_001_071.json");
  const uat = json("migration_history_manifest_uat_001_110.json");
  const p17d = json("migration_release_manifest_p17d_110.json");
  const p18 = json("migration_release_manifest_p18_111.json");
  const migration110 = read("migrations/110_p17d_vessel_position_runtime_rls_fix.sql");
  const migration111 = read("migrations/111_p18_regulatory_core_governance.sql");
  const migration112 = read("migrations/112_p18_regulatory_rule_lifecycle_compatibility.sql");

  it("pins Migration 110 to the same source hash and applied Production/UAT ledger records", () => {
    const expected = "f36cf9350e6b409841dedb35d13bbd077568dec3bf1aa88b00d8a43793001d46";
    expect(sha256(migration110)).toBe(expected);
    expect(p17d.production_application?.status).toBe("applied");
    expect(p17d.production_application?.ledger_id).toBe(71);
    expect(p17d.migrations?.[0]?.sha256).toBe(expected);
    expect(p17d.migrations?.[0]?.production_applied).toBe(true);
    expect(production.entries?.[70]).toMatchObject({
      id: 71,
      filename: "110_p17d_vessel_position_runtime_rls_fix.sql",
      sha256: expected,
      status: "applied",
    });
    expect(uat.entries?.[109]).toMatchObject({
      id: 110,
      filename: "110_p17d_vessel_position_runtime_rls_fix.sql",
      sha256: expected,
      status: "applied",
    });
  });

  it("keeps P18 migrations 111/112 isolated-only and does not infer UAT/Production approval", () => {
    const [core, lifecycle] = p18.migrations ?? [];
    expect(sha256(migration111)).toBe("e79c8fb82024b140d54a39945176094f7c0ff4c3e5326a9e68623752cade8904");
    expect(sha256(migration112)).toBe("00b52dcbb51a706402cfeb203fcef321fb56241eda43c7bd2a43d4fc2ec4fa21");
    expect(core).toMatchObject({ ledger_id: 72, status: "applied_on_isolated_validation_branch", production_applied: false });
    expect(lifecycle).toMatchObject({ ledger_id: 73, status: "applied_on_isolated_validation_branch", production_applied: false });
    expect(p18.production_application).toMatchObject({ status: "not_applied", applied: false });
    expect(p18.owner_approval?.approval_scope).toBe("isolated_validation_branch_only");
    expect(p18.owner_approval?.production_application_requires_separate_explicit_approval).toBe(true);
    expect(p18.uat_branch_id).toBe("br-young-boat-b3re832d");
    expect(p18.validation_branch_id ?? core.validation_branch_id).toBe("br-winter-butterfly-b3tnsao9");
  });

  it("keeps Migration 110 source-level checks distinct from the P17 runtime release gate", () => {
    const migrationTest = read("src/migration-110-p17d-ais-runtime-rls.test.ts");
    const maritime = read("src/p17-maritime.ts");
    expect(migrationTest).toContain("p17d_vessel_position_ingest_admin_insert");
    expect(migrationTest).toContain("p17d_vessel_position_independent_review_update");
    expect(maritime).toContain("P17_LEGACY_POSITION_SCOPE_BLOCKED");
    expect(maritime).toContain("p17d_vessel_position_admin_pending_select");
    expect(maritime).toContain("p17d_vessel_position_admin_review_update");
    expect(maritime).toContain("p17d_vessel_position_project_review_select");
    expect(migration).toContain("p17d_vessel_position_ingest_admin_insert");
    expect(migration).toContain("p17d_vessel_position_independent_review_update");
    expect(migration).not.toContain("p17d_vessel_position_admin_pending_select");
    expect(migration).not.toContain("p17d_vessel_position_admin_review_update");
    expect(migration).not.toContain("p17d_vessel_position_project_review_select");
    expect(migration).not.toContain("p17d_vessel_position_admin_pending_select");
    expect(migration).not.toContain("p17d_vessel_position_admin_review_update");
    expect(migration).not.toContain("p17d_vessel_position_project_review_select");
  });

  it("keeps P20 database and deployment restrictions explicit", () => {
    const plan = read("PKE_Master_Implementation_Plan_Rev1.7_Single_Source.md");
    expect(plan).toContain("p20/platform-continuation-20261123");
    expect(plan).toContain("Vercel Preview/Production deployments");
    expect(plan).toContain("Canonical Neon Production and original UAT remain read-only");
    expect(plan).toContain("Do not merge this branch to");
    expect(plan).toContain("RAG preparation only");
    expect(plan).toContain("Migration 110 unapplied: **CLOSED");
  });
});

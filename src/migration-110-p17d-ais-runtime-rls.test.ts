import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../migrations/110_p17d_vessel_position_runtime_rls_fix.sql", import.meta.url), "utf8");

describe("Migration 110 — P17-D AIS runtime RLS", () => {
  it("allows ingestion only for Platform Admin with a pending, source-linked observation", () => {
    expect(migration).toContain("p17d_vessel_position_ingest_admin_insert");
    expect(migration).toContain("public.pke_is_platform_admin()");
    expect(migration).toContain("source_id IS NOT NULL");
    expect(migration).toContain("created_by=public.pke_current_user_id()");
    expect(migration).toContain("review_status='pending'");
  });

  it("allows only Project-scoped independent PM review of pending licensed positions", () => {
    expect(migration).toContain("p17d_vessel_position_independent_review_update");
    expect(migration).toContain("review_status='pending'");
    expect(migration).toContain("public.pke_has_project_permission(v.project_id,'vessel.position.review')");
    expect(migration).toContain("reviewed_by=public.pke_current_user_id()");
    expect(migration).toContain("review_status IN ('accepted','rejected','superseded')");
  });

  it("does not relax source rights, provenance, or immutable payload guards", () => {
    expect(migration).toContain("P17-D corrective migration");
    expect(migration).not.toMatch(/DISABLE ROW LEVEL SECURITY|FORCE ROW LEVEL SECURITY/i);
    expect(migration).toContain("vessel_tracking_positions");
    expect(migration).toMatch(/BEGIN;[\s\S]*COMMIT;/);
  });
});

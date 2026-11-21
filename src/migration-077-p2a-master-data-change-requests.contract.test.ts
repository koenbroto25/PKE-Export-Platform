import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("../migrations/077_p2a_master_data_change_requests.sql", import.meta.url), "utf8");

describe("Migration 077 P15 canonical master-data approval workflow", () => {
  it("matches the exact UAT migration SHA-256", () => {
    expect(createHash("sha256").update(migration).digest("hex")).toBe("HASH_PLACEHOLDER");
  });
  it("creates a Project-scoped FORCE-RLS request register without runtime DELETE", () => {
    expect(migration).toContain("CREATE TABLE public.p2a_master_data_change_requests");
    expect(migration).toContain("ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("FORCE ROW LEVEL SECURITY");
    expect(migration).toContain("p2a_master_change_select");
    expect(migration).toContain("p2a_master_change_insert");
    expect(migration).toContain("p2a_master_change_update");
    expect(migration).toContain("GRANT SELECT,INSERT,UPDATE ON public.p2a_master_data_change_requests");
    expect(migration).not.toContain("GRANT DELETE ON public.p2a_master_data_change_requests");
  });
  it("keeps global organization/facility writes Platform Admin-only", () => {
    expect(migration).toContain("p2a_partner_org_admin_insert");
    expect(migration).toContain("p2a_partner_org_admin_update");
    expect(migration).toContain("p2a_pks_sites_admin_insert");
    expect(migration).toContain("p2a_pks_sites_admin_update");
    expect(migration).toContain("USING (public.pke_is_platform_admin())");
  });
  it("enforces independent approval, immutable proposals, and optimistic concurrency", () => {
    expect(migration).toContain("Requester cannot approve their own change request");
    expect(migration).toContain("Only Platform Admin may approve or reject");
    expect(migration).toContain("Admin may decide a request but may not rewrite its submitted proposal");
    expect(migration).toContain("changed after request submission; resubmit against current values");
    expect(migration).toContain("NEW.reviewed_by:=v_user_id");
    expect(migration).toContain("NEW.reviewed_at:=now()");
  });
  it("does not promote changed legal identities to verified status", () => {
    expect(migration).toContain("THEN 'unverified' ELSE verification_status END");
    expect(migration).toContain("verified_by=CASE");
    expect(migration).toContain("verified_at=CASE");
  });
  it("audits request and canonical apply actions with before/after snapshots", () => {
    expect(migration).toContain("p2a.master_data_change_request.created");
    expect(migration).toContain("p2a.master_data_change_request.updated");
    expect(migration).toContain("p2a.canonical_master_data.applied");
    expect(migration).toContain("before_snapshot,after_snapshot,metadata,outcome");
  });
});

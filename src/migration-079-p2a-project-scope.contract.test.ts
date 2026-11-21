import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
const migration = readFileSync(new URL("../migrations/079_p2a_project_scope_guard.sql", import.meta.url), "utf8");
const indexSource = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
describe("Migration 079 P15 Project-scope guard", () => {
  it("adds a database trigger guard for canonical organization and facility updates", () => {
    expect(migration).toContain("pke_enforce_p2a_change_request_project_scope");
    expect(migration).toContain("p2a_master_change_project_scope");
    expect(migration).toContain("project_supplier_participation");
    expect(migration).toContain("project_pks_site_participation");
    expect(migration).toContain("contract_programs");
    expect(migration).toContain("cross-Project master-data changes are denied");
  });
  it("requires facility-product, capacity and certification requests to use a facility linked to the same Project", () => {
    expect(migration).toContain("NEW.entity_type IN ('facility_product','capacity_record','certification')");
    expect(migration).toContain("Facility evidence must belong to a facility participating in the selected Project");
  });
  it("keeps Platform Admin as global steward and runtime DELETE unavailable", () => {
    expect(migration).toContain("IF public.pke_is_platform_admin() THEN");
    expect(migration).not.toContain("GRANT DELETE");
    expect(migration).not.toContain("CREATE POLICY");
  });
  it("filters P15 canonical target and evidence lists to the active Project for non-admin users", () => {
    expect(indexSource).toContain("pke_is_platform_admin() OR EXISTS");
    expect(indexSource).toContain("pp.project_id=$1::uuid");
    expect(indexSource).toContain("sp.project_id=$1::uuid");
  });
});

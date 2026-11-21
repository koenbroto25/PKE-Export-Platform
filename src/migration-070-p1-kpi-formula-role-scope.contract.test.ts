import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const migration=readFileSync(new URL("../migrations/070_p1_kpi_formula_role_scope.sql",import.meta.url),"utf8");
const manifest=JSON.parse(readFileSync(new URL("../migration_history_manifest_001_052.json",import.meta.url),"utf8"));

describe("Migration 070 active-role P1 KPI formula scope",()=>{
  it("matches the exact UAT-only SHA-256",()=>{
    expect(createHash("sha256").update(migration).digest("hex")).toBe("0a8d30176bde45f71cf6147a2dc9ab60d736bdc62ced53640ceec6e9080cfc6b");
  });
  it("restricts aggregate formulas to active Project role assignments",()=>{
    expect(migration).toContain("p1_kpi_formula_allowed");
    expect(migration).toContain("p1_has_active_project_role_assignment");
    expect(migration).toContain("public.pke_current_user_id()");
    expect(migration).toContain("AND public.p1_kpi_formula_allowed(p_project_id,p_formula_key)");
    expect(migration).toContain("reports.view");
  });
  it("does not grant unrelated KPI formulas to Finance/Procurement",()=>{
    expect(migration).toContain("WHEN p_formula_key IN ('po_cycle_time_hours','three_way_match_rate')");
    expect(migration).not.toContain("WHEN p_formula_key IN ('production_output_quantity','po_cycle_time_hours')");
  });
  it("keeps the Production manifest at the verified 001-052 baseline",()=>{
    expect(manifest.applied_count).toBe(52);
    expect(manifest.entries.some((entry:any)=>entry.filename.startsWith("070_"))).toBe(false);
  });
});

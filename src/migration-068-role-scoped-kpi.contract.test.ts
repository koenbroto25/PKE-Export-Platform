import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const migration=readFileSync(new URL("../migrations/068_p1_role_scoped_kpi_permission.sql",import.meta.url),"utf8");
const manifest=JSON.parse(readFileSync(new URL("../migration_history_manifest_001_052.json",import.meta.url),"utf8"));

describe("Migration 068 role-scoped P1 KPI permission",()=>{
  it("matches the exact UAT-only migration SHA-256",()=>{
    expect(createHash("sha256").update(migration).digest("hex")).toBe("e1cdab2b89a418cdcf2e5ae80345f4495c5854920e55d2897573c30929958402");
  });
  it("grants P1 KPI visibility only to role allowlist entries",()=>{
    expect(migration).toContain("'p1.kpi.view'");
    expect(migration).toContain("pke_project_role_permission_allowlist");
    expect(migration).toContain("project_role_permissions");
    expect(migration).not.toContain("'reports.view'");
  });
  it("does not modify the Production migration manifest",()=>{
    expect(manifest.applied_count).toBe(52);
    expect(manifest.entries.some((entry:any)=>entry.filename.startsWith("068_"))).toBe(false);
  });
});

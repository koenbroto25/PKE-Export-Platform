import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const migration=readFileSync(new URL("../migrations/069_p1_kpi_secure_aggregate_function.sql",import.meta.url),"utf8");
const manifest=JSON.parse(readFileSync(new URL("../migration_history_manifest_001_052.json",import.meta.url),"utf8"));

describe("Migration 069 secure P1 KPI aggregates",()=>{
  it("matches the exact UAT-only migration SHA-256",()=>{
    expect(createHash("sha256").update(migration).digest("hex")).toBe("402f26bebc0016fa2fbcc3b7c661f96e07df08db4769e94d66d709206b78e349");
  });
  it("returns aggregate values only behind active P1 KPI or reports permission",()=>{
    expect(migration).toContain("p1_get_kpi_metric");
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("p1.kpi.view");
    expect(migration).toContain("reports.view");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.p1_get_kpi_metric");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.p1_get_kpi_metric");
  });
  it("does not modify the Production migration manifest",()=>{
    expect(manifest.applied_count).toBe(52);
    expect(manifest.entries.some((entry:any)=>entry.filename.startsWith("069_"))).toBe(false);
  });
});

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const migration=readFileSync(new URL("../migrations/074_p2a_candidate_register_and_mill_fixture.sql",import.meta.url),"utf8");
const manifest=JSON.parse(readFileSync(new URL("../migration_history_manifest_001_052.json",import.meta.url),"utf8"));

describe("Migration 074 P2-A candidate register and facility-type separation",()=>{
  it("matches the exact UAT-only SHA-256",()=>{
    expect(createHash("sha256").update(migration).digest("hex")).toBe("c59e8a1f9e31215f49a5f83b42cb814f6f99d787f3d4f5a59ec2e238f227ce27");
  });
  it("creates a Project-scoped candidate register with RLS and audit",()=>{
    expect(migration).toContain("CREATE TABLE public.p2a_master_data_candidates");
    expect(migration).toContain("ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("FORCE ROW LEVEL SECURITY");
    expect(migration).toContain("p2a_master_candidates_select");
    expect(migration).toContain("p2a_master_candidates_insert");
    expect(migration).toContain("p2a_master_candidates_update");
    expect(migration).toContain("pke_guard_and_audit_p2a_master_candidate");
    expect(migration).toContain("Only Platform Admin may change candidate provenance or verification decision");
  });
  it("keeps public GIMNI leads separate from canonical organizations and facilities",()=>{
    expect(migration).toContain("GIMNI Members — 2025");
    expect(migration).toContain("'public_candidate'");
    expect(migration).toContain("'unverified'");
    expect(migration).toContain("candidate_type,candidate_name,candidate_category,location_text");
  });
  it("keeps the synthetic palm-oil mill separate from the synthetic KCP",()=>{
    expect(migration).toContain("'palm_oil_mill'");
    expect(migration).toContain("Kernel Crushing Plant fixture"); // the existing KCP remains separate
    expect(migration).toContain("23000000-0000-4000-8000-000000000002");
    expect(migration).toContain("P2A-SEED-20261121-02");
    expect(migration).toContain("no verified production, capacity, stock, certification or availability");
  });
  it("does not change the verified Production manifest baseline",()=>{
    expect(manifest.applied_count).toBe(52);
    expect(manifest.entries.some((entry:any)=>entry.filename.startsWith("074_"))).toBe(false);
  });
});

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const migration=readFileSync(new URL("../migrations/067_p1_supplier_commitment_creator_grants.sql",import.meta.url),"utf8");
const manifest=JSON.parse(readFileSync(new URL("../migration_history_manifest_001_052.json",import.meta.url),"utf8"));

describe("Migration 067 supplier commitment creator grants",()=>{
  it("matches the exact UAT-only migration SHA-256",()=>{
    expect(createHash("sha256").update(migration).digest("hex")).toBe("fc6e82204e7fbfa17d5180280f96b292a3096bd05bb5dec0e0be31acdc6d691f");
  });
  it("grants the commitment capability only through the canonical role allowlist",()=>{
    expect(migration).toContain("'procurement.commitment.manage'");
    expect(migration).toContain("p.role_code IN ('procurement','contract_manager')");
    expect(migration).toContain("pke_project_role_permission_allowlist");
    expect(migration).toContain("project_role_permissions");
  });
  it("does not modify the Production migration manifest",()=>{
    expect(manifest.applied_count).toBe(52);
    expect(manifest.entries.some((entry:any)=>entry.filename.startsWith("067_"))).toBe(false);
  });
});

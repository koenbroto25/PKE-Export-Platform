import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const migration=readFileSync(new URL("../migrations/076_p2a_project_product_requirements.sql",import.meta.url),"utf8");

describe("Migration 076 P2-A Project product requirement overlay",()=>{
  it("matches the exact UAT-only SHA-256",()=>{
    expect(createHash("sha256").update(migration).digest("hex")).toBe("7ee71fbb5db52fd1a561fee1ab3ebfb855c4c90db6e43d0d3bc90b63bc8abfa0");
  });
  it("creates Project-scoped editable product requirements with RLS and audit",()=>{
    expect(migration).toContain("CREATE TABLE public.project_product_requirements");
    expect(migration).toContain("ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("FORCE ROW LEVEL SECURITY");
    expect(migration).toContain("p2a_project_product_requirements_select");
    expect(migration).toContain("p2a_project_product_requirements_insert");
    expect(migration).toContain("p2a_project_product_requirements_update");
    expect(migration).toContain("pke_guard_and_audit_project_product_requirement");
  });
  it("restricts approval decisions to Platform Admin and stamps reviewer identity",()=>{
    expect(migration).toContain("Only Platform Admin may change product source provenance or approval decision");
    expect(migration).toContain("NEW.approved_by:=v_user_id");
    expect(migration).toContain("NEW.approved_at:=now()");
    expect(migration).toContain("New Project product requirements must start as draft");
  });
  it("adds PKE/PKM as a distinct product and does not assign buyer numeric limits",()=>{
    expect(migration).toContain("'PKE','Palm Kernel Expeller (PKE) / Palm Kernel Meal (PKM)'");
    expect(migration).toContain("'ex 2306.60.10','ex 2306.60.90'");
    expect(migration).toContain("'numeric_limits',NULL");
    expect(migration).toContain("SNI 7856:2017");
    expect(migration).toContain("P2A-SEED-20261121-03");
  });
});

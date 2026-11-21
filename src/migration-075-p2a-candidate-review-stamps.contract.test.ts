import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const migration=readFileSync(new URL("../migrations/075_p2a_candidate_review_stamps.sql",import.meta.url),"utf8");

describe("Migration 075 P2-A candidate Admin review stamps",()=>{
  it("matches the exact UAT-only SHA-256",()=>{
    expect(createHash("sha256").update(migration).digest("hex")).toBe("d8567f9e7fc09e200bed8133a36031f6f597f26a6262b044fd1173bc2b56ec23");
  });
  it("restricts provenance and verification decisions to Platform Admin",()=>{
    expect(migration).toContain("v_is_admin:=public.pke_is_platform_admin()");
    expect(migration).toContain("Only Platform Admin may change candidate provenance or verification decision");
    expect(migration).toContain("NEW.verification_status IS DISTINCT FROM OLD.verification_status");
  });
  it("stamps reviewer identity and timestamp when Admin changes verification status",()=>{
    expect(migration).toContain("NEW.reviewed_by:=v_user_id");
    expect(migration).toContain("NEW.reviewed_at:=now()");
  });
  it("keeps all new candidates unverified and records audit metadata",()=>{
    expect(migration).toContain("New candidates must start unverified");
    expect(migration).toContain("p2a_master_candidate.updated");
    expect(migration).toContain("'verification_status',NEW.verification_status");
  });
});

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

const read=(path:string)=>readFileSync(join(process.cwd(),path),"utf8");
const migration=read("migrations/114_pm_appointment_reactivation_restores_owned_project_assignments.sql");
const manifest=JSON.parse(read("migration_release_manifest_p20_pm_appointment_reactivation_114.json"));

describe("P20 PM appointment reactivation assignment restoration",()=>{
  it("normalizes only recorded appointment-driven PM assignment revocations",()=>{
    expect(migration).toContain("PM appointment '||e.event_code||': '||e.reason");
    expect(migration).toContain("e.event_code IN ('suspended','revoked')");
    expect(migration).toContain("a.revoke_reason=e.reason");
    expect(migration).toContain("Revoked assignment rows are immutable; create a fresh active assignment and retain the old row as history.");
  });
  it("returns on same-state appointment status requests",()=>{
    expect(migration).toContain("IF v_old.status=p_status THEN RETURN v_old; END IF;");
  });
  it("restores assignments only for current PM ownership and active members",()=>{
    expect(migration).toContain("o.pm_user_id=v_old.user_id");
    expect(migration).toContain("m.is_active=true AND m.deactivated_at IS NULL");
    expect(migration).toContain("INSERT INTO public.project_role_assignments(project_id,project_member_id,user_id,project_role_id,is_active,assigned_at,assigned_by,expires_at)");
    expect(migration).toContain("a.revoke_reason='PM appointment '||e.event_code||': '||e.reason OR a.revoke_reason=e.reason");
    expect(migration).toContain("NOT EXISTS(");
    expect(migration).toContain("SELECT 1 FROM public.project_role_assignments other");
  });
  it("does not restore if a competing active PM assignment exists",()=>{
    expect(migration).toContain("other.is_active=true AND other.revoked_at IS NULL");
    expect(migration).toContain("other.expires_at>now()");
  });
  it("records restoration in audit and appointment history",()=>{
    expect(migration).toContain("project.pm.assignments.restored");
    expect(migration).toContain("restoredAssignments");
    expect(migration).toContain("event_code IN ('suspended','revoked')");
    expect(migration).toContain("v_event:=CASE WHEN p_status='active'");
  });
  it("pins migration SHA and keeps production unauthorized",()=>{
    expect(manifest.production_application).toBe("not_authorized");
    expect(manifest.owner_approval.status).toBe("approved");
    expect(manifest.migrations[0].status).toBe("prepared");
    expect(createHash("sha256").update(migration).digest("hex")).toBe(manifest.migrations[0].sha256);
  });
  it("is transaction-wrapped and has no destructive table/schema operation",()=>{
    expect((migration.match(/^BEGIN;$/gm)||[]).length).toBe(1);
    expect((migration.match(/^COMMIT;$/gm)||[]).length).toBe(1);
    expect(migration).not.toMatch(/^\s*(DROP TABLE|DROP SCHEMA|TRUNCATE)\b/im);
  });
});

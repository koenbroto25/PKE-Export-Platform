import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

const read=(path:string)=>readFileSync(join(process.cwd(),path),"utf8");
const migration=read("migrations/113_pm_appointment_first_project_creation.sql");
const api=read("src/index.ts");
const ui=read("frontend/src/App.tsx");

describe("P20 appointment-first PM workflow contract",()=>{
  it("creates global appointments independently from Projects and preserves an append-only audit trail",()=>{
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.pm_appointments");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.pm_appointment_events");
    expect(migration).toContain("pke_admin_appoint_pm");
    expect(migration).toContain("pke_admin_set_pm_appointment_status");
    expect(migration).toContain("pm_appointments_one_active_user");
    expect(migration).toContain("Platform Admin required");
    expect(migration).toContain("PM user must be active and linked to Neon Auth");
    expect(migration).toContain("pm_appointment_events_admin_select");
    expect(migration).toContain("pm_appointment_events_self_select");
  });
  it("atomically links Project, Contract Program, buyer basis, ownership, membership, PM role and idempotency record",()=>{
    expect(migration).toContain("pke_pm_create_project");
    expect(migration).toContain("project_commercial_basis");
    expect(migration).toContain("project_pm_ownership");
    expect(migration).toContain("project_role_assignments");
    expect(migration).toContain("pm_project_create_idempotency");
    expect(migration).toContain("pke_current_user_id()");
    expect(migration).toContain("Active global PM appointment required");
    expect(migration).toContain("executed_contract");
    expect(migration).toContain("buyer_agreement");
    expect(migration).toContain("pke_pm_project_create");
    expect(migration).toContain("idempotentReplay");
  });
  it("suspension and revocation remove operational PM assignments without deleting ownership history",()=>{
    expect(migration).toContain("UPDATE public.project_role_assignments a");
    expect(migration).toContain("status IN ('suspended','revoked')");
    expect(migration).toContain("project_pm_ownership_events");
    expect(migration).toContain("pke_admin_transfer_project_pm");
    expect(migration).toContain("pke_pm_project_create_projects_insert");
    expect(migration).toContain("pke_pm_project_create_assignment_insert");
    expect(migration).toContain("pke_pm_project_create_basis_insert");
    expect(migration).toContain("INSERT INTO public.pke_project_role_permission_allowlist");
    expect(migration).toContain("Only one active PM assignment per Project");
  });
  it("exposes authenticated appointment, portfolio, Buyer catalog, project creation and Admin governance routes",()=>{
    expect(api).toContain("/api/v1/pm/appointment/me");
    expect(api).toContain("/api/v1/pm/portfolio");
    expect(api).toContain("/api/v1/pm/buyers");
    expect(api).toContain("/api/v1/pm/projects");
    expect(api).toContain("/api/v1/admin/pm-appointments");
    expect(api).toContain("/api/v1/admin/projects/:projectId/pm-transfer");
    expect(api).toContain("PM_APPOINTMENT_REQUIRED");
    expect(api).toContain("APPOINTMENT_FIRST_WORKFLOW_REQUIRED");
    expect(api).toContain("GLOBAL_PM_APPOINTMENT_REQUIRED");
    expect(api).toContain("project_pm_ownership_events");
  });
  it("provides appointment-first UI, Buyer agreement/contract basis, and portfolio roll-up",()=>{
    expect(ui).toContain("Appointment PM belum aktif");
    expect(ui).toContain("buyer_agreement");
    expect(ui).toContain("executed_contract");
    expect(ui).toContain("Portfolio overview");
    expect(ui).toContain("Global PM Appointment");
    expect(ui).toContain("onSelectProject");
    expect(ui).toContain("Project berhasil dibuat dan otomatis masuk portfolio PM");
  });
  it("pins Migration 113 to a prepared, not-applied release package",()=>{
    const manifest=JSON.parse(read("migration_release_manifest_p20_pm_appointment_first_113.json"));
    expect(manifest.owner_approval.status).toBe("pending");
    expect(manifest.uat_application.status).toBe("not_applied");
    expect(manifest.production_application).toBe("not_authorized");
    expect(manifest.migrations[0].status).toBe("prepared");
    expect(createHash("sha256").update(migration).digest("hex")).toBe(manifest.migrations[0].sha256);
  });
  it("validates commercial basis and preserves Project scope for Contract and Program",()=>{
    expect(migration).toContain("p_basis_type IS NULL OR p_basis_type NOT IN");
    expect(migration).toContain("p_export_country_code !~");
    expect(migration).toContain("jsonb_typeof(coalesce(p_commercial_terms");
    expect(migration).toContain("INSERT INTO public.contracts(project_id,buyer_id");
    expect(migration).toContain("INSERT INTO public.contract_programs(project_id,name");
    expect(migration).toContain("UPDATE public.projects SET contract_program_id=v_program.id");
  });
  it("migration is transaction-wrapped and contains no destructive table/schema operations",()=>{
    expect((migration.match(/^BEGIN;$/gm)||[]).length).toBe(1);
    expect((migration.match(/^COMMIT;$/gm)||[]).length).toBe(1);
    expect(migration).not.toMatch(/^\s*(DROP TABLE|DROP SCHEMA|TRUNCATE)\b/im);
  });
});

import { describe, expect, it } from "vitest";
import fs from "node:fs";
import crypto from "node:crypto";
const migration=fs.readFileSync("migrations/055_platform_admin_pm_governance_rls.sql","utf8");
const api=fs.readFileSync("src/index.ts","utf8");
describe("Migration 055 Platform Admin PM governance RLS",()=>{
 it("pins the exact migration SHA-256",()=>{
  expect(crypto.createHash("sha256").update(fs.readFileSync("migrations/055_platform_admin_pm_governance_rls.sql")).digest("hex")).toBe("9ad4c7e87954ff49df4922301efb37dcf674299bd207d6545db3f8780284e802");
 });
 it("removes broad Platform Admin staffing policies",()=>{
  expect(migration).toContain("DROP POLICY IF EXISTS pke_admin_all ON public.project_members");
  expect(migration).toContain("DROP POLICY IF EXISTS pke_admin_all ON public.project_roles");
  expect(migration).toContain("DROP POLICY IF EXISTS pke_admin_all ON public.project_invitations");
 });
 it("allows only a null-role PM candidate membership insert",()=>{
  expect(migration).toContain("project_role_id IS NULL");
  expect(migration).toContain("CREATE POLICY pke_platform_admin_pm_candidate_insert");
 });
 it("limits Platform Admin project-role writes to the PM role",()=>{
  expect(migration).toContain("CREATE POLICY pke_platform_admin_pm_role_insert");
  expect(migration).toContain("CREATE POLICY pke_platform_admin_pm_role_update");
  expect(migration).toContain("role_code = 'pm'");
 });
 it("limits assignment, event and permission visibility to PM",()=>{
  expect(migration).toContain("pke_project_role_assignments_select");
  expect(migration).toContain("pke_project_role_assignment_events_select");
  expect(migration).toContain("pke_project_role_permissions_select");
 });
 it("preserves the audited PM appointment endpoint and governance read endpoint",()=>{
  expect(api).toContain("/api/v1/admin/projects/:projectId/pm-appointment");
  expect(api).toContain("/admin/projects/:projectId/pm-governance");
 });
});

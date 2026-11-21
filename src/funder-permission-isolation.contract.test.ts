import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { getCanonicalRoleTemplate } from "./role-catalogue.js";
import { hasPageAccess } from "../frontend/src/role-permissions.js";

const api = readFileSync(join(process.cwd(), "src/index.ts"), "utf8");
const pagePermissions = readFileSync(join(process.cwd(), "frontend/src/role-permissions.ts"), "utf8");
const dashboard = readFileSync(join(process.cwd(), "frontend/src/RoleDashboardPage.tsx"), "utf8");
const app = readFileSync(join(process.cwd(), "frontend/src/App.tsx"), "utf8");
const migration052 = readFileSync(join(process.cwd(), "migrations/052_funder_finance_report_scope_isolation.sql"), "utf8");
const migration056 = readFileSync(join(process.cwd(), "migrations/056_project_context_and_funder_report_shares.sql"), "utf8");
const migration094 = readFileSync(join(process.cwd(), "migrations/094_p16_rls_safe_permission_context.sql"), "utf8");

describe("Funder external-role isolation and explicit sharing", () => {
  it("grants only basic Project context and the dedicated Funder report permission", () => {
    const funder = getCanonicalRoleTemplate("funder");
    expect(funder?.classification).toBe("external");
    expect(funder?.permissionCodes).toEqual(["project.view", "funder.view"]);
    expect(funder?.permissionCodes.some(code =>
      code.startsWith("finance.") || code.startsWith("accounting.") ||
      code.startsWith("reports.") || code.startsWith("payment.") ||
      ["report.view", "view_financial", "view_rab"].includes(code)
    )).toBe(false);
    expect(getCanonicalRoleTemplate("finance")?.permissionCodes).toContain("project.view");
    expect(getCanonicalRoleTemplate("accounting")?.permissionCodes).toContain("project.view");
  });

  it("keeps Finance, Accounting, payment and generic Reports attribution excluded for Funder", () => {
    const requirePermission = api.slice(api.indexOf("async function requireProjectPermission"), api.indexOf("async function findExplicitProjectPermission"));
    const explicitPermission = api.slice(api.indexOf("async function findExplicitProjectPermission"), api.indexOf("async function applyExplicitProjectPermissionContext"));
    expect(requirePermission).toContain("pke_resolve_project_permission_context");
    expect(explicitPermission).toContain("pke_resolve_project_permission_context");
    expect(migration094).toContain("pr.role_code = 'funder'");
    expect(migration094).toContain("LIKE 'finance.%'");
    expect(migration094).toContain("LIKE 'reports.%'");
    expect(migration094).toContain("'view_financial'");
  });

  it("keeps generic report runs private and exposes only explicitly shared completed artifacts", () => {
    const genericRuns = api.slice(api.indexOf('app.get("/api/v1/reports/runs"'), api.indexOf('app.get("/api/v1/funder/shared-reports"'));
    expect(genericRuns).toContain("perm.code = 'reports.view'");
    expect(genericRuns).toContain("pr.role_code <> 'funder'");
    const funderRoute = api.slice(api.indexOf('app.get("/api/v1/funder/shared-reports"'), api.indexOf('app.get("/api/v1/projects/:projectId/funder/report-shares"'));
    expect(funderRoute).toContain('requireProjectPermission(req, res, projectId, "funder.view")');
    expect(funderRoute).toContain("s.funder_user_id = $2::uuid");
    expect(funderRoute).toContain("s.revoked_at IS NULL");
    expect(funderRoute).toContain("rr.status = 'completed'");
  });

  it("requires project.members.manage to share and validates active Funder membership", () => {
    const shareRoutes = api.slice(api.indexOf('app.get("/api/v1/projects/:projectId/funder/report-shares"'), api.indexOf('app.post("/api/v1/reports/generate"'));
    expect(shareRoutes).toContain('requireProjectPermission(req, res, projectId, "project.members.manage")');
    expect(shareRoutes).toContain("pr.role_code = 'funder'");
    expect(shareRoutes).toContain("perm.code = 'funder.view'");
    expect(shareRoutes).toContain("status = 'completed'");
    expect(shareRoutes).toContain("revoke_reason");
  });

  it("gates the Funder route on an active Funder assignment and funder.view", () => {
    expect(pagePermissions).toContain("activeProjectRoleCodes(user).includes('funder')");
    const funder = {
      selectedProjectId: "project-a",
      projectPermissions: ["project.view", "funder.view"],
      projectMemberships: [{ projectId: "project-a", isActive: true, roleAssignments: [
        { roleCode: "funder", isActive: true, roleIsActive: true },
      ] }],
    };
    expect(hasPageAccess("funder", funder)).toBe(true);
    expect(hasPageAccess("project-detail", funder)).toBe(true);
    expect(hasPageAccess("finance", funder)).toBe(false);
    expect(hasPageAccess("reports", funder)).toBe(false);
    const noFunderGrant = { ...funder, projectPermissions: ["project.view"] };
    expect(hasPageAccess("funder", noFunderGrant)).toBe(false);
    const wrongRole = { ...funder, projectMemberships: [{ projectId: "project-a", isActive: true, roleAssignments: [
      { roleCode: "finance", isActive: true, roleIsActive: true },
    ] }] };
    expect(hasPageAccess("funder", wrongRole)).toBe(false);
  });

  it("allows Finance and Accounting Project context without opening staffing or Funder pages", () => {
    const finance = {
      selectedProjectId: "project-a",
      projectPermissions: ["project.view", "finance.view"],
      projectMemberships: [{ projectId: "project-a", isActive: true, roleAssignments: [
        { roleCode: "finance", isActive: true, roleIsActive: true },
      ] }],
    };
    const accounting = {
      selectedProjectId: "project-a",
      projectPermissions: ["project.view", "accounting.view"],
      projectMemberships: [{ projectId: "project-a", isActive: true, roleAssignments: [
        { roleCode: "accounting", isActive: true, roleIsActive: true },
      ] }],
    };
    expect(hasPageAccess("project-detail", finance)).toBe(true);
    expect(hasPageAccess("project-detail", accounting)).toBe(true);
    expect(hasPageAccess("finance", finance)).toBe(true);
    expect(hasPageAccess("journal-entries", accounting)).toBe(true);
    expect(hasPageAccess("project-members", finance)).toBe(false);
    expect(hasPageAccess("project-roles", accounting)).toBe(false);
    expect(hasPageAccess("funder", finance)).toBe(false);
    expect(hasPageAccess("funder", accounting)).toBe(false);
  });

  it("does not return member or role catalogue details from the basic Project detail endpoint", () => {
    const detail = api.slice(api.indexOf('app.get("/api/v1/projects/:id/detail"'), api.indexOf('// Project roles (RBAC builder)'));
    expect(detail).toContain("memberAccess[0]?.allowed");
    expect(detail).toContain("roleAccess[0]?.allowed");
    expect(detail).toContain(": []");
  });

  it("renders only shared report data in Funder workspace and provides a manager share/revoke flow", () => {
    expect(app).toContain("/funder/shared-reports?projectId=");
    expect(app).toContain("/funder/report-shares");
    expect(app).toContain("Bagikan");
    expect(app).toContain("Cabut akses");
    expect(dashboard).toContain("reportReadRoles.has(role)");
  });

  it("pins the existing Funder isolation migration", () => {
    expect(createHash("sha256").update(migration052).digest("hex")).toBe("cc8d34c12d34eab9c4cc9aeabd46d9da59b1ec7ef0c7c89345d4b49455a6ac0b");
    expect(migration052).toContain("DELETE FROM public.project_role_permissions");
    expect(migration052).toContain("pr.role_code = 'funder'");
  });

  it("pins Migration 056 and its project context and explicit sharing controls", () => {
    expect(createHash("sha256").update(migration056).digest("hex")).toBe("8cfb54c6c9dc728f2ae71975826ad8e589fabb82ee3cd634c3f6672abcd8ecc7");
    expect(migration056).toContain("('finance','project.view'),('accounting','project.view')");
    expect(migration056).toContain("('funder','project.view'),('funder','funder.view')");
    expect(migration056).toContain("project_funder_report_shares");
    expect(migration056).toContain("pke_report_runs_funder_shared_select");
    expect(migration056).toContain("rr.status = 'completed'");
  });
});

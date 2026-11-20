import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { getCanonicalRoleTemplate } from "./role-catalogue.js";
import { hasPageAccess } from "../frontend/src/role-permissions.js";

const api = readFileSync(join(process.cwd(), "src/index.ts"), "utf8");
const pagePermissions = readFileSync(join(process.cwd(), "frontend/src/role-permissions.ts"), "utf8");
const dashboard = readFileSync(join(process.cwd(), "frontend/src/RoleDashboardPage.tsx"), "utf8");
const migration052 = readFileSync(join(process.cwd(), "migrations/052_funder_finance_report_scope_isolation.sql"), "utf8");

describe("Funder external-role isolation", () => {
  it("does not grant generic Finance or Reports permissions in the canonical Funder template", () => {
    const funder = getCanonicalRoleTemplate("funder");
    expect(funder?.classification).toBe("external");
    expect(funder?.permissionCodes).toEqual([]);
    expect(funder?.restrictions.join(" ")).toContain("explicitly shared report artifacts");
  });

  it("excludes Funder role assignments from generic Finance, Accounting, payment and report permission attribution", () => {
    const requirePermission = api.slice(api.indexOf("async function requireProjectPermission"), api.indexOf("async function findExplicitProjectPermission"));
    const explicitPermission = api.slice(api.indexOf("async function findExplicitProjectPermission"), api.indexOf("async function applyExplicitProjectPermissionContext"));
    for (const source of [requirePermission, explicitPermission]) {
      expect(source).toContain("pr.role_code");
      expect(source).toContain("'funder'");
      expect(source).toContain("LIKE 'finance.%'");
      expect(source).toContain("LIKE 'reports.%'");
      expect(source).toContain("'view_financial'");
    }
  });

  it("does not return generic report runs to a Funder-only Project membership", () => {
    const route = api.slice(api.indexOf('app.get("/api/v1/reports/runs"'), api.indexOf('app.post("/api/v1/reports/generate"'));
    expect(route).toContain("pr.role_code <> 'funder'");
    expect(route).toContain("perm.code = 'reports.view'");
  });

  it("requires a Project context and reports.create for report generation", () => {
    const route = api.slice(api.indexOf('app.post("/api/v1/reports/generate"'), api.indexOf('app.get("/api/v1/notifications"'));
    expect(route).toContain("projectId is required for report generation.");
    expect(route).toContain("requireProjectPermission(req, res, String(projectId), \"reports.create\")");
  });

  it("keeps Finance and Reports pages behind eligible active role assignments", () => {
    expect(pagePermissions).toContain("const FINANCE_PAGE_ROLES = new Set");
    expect(pagePermissions).toContain("const REPORT_PAGE_ROLES = new Set");
    expect(pagePermissions).toContain("hasSelectedProjectMembership(user)");
    expect(pagePermissions).toContain("activeProjectRoleCodes(user).some(roleCode => roleCode !== \"funder\")");
    expect(dashboard).toContain("financeReadRoles.has(role)");
    expect(dashboard).toContain("reportReadRoles.has(role)");
    expect(dashboard).toContain("links: []");
  });
  it("hides generic Finance and Reports pages even when legacy Funder grants remain in the permission union", () => {
    const funder = {
      selectedProjectId: "project-a",
      projectPermissions: ["finance.view", "reports.view", "report.view"],
      projectMemberships: [{
        projectId: "project-a", isActive: true,
        roleAssignments: [{ roleCode: "funder", isActive: true, roleIsActive: true }],
      }],
    };
    expect(hasPageAccess("dashboard", funder)).toBe(true);
    expect(hasPageAccess("finance", funder)).toBe(false);
    expect(hasPageAccess("reports", funder)).toBe(false);
  });

  it("pins the prepared database-level Funder isolation migration and removes legacy grants", () => {
    expect(createHash("sha256").update(migration052).digest("hex")).toBe("cc8d34c12d34eab9c4cc9aeabd46d9da59b1ec7ef0c7c89345d4b49455a6ac0b");
    expect(migration052).toContain("DELETE FROM public.project_role_permissions");
    expect(migration052).toContain("pr.role_code = 'funder'");
    expect(migration052).toContain("p_permission_code LIKE 'finance.%'");
    expect(migration052).toContain("p_permission_code LIKE 'reports.%'");
    expect(migration052).toContain("CREATE OR REPLACE FUNCTION public.pke_has_project_permission");
  });

});

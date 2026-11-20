import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { getCanonicalRoleTemplate } from "./role-catalogue.js";

const migration = fs.readFileSync("migrations/053_project_admin_accounting_reports_read_only.sql", "utf8");

describe("Project Admin Accounting and Reports read-only boundary", () => {
  it("keeps Project Admin read-only in the canonical role template", () => {
    const template = getCanonicalRoleTemplate("project_admin");
    expect(template?.permissionCodes).toEqual(expect.arrayContaining([
      "accounting.view", "reports.view", "report.view",
    ]));
    for (const permission of [
      "accounting.create", "accounting.update", "accounting.delete", "accounting.post",
      "reports.create", "reports.update", "reports.delete",
    ]) expect(template?.permissionCodes).not.toContain(permission);
  });

  it("guards future grants and removes existing Project Admin write grants", () => {
    expect(migration).toContain("pke_guard_project_admin_accounting_reports_read_only");
    expect(migration).toContain("BEFORE INSERT OR UPDATE OF project_id, project_role_id, permission_id");
    expect(migration).toContain("Project Admin is read-only for Accounting and Reports.");
    expect(migration).toContain("DELETE FROM public.project_role_permissions");
    expect(migration).toContain("perm.code IN ('accounting.view', 'reports.view', 'report.view')");
    expect(migration).toContain("REVOKE ALL ON FUNCTION");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION");
  });

  it("does not rewrite Finance grants or payment-execution permissions", () => {
    expect(migration).not.toContain("role_code = 'finance'");
    expect(migration).not.toContain("payment.");
    expect(migration).not.toContain("INSERT INTO public.project_role_permissions");
  });
});

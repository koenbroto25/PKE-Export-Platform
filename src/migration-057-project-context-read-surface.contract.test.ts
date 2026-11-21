import { describe, expect, it } from "vitest";
import fs from "node:fs";
import crypto from "node:crypto";
const migration = fs.readFileSync("migrations/057_restrict_project_context_read_surface.sql");
const sql = migration.toString("utf8");
describe("Migration 057 Project context read-surface isolation", () => {
  it("pins the exact migration SHA-256", () => {
    expect(crypto.createHash("sha256").update(migration).digest("hex")).toBe("806b649e49180d7f6b8e5984324d7b8981d3fd6c84ebdf4fbee6da0b27067ae9");
  });
  it("restricts Project role catalog visibility to role managers", () => {
    expect(sql).toContain("DROP POLICY IF EXISTS pke_project_roles_select ON public.project_roles");
    expect(sql).toContain("pke_has_project_permission(project_id, 'project.roles.manage')");
    expect(sql).toContain("Project role catalogue is not restricted to role managers.");
  });
  it("restricts version snapshots to Project managers/change reviewers", () => {
    expect(sql).toContain("DROP POLICY IF EXISTS pke_project_versions_select ON public.project_versions");
    expect(sql).toContain("pke_has_project_permission(project_id, 'project.update')");
    expect(sql).toContain("pke_has_project_permission(project_id, 'project.change.view')");
  });
});

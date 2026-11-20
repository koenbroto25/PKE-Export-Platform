import { describe, expect, it } from "vitest";
import { hasPageAccess, visiblePageKeys } from "../frontend/src/role-permissions.js";

const member = { projectId: "project-a", isActive: true };
const user = (permissions: string[], selectedProjectId = "project-a") => ({ platformAdmin: false, selectedProjectId, projectPermissions: permissions, projectPermissionsLoading: false, projectPermissionsError: "", projectMemberships: [member] });

describe("Project-scoped effective permission UX", () => {
  it("combines permissions resolved from multiple active roles in the selected Project", () => {
    const pages = visiblePageKeys(user(["finance.view", "accounting.view", "inventory.view"]));
    expect(pages).toContain("finance"); expect(pages).toContain("journal-entries"); expect(pages).toContain("warehouse"); expect(pages).not.toContain("supplier");
  });
  it("keeps Project Admin Finance read-only while allowing Finance visibility", () => {
    const admin = user(["project.view", "project.members.view", "finance.view"]);
    expect(hasPageAccess("finance", admin)).toBe(true); expect(hasPageAccess("cash-advances", admin)).toBe(true);
  });
  it("does not carry permissions across Projects when no Project is selected", () => {
    const noSelection = user(["finance.view", "accounting.view"], "");
    expect(hasPageAccess("finance", noSelection)).toBe(false); expect(hasPageAccess("journal-entries", noSelection)).toBe(false);
    expect(hasPageAccess("projects", noSelection)).toBe(true); expect(hasPageAccess("notifications", noSelection)).toBe(true);
  });
  it("fails closed while Project permissions are loading or unavailable", () => {
    expect(hasPageAccess("finance", { ...user(["finance.view"]), projectPermissionsLoading: true })).toBe(false);
    expect(hasPageAccess("finance", { ...user(["finance.view"]), projectPermissionsError: "denied" })).toBe(false);
  });
  it("keeps Platform Admin access separate from Project permissions", () => {
    expect(hasPageAccess("access", { platformAdmin: true, selectedProjectId: "", projectPermissions: [] })).toBe(true);
  });
  it("requires an active membership to open the Project list without a Project selected", () => {
    expect(hasPageAccess("projects", { projectMemberships: [{ isActive: false }] })).toBe(false);
  });
});

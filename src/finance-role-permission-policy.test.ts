import { describe, expect, it } from "vitest";
import { getCanonicalRoleTemplate } from "./role-catalogue.js";

describe("Finance role permission boundary", () => {
  it("keeps Project Admin read-only for Finance", () => {
    const template = getCanonicalRoleTemplate("project_admin");
    expect(template?.permissionCodes).toContain("finance.view");
    expect(template?.permissionCodes).not.toContain("finance.create");
    expect(template?.permissionCodes).not.toContain("finance.update");
    expect(template?.permissionCodes).not.toContain("finance.delete");
    expect(template?.permissionCodes).not.toContain("finance.cash_advance.request");
  });

  it("assigns Finance create, update and delete only to Finance", () => {
    const template = getCanonicalRoleTemplate("finance");
    expect(template?.permissionCodes).toEqual(expect.arrayContaining([
      "finance.view", "finance.create", "finance.update", "finance.delete",
    ]));
  });
});

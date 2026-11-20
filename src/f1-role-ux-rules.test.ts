import { describe, expect, it } from "vitest";
import { hasAnyProjectPermission, hasPageAccess, hasProjectPermission, visiblePageKeys } from "../frontend/src/role-permissions.js";

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
  it("keeps external counterparties in their dedicated portals, not internal workbenches", () => {
    const buyer = user(["buyer.requirement.view", "buyer.shipment.view", "documents.view", "shipment.view"]);
    expect(hasPageAccess("buyer", buyer)).toBe(true); expect(hasPageAccess("dashboard", buyer)).toBe(false);
    expect(hasPageAccess("operations", buyer)).toBe(false); expect(hasPageAccess("compliance", buyer)).toBe(false);
    expect(hasPageAccess("shipment-allocations", buyer)).toBe(false);
    const transporter = user(["logistics.view", "record_truck_trips", "verify_checkpoints"]);
    expect(hasPageAccess("transporter", transporter)).toBe(true); expect(hasPageAccess("dashboard", transporter)).toBe(false); expect(hasPageAccess("operations", transporter)).toBe(false);
  });
  it("keeps internal procurement users out of external Buyer/Supplier portals", () => {
    const procurement = user(["supplier.view", "supplier.manage", "buyer.requirement.view", "contract.view"]);
    expect(hasPageAccess("buyer", procurement)).toBe(false); expect(hasPageAccess("supplier", procurement)).toBe(false);
    expect(hasPageAccess("buyer", user(["buyer.shipment.view"]))).toBe(true);
    expect(hasPageAccess("supplier", user(["supplier.view", "shipment.view"]))).toBe(true);
  });
  it("does not expose the Transporter portal from PM logistics read access alone", () => {
    expect(hasPageAccess("transporter", user(["logistics.view"]))).toBe(false);
    expect(hasPageAccess("transporter", user(["record_truck_trips", "verify_checkpoints"]))).toBe(true);
  });
  it("requires shipping.view for internal shipment allocation access", () => {
    expect(hasPageAccess("shipment-allocations", user(["shipment.view"]))).toBe(false);
    expect(hasPageAccess("shipment-allocations", user(["shipping.view"]))).toBe(true);
  });
  it("allows a role with domain-specific permissions to reach its Project landing dashboard", () => {
    expect(hasPageAccess("dashboard", user(["facility.view"]))).toBe(true);
  });
  it("does not expose payment instructions or Funder workspace from Finance read access alone", () => {
    const pm = visiblePageKeys(user(["project.view", "finance.view", "reports.view"]));
    expect(pm).toContain("finance"); expect(pm).not.toContain("payment-instructions"); expect(pm).not.toContain("funder");
    expect(visiblePageKeys(user(["payment.view"]))).toContain("payment-instructions");
  });
  it("shows My Work to active Project roles while keeping its data scoped by the API", () => {
    expect(hasPageAccess("my-work", user(["inventory.view"]))).toBe(true);
    expect(hasPageAccess("my-work", user(["buyer.shipment.view"]))).toBe(true);
    expect(hasPageAccess("my-work", user(["inventory.view"], ""))).toBe(false);
  });
  it("exposes action capabilities only from the selected Project effective permissions", () => {
    const financeReadOnly = user(["finance.view"]);
    expect(hasProjectPermission("finance.view", financeReadOnly)).toBe(true);
    expect(hasProjectPermission("finance.update", financeReadOnly)).toBe(false);
    expect(hasAnyProjectPermission(["inventory.reserve", "inventory.hold"], user(["inventory.hold"]))).toBe(true);
    expect(hasProjectPermission("inventory.hold", user(["inventory.hold"], "project-b"))).toBe(false);
  });
  it("does not expose action capabilities while permissions are loading or failed", () => {
    expect(hasProjectPermission("finance.update", { ...user(["finance.update"]), projectPermissionsLoading: true })).toBe(false);
    expect(hasProjectPermission("finance.update", { ...user(["finance.update"]), projectPermissionsError: "denied" })).toBe(false);
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

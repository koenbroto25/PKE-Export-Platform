import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const appSource = fs.readFileSync(path.join(process.cwd(), "frontend/src/App.tsx"), "utf8");
const apiSource = fs.readFileSync(path.join(process.cwd(), "src/index.ts"), "utf8");
import { hasAnyProjectPermission, hasPageAccess, hasProjectPermission, visiblePageKeys } from "../frontend/src/role-permissions.js";

const member = { projectId: "project-a", isActive: true };
const user = (permissions: string[], selectedProjectId = "project-a") => ({
  platformAdmin: false, selectedProjectId, projectPermissions: permissions,
  projectPermissionsLoading: false, projectPermissionsError: "",
  projectMemberships: [{
    ...member,
    roleAssignments: [{
      roleCode: permissions.includes("finance.view") || permissions.includes("reports.view") || permissions.includes("report.view")
        ? "pm"
        : permissions.includes("buyer.shipment.view") ? "buyer"
        : permissions.includes("record_truck_trips") ? "transporter"
        : "warehouse_manager",
      isActive: true, roleIsActive: true,
    }],
  }],
});

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
    expect(hasPageAccess("buyer", buyer)).toBe(true); expect(hasPageAccess("dashboard", buyer)).toBe(true);
    expect(hasPageAccess("operations", buyer)).toBe(false); expect(hasPageAccess("compliance", buyer)).toBe(false);
    expect(hasPageAccess("shipment-allocations", buyer)).toBe(false);
    const transporter = user(["logistics.view", "record_truck_trips", "verify_checkpoints"]);
    expect(hasPageAccess("transporter", transporter)).toBe(true); expect(hasPageAccess("dashboard", transporter)).toBe(true); expect(hasPageAccess("operations", transporter)).toBe(false);
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
    expect(hasProjectPermission("inventory.hold", user(["inventory.hold"], ""))).toBe(false);
  });
  it("does not expose action capabilities while permissions are loading or failed", () => {
    expect(hasProjectPermission("finance.update", { ...user(["finance.update"]), projectPermissionsLoading: true })).toBe(false);
    expect(hasProjectPermission("finance.update", { ...user(["finance.update"]), projectPermissionsError: "denied" })).toBe(false);
  });
  it("fails closed while Project permissions are loading or unavailable", () => {
    expect(hasPageAccess("finance", { ...user(["finance.view"]), projectPermissionsLoading: true })).toBe(false);
    expect(hasPageAccess("finance", { ...user(["finance.view"]), projectPermissionsError: "denied" })).toBe(false);
  });
  it("gates Operations data requests and action forms by their own domain permissions", () => {
    const operations = appSource.slice(appSource.indexOf("function OperationsPage"), appSource.indexOf("function FinancePage"));
    expect(operations).toContain("projectId && canLogisticsView");
    expect(operations).toContain("projectId && canWarehouseView");
    expect(operations).toContain("projectId && canInventoryView");
    expect(operations).toContain("projectId && canShippingView");
    expect(operations).toContain('can("warehouse.receipt.create")');
    expect(operations).toContain('can("inventory.create")');
    expect(operations).toContain('can("inventory.reserve")');
    expect(operations).toContain('can("inventory.hold")');
    expect(operations).toContain('can("inventory.update")');
    expect(operations).toContain('can("shipping.update")');
    expect(operations).toContain("projectId && canLogisticsView ? get(`/transport-legs?projectId=");
    expect(operations).not.toContain("get('/shipment-allocations')");
  });
  it("keeps Admin-only regulatory endpoints out of Project user document workflows", () => {
    const compliance = appSource.slice(appSource.indexOf("function CompliancePage"), appSource.indexOf("function ReportsPage"));
    expect(compliance).toContain("canAdminRegulatory ? get('/regulatory-knowledge')");
    expect(compliance).toContain("canAdminRegulatory ? get('/country-packs')");
    expect(compliance).toContain("projectId && canViewDocuments");
    expect(compliance).toContain("if (!canCreateDocuments)");
    expect(compliance).toContain("if (!canUpdateDocuments || !editStatus)");
    expect(compliance).toContain('canAdminRegulatory && <Card><PanelHeading title="Pemeriksaan kepatuhan"');
  });
  it("hides privileged mutation actions from read-only Finance and Shipping users", () => {
    const app = appSource;
    const finance = app.slice(app.indexOf("function FinancePage"), app.indexOf("function FinanceSubledgerPanel"));
    expect(finance).toContain("form === 'rate' ? canManageGlobalReference : canCreateFinance");
    expect(finance).toContain("action={canCreateFinance ? <ActionButton");
    const allocation = app.slice(app.indexOf("function ShipmentAllocationPage"), app.indexOf("function CashAdvancesPage"));
    expect(allocation).toContain("canUpdateShipping && canReadInventory");
    expect(allocation).toContain("canUpdateShipping && r.status === 'active'");
  });
  it("restricts Project creation and contract program mutation to their explicit owners", () => {
    expect(appSource).toContain("const canCreateProject = activeUser?.platformAdmin === true");
    expect(appSource).toContain("const canManagePrograms = hasProjectPermission('manage_contract_programs', activeUser)");
    expect(appSource).toContain("showForm && canCreateProject");
    expect(appSource).toContain("showForm && canManagePrograms");
  });
  it("scopes transport-leg reads to an authorized Project and restores real trip creation", () => {
    const route = apiSource.slice(apiSource.indexOf('app.get("/api/v1/transport-legs"'), apiSource.indexOf('app.get("/api/v1/tracking-events"'));
    expect(route).toContain("projectId query parameter required");
    expect(route).toContain('requireProjectPermission(req, res, projectId, "logistics.view")');
    expect(route).toContain("WHERE project_id = $1::uuid");
    expect(route).not.toContain("SELECT id, project_id, origin, destination, distance_km, status, created_at, updated_at FROM transport_legs ORDER BY");
    const ops = appSource.slice(appSource.indexOf("function OperationsPage"), appSource.indexOf("function FinancePage"));
    expect(ops).toContain("get(`/transport-legs?projectId=");
    expect(ops).toContain('can("record_truck_trips") && <ActionButton');
    expect(ops).toContain("{formOpen && can(\"record_truck_trips\")");
    expect(ops).toContain("disabled={busy || !(legs.data?.transportLegs || []).length}");
  });

  it("keeps Platform Admin access separate from Project permissions", () => {
    expect(hasPageAccess("access", { platformAdmin: true, selectedProjectId: "", projectPermissions: [] })).toBe(true);
  });
  it("requires an active membership to open the Project list without a Project selected", () => {
    expect(hasPageAccess("projects", { projectMemberships: [{ isActive: false }] })).toBe(false);
  });
  it("provides a scoped role landing dashboard for every canonical Project role", () => {
    const roleSource = fs.readFileSync(path.join(process.cwd(), "src/role-catalogue.ts"), "utf8");
    const dashboardSource = fs.readFileSync(path.join(process.cwd(), "frontend/src/RoleDashboardPage.tsx"), "utf8");
    const roleCodes = [...roleSource.matchAll(/role\("([^"]+)"/g)].map(match => match[1]);
    expect(roleCodes.length).toBeGreaterThan(25);
    for (const roleCode of roleCodes) expect(dashboardSource).toContain(`${roleCode}: { label:`);
    expect(dashboardSource).toContain("Boolean(projectId && canViewTasks)]");
    expect(dashboardSource).toContain("activeUser?.platformAdmin === true ? false");
    expect(dashboardSource).toContain("sourceFailed(key) ? '—'");
    expect(dashboardSource).toContain("Antrean tugas saya");
  });

});

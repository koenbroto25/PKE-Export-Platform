import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const api = read("./index.ts");
const roles = read("./role-catalogue.ts");
function routeBlock(method: string, route: string): string {
  const marker = `app.${method}("${route}"`;
  const start = api.indexOf(marker);
  if (start < 0) throw new Error(`Route not found: ${method} ${route}`);
  const next = api.indexOf("\napp.", start + marker.length);
  return api.slice(start, next < 0 ? api.length : next);
}
describe("Parallel revision security contracts", () => {
  it("requires project-scoped contract.view for Contract Program detail reads", () => {
    const block = routeBlock("get", "/api/v1/contract-programs/:id");
    expect(block).toContain('requireProjectPermission(req, res, projectId, "contract.view")');
    expect(block).toContain("project_id = $2::uuid");
  });
  it("requires project-scoped contract.view for Contract detail reads", () => {
    const block = routeBlock("get", "/api/v1/contracts/:id");
    expect(block).toContain('requireProjectPermission(req, res, projectId, "contract.view")');
    expect(block).toContain("project_id = $2::uuid");
  });
  it("keeps exactly one PM-authorized Contract PATCH route", () => {
    const matches = api.match(/app\.patch\("\/api\/v1\/contracts\/:id"/g) ?? [];
    expect(matches).toHaveLength(1);
    const block = routeBlock("patch", "/api/v1/contracts/:id");
    expect(block).toContain('requireProjectPermission(req, res, current[0].project_id, "manage_contract_programs")');
    expect(block).not.toContain("requireAdmin");
  });
  it("requires inventory.hold before creating an Inventory Hold", () => {
    const block = routeBlock("post", "/api/v1/inventory-holds");
    const permission = block.indexOf('requireProjectPermission(req, res, projectId, "inventory.hold")');
    const insert = block.indexOf("INSERT INTO inventory_holds");
    expect(permission).toBeGreaterThan(-1);
    expect(insert).toBeGreaterThan(permission);
  });
  it("does not grant inventory.hold to Project Admin", () => {
    const admin = roles.match(/role\("project_admin"[\s\S]*?\n  \],/);
    expect(admin?.[0] ?? "").not.toContain('"inventory.hold"');
  });

  it("requires operational project permissions before operational writes", () => {
    const tripCreate = routeBlock("post", "/api/v1/truck-trips");
    expect(tripCreate).toContain('requireProjectPermission(req, res, projectId, "record_truck_trips")');
    const receiptCreate = routeBlock("post", "/api/v1/warehouse-receipts");
    expect(receiptCreate).toContain('requireProjectPermission(req, res, projectId, "warehouse.receipt.create")');
    const lotCreate = routeBlock("post", "/api/v1/inventory-lots");
    expect(lotCreate).toContain('requireProjectPermission(req, res, projectId, "inventory.create")');
    const movementCreate = routeBlock("post", "/api/v1/inventory-movements");
    expect(movementCreate).toContain('requireProjectPermission(req, res, projectId, "inventory.update")');
  });
  it("requires project Finance permission for FX exposure and RAB writes", () => {
    expect(routeBlock("post", "/api/v1/fx-exposure")).toContain('requireProjectPermission(req, res, projectId, "finance.create")');
    expect(routeBlock("post", "/api/v1/rab")).toContain('requireProjectPermission(req, res, projectId, "finance.create")');
    expect(routeBlock("get", "/api/v1/rab")).toContain('requireProjectPermission(req, res, projectId, "finance.view")');
  });
  it("limits platform-wide reports and global document reference writes to Platform Admin", () => {
    for (const route of ["/api/v1/reports/portfolio", "/api/v1/reports/export/projects", "/api/v1/reports/kpis/operational", "/api/v1/reports/kpis/financial", "/api/v1/reports/historical", "/api/v1/reports/scheduler/runs"]) {
      expect(routeBlock("get", route).split("\\n", 1)[0]).toContain("requireAdmin");
    }
    expect(routeBlock("post", "/api/v1/export-document-types").split("\\n", 1)[0]).toContain("requireAdmin");
    expect(routeBlock("post", "/api/v1/country-export-document-requirements").split("\\n", 1)[0]).toContain("requireAdmin");
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const api = read("./index.ts");
const ui = read("../frontend/src/App.tsx");
const migration = read("../migrations/048_buyer_accounting_ap_ar_document_hardening.sql");
const roles = read("./role-catalogue.ts");
function routeBlock(method: string, route: string): string {
  const marker = `app.${method}("${route}"`;
  const start = api.indexOf(marker);
  if (start < 0) throw new Error(`Route not found: ${method} ${route}`);
  const next = api.indexOf("\napp.", start + marker.length);
  return api.slice(start, next < 0 ? api.length : next);
}
describe("Consolidated PKE permission and integrity contracts", () => {
  it("restricts Buyer, FX rate and Chart of Accounts master writes to Platform Admin", () => {
    expect(routeBlock("post", "/api/v1/buyers").split("\n", 1)[0]).toContain("requireAdmin");
    expect(routeBlock("patch", "/api/v1/buyers/:id").split("\n", 1)[0]).toContain("requireAdmin");
    expect(routeBlock("post", "/api/v1/fx-rates").split("\n", 1)[0]).toContain("requireAdmin");
    expect(routeBlock("post", "/api/v1/chart-of-accounts").split("\n", 1)[0]).toContain("requireAdmin");
    expect(migration).toContain("pke_buyers_insert_platform_admin");
    expect(migration).toContain("pke_fx_rates_insert_platform_admin");
    expect(migration).toContain("pke_chart_of_accounts_insert_platform_admin");
  });
  it("requires Project Finance permissions for AP and AR invoice operations", () => {
    for (const route of ["/api/v1/ap-invoices", "/api/v1/ar-invoices"]) {
      expect(routeBlock("get", route)).toContain('"finance.view"');
      expect(routeBlock("post", route)).toContain('"finance.create"');
    }
    expect(routeBlock("patch", "/api/v1/ap-invoices/:id/verification")).toContain('"finance.update"');
    expect(routeBlock("patch", "/api/v1/ar-invoices/:id/approval")).toContain('"finance.update"');
    expect(migration).toContain("buyer_master_id");
  });
  it("scopes journal reads, drafts, lines and posting to Accounting permissions", () => {
    expect(routeBlock("get", "/api/v1/journal-entries")).toContain('"accounting.view"');
    expect(routeBlock("post", "/api/v1/journal-entries")).toContain('"accounting.create"');
    expect(routeBlock("post", "/api/v1/journal-entries/:id/lines")).toContain('"accounting.create"');
    expect(routeBlock("post", "/api/v1/journal-entries/:id/post")).toContain('"accounting.update"');
    expect(migration).toContain("pke_journal_lines_insert");
    expect(roles.match(/role\("accounting"[\s\S]*?\],/)?.[0] || "").not.toContain('"accounting.update"');
  });
  it("uses Project Finance permission consistently for FX exposures", () => {
    expect(routeBlock("get", "/api/v1/fx-exposure")).toContain('"finance.view"');
    expect(routeBlock("get", "/api/v1/fx-exposure")).toContain("WHERE e.project_id = $1::uuid");
    expect(routeBlock("post", "/api/v1/fx-exposure")).toContain('"finance.create"');
    expect(migration).toContain("pke_has_project_permission(project_id,'finance.view')");
  });
  it("verifies actual object bytes before registering an export document", () => {
    expect(routeBlock("post", "/api/v1/projects/:projectId/documents")).toContain("privateStorage.verifyObject");
    expect(ui).toContain("crypto.subtle.digest('SHA-256'");
    expect(ui).toContain("fileReference: doc.objectKey");
    expect(ui).not.toContain("'/api/v1/storage/presigned-upload'");
    expect(ui).not.toContain("'/api/v1/documents/");
  });
  it("exposes only the current user's effective Project permission set to the UI", () => {
    expect(api).toContain("pke_current_user_project_permissions($1::uuid)");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.pke_current_user_project_permissions(uuid) FROM PUBLIC");
    expect(ui).toContain("visiblePageKeys(workspaceUser || {})");
    expect(ui).toContain("hasPageAccess(key, activeUser)");
    expect(ui).toContain("/my-permissions");
    expect(ui).not.toContain("roleAccess[");
    expect(ui).toContain("projectPermissions.includes('finance.create')");
    expect(ui).toContain("projectPermissions.includes('accounting.update')");
  });
  it("aligns Truck Trip and Warehouse Receipt API guards with database RLS", () => {
    expect(routeBlock("post", "/api/v1/truck-trips")).toContain('"record_truck_trips"');
    expect(routeBlock("patch", "/api/v1/truck-trips/:id")).toContain('"record_truck_trips"');
    expect(routeBlock("post", "/api/v1/warehouse-receipts")).toContain('"warehouse.receipt.create"');
    expect(routeBlock("patch", "/api/v1/warehouse-receipts/:id")).toContain('"warehouse.update"');
    expect(migration).toContain("pke_truck_trips_insert");
    expect(migration).toContain("pke_warehouse_receipts_insert");
  });
  it("creates and protects the previously unmigrated Inventory Hold table", () => {
    expect(routeBlock("post", "/api/v1/inventory-holds")).toContain('"inventory.hold"');
    expect(routeBlock("post", "/api/v1/inventory-holds")).toContain("ON CONFLICT (idempotency_key) DO NOTHING");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.inventory_holds");
    expect(migration).toContain("pke_inventory_holds_insert");
    expect(migration).toContain("FORCE ROW LEVEL SECURITY");
  });
  it("scopes tracking event feeds and writes by the trip Project permission", () => {
    expect(routeBlock("get", "/api/v1/tracking-events")).toContain('"logistics.view"');
    expect(routeBlock("get", "/api/v1/tracking-events")).toContain("tt.project_id = $1::uuid");
    expect(routeBlock("post", "/api/v1/tracking-events")).toContain('"record_truck_trips"');
    expect(migration).toContain("pke_tracking_events_insert");
    expect(ui).toContain("/tracking-events?projectId=");
  });
  it("scopes operational read APIs by Project and matching view permissions", () => {
    for (const [route, permission, filter] of [
      ["/api/v1/truck-trips", "logistics.view", "project_id=$1::uuid"],
      ["/api/v1/warehouse-receipts", "warehouse.view", "project_id=$1::uuid"],
      ["/api/v1/inventory-lots", "inventory.view", "project_id=$1::uuid"],
      ["/api/v1/inventory-movements", "inventory.view", "project_id=$1::uuid"],
      ["/api/v1/inventory-holds", "inventory.view", "project_id=$1::uuid"],
      ["/api/v1/inventory-reservations", "inventory.view", "project_id = $1::uuid"],
    ] as const) {
      const block = routeBlock("get", route);
      expect(block).toContain(`"${permission}"`);
      expect(block).toContain(filter);
    }
    expect(ui).toContain("/warehouse-receipts?projectId=");
    expect(ui).toContain("/inventory-movements?projectId=");
  });
  it("does not accept a client-provided AP three-way match assertion", () => {
    const block = routeBlock("patch", "/api/v1/ap-invoices/:id/verification");
    expect(block).not.toContain("threeWayMatch");
    expect(block).toContain("THREE_WAY_MATCH_WORKFLOW_REQUIRED");
  });
});

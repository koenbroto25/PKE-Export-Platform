import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { canAccessProjectMembership, canManageProjectBusiness, isCobCyclePaid, isPositiveQuantity } from "./f1-contract-rules.js";

const INDEX = readFileSync(fileURLToPath(new URL("./index.ts", import.meta.url)), "utf8");
const MIGRATION_PATH = fileURLToPath(new URL("../migrations/039_project_scoped_contract_cob_cycles.sql", import.meta.url));
// Deployment packaging intentionally excludes *.sql. These source-policy assertions run in repository CI.
const HAS_MIGRATION_SOURCE = existsSync(MIGRATION_PATH);
const MIGRATION = HAS_MIGRATION_SOURCE ? readFileSync(MIGRATION_PATH, "utf8") : "";

describe("F1 Project Manager ownership and shipment Cash on Board", () => {
  it("requires PM project permission for contract, cycle, and CoB business writes", () => {
    for (const route of [
      'app.post("/api/v1/contracts", requireAuth',
      'app.patch("/api/v1/contracts/:id", requireAuth',
      'app.post("/api/v1/contract-programs", requireAuth',
      'app.post("/api/v1/projects/:projectId/contract-programs", requireAuth',
      'app.post("/api/v1/cycle-policies", requireAuth',
      'app.patch("/api/v1/cycle-policies/:id", requireAuth',
      'app.post("/api/v1/projects/:projectId/shipments/:shipmentId/cob-cycle", requireAuth',
    ]) {
      const start = INDEX.indexOf(route);
      expect(start, route + " should exist").toBeGreaterThanOrEqual(0);
      const signature = INDEX.slice(start, start + 3000);
      expect(signature).toContain("requireProjectPermission");
      expect(signature).not.toMatch(/requireAuth\s*,\s*requireAdmin/);
    }
  });

  it("keeps platform Admin limited to initial Project setup", () => {
    expect(INDEX).toMatch(/app\.post\("\/api\/v1\/projects",\s*requireAuth,\s*requireAdmin/);
    expect(INDEX).toContain("Contract Programs are created by the Project Manager after Project setup.");
    expect(INDEX).toContain('project.configuration.manage",\n      "contract.view"');
  });

  it("isolates Project Manager access to an active Project membership", () => {
    const now = new Date("2026-11-19T00:00:00.000Z");
    const common = { accountActive: true, projectActive: true, membershipActive: true, projectRoleCode: "pm", now };
    expect(canManageProjectBusiness(common)).toBe(true);
    expect(canManageProjectBusiness({ ...common, projectRoleCode: "finance" })).toBe(false);
    expect(canManageProjectBusiness({ ...common, projectRoleCode: "admin" })).toBe(false);
    expect(canManageProjectBusiness({ ...common, membershipActive: false })).toBe(false);
    expect(canManageProjectBusiness({ ...common, accountActive: false })).toBe(false);
    expect(canManageProjectBusiness({ ...common, projectActive: false })).toBe(false);
    expect(canManageProjectBusiness({ ...common, expiresAt: "2026-11-18T23:59:59.000Z" })).toBe(false);
  });

  it("accepts only finite positive contract and shipment amounts", () => {
    for (const value of [1, 2500, "125.50"]) expect(isPositiveQuantity(value)).toBe(true);
    for (const value of [0, -1, "-0.01", "", "abc", null, undefined, Infinity, NaN]) expect(isPositiveQuantity(value)).toBe(false);
  });

  it("requires full settlement before a CoB cycle is paid", () => {
    expect(isCobCyclePaid("100.00", "100.00")).toBe(true);
    expect(isCobCyclePaid(100, 99.99)).toBe(false);
    expect(isCobCyclePaid(100, 0)).toBe(false);
    expect(isCobCyclePaid(0, 0)).toBe(false);
    expect(INDEX).toContain("payment_trigger_event");
    expect(INDEX).toContain("'cash_on_board'");
  });

  it.skipIf(!HAS_MIGRATION_SOURCE)("enforces one CoB obligation per shipment and Project in the database", () => {
    expect(MIGRATION).toContain("payment_obligations_project_shipment_unique");
    expect(MIGRATION).toContain("FOREIGN KEY (project_id, shipment_id)");
    expect(MIGRATION).toContain("payment_obligations_cob_paid_full_check");
    expect(MIGRATION).toContain("DROP POLICY IF EXISTS pke_admin_all ON public.contracts");
    expect(MIGRATION).toContain("DROP POLICY IF EXISTS pke_admin_all ON public.payment_obligations");
  });

  it.skipIf(!HAS_MIGRATION_SOURCE)("prevents the generic platform Admin permission shortcut from bypassing Project business RLS", () => {
    expect(MIGRATION.match(/NOT public\.pke_is_platform_admin\(\) AND public\.pke_has_project_permission/g)?.length).toBeGreaterThanOrEqual(10);
    expect(MIGRATION).toContain("CREATE POLICY pke_payment_obligations_project_select");
    expect(MIGRATION).toContain("CREATE POLICY pke_payment_obligations_project_insert");
    expect(MIGRATION).toContain("CREATE POLICY pke_payment_obligations_project_update");
    expect(MIGRATION).toContain("CREATE POLICY pke_payment_obligations_project_delete");
  });

  it("implements Finance reporting only and routes report notifications to PM and Admin", () => {
    expect(INDEX).toContain('app.post("/api/v1/finance/reports"');
    expect(INDEX).toContain('app.get("/api/v1/finance/reports"');
    expect(INDEX).toContain("FINANCE_ROLE_REQUIRED");
    expect(INDEX).toContain("pr.role_code = 'finance'");
    expect(INDEX).toContain("pr.role_code = 'pm'");
    expect(INDEX).toContain("role::text = 'admin'");
    expect(INDEX).toContain("PAYMENT_EXECUTION_OUT_OF_SCOPE");
    expect(INDEX).not.toContain("PAYMENT_WORKFLOW_NOT_IMPLEMENTED");
    expect(INDEX).toContain('"reports.create"');
  });

  it("keeps payment execution explicitly outside the reporting-only Finance scope", () => {
    expect(INDEX).toContain("PAYMENT_EXECUTION_OUT_OF_SCOPE");
    expect(INDEX).not.toContain("PAYMENT_WORKFLOW_NOT_IMPLEMENTED");
    expect(INDEX).toContain('financeScope: "reporting_only"');
  });

  it.skipIf(!HAS_MIGRATION_SOURCE)("does not use a calendar period as the shipment cycle identity", () => {
    expect(INDEX).toContain('"/api/v1/projects/:projectId/shipments/:shipmentId/cob-cycle"');
    expect(MIGRATION).toContain("UNIQUE INDEX IF NOT EXISTS payment_obligations_project_shipment_unique");
  });
});

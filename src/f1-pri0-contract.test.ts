import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { CANONICAL_ROLE_TEMPLATES, getCanonicalRoleTemplate, listProjectRoleTemplates } from "./role-catalogue.js";

const INDEX_SRC = readFileSync(new URL("./index.ts", import.meta.url), "utf8");

describe("F1 / PRI-0 canonical role governance", () => {
  it("has a unique centrally governed role catalogue with Project and platform scopes", () => {
    const codes = CANONICAL_ROLE_TEMPLATES.map((item) => item.code);
    expect(codes.length).toBeGreaterThanOrEqual(34);
    expect(new Set(codes).size).toBe(codes.length);
    expect(getCanonicalRoleTemplate("platform_admin")?.scope).toBe("platform");
    expect(getCanonicalRoleTemplate("project_admin")?.scope).toBe("project");
    expect(getCanonicalRoleTemplate("admin")).toBeNull();
    expect(listProjectRoleTemplates().some((item) => item.code === "platform_admin")).toBe(false);
  });

  it("keeps template activation separate from user assignment", () => {
    expect(INDEX_SRC).toContain('app.get("/api/v1/role-templates"');
    expect(INDEX_SRC).toContain('app.post("/api/v1/projects/:id/role-templates/:roleCode/activate"');
    expect(INDEX_SRC).toContain("assignedUsers: 0");
    expect(INDEX_SRC).toContain('app.post("/api/v1/admin/projects/:projectId/pm-appointment"');
    expect(INDEX_SRC).toContain("PM_HANDOVER_CONFIRMATION_REQUIRED");
    expect(INDEX_SRC).toContain("MULTI_ROLE_SCHEMA_PENDING");
  });

  it("does not grant payment execution permissions through canonical role templates", () => {
    const forbidden = new Set([
      "payment.instruction.issue",
      "payment.approve",
      "payment.reconcile",
      "payment.evidence.verify",
    ]);
    for (const template of CANONICAL_ROLE_TEMPLATES) {
      for (const permission of template.permissionCodes) {
        expect(forbidden.has(permission), `${template.code} must not receive ${permission}`).toBe(false);
      }
    }
  });

  it("uses Project role assignment as the audit role source after permission authorization", () => {
    expect(INDEX_SRC).toContain("assignmentRows[0].role_code");
    expect(INDEX_SRC).toContain("app.current_project_role_id");
    expect(INDEX_SRC).toContain("PROJECT_ROLE_ASSIGNMENT_REQUIRED");
  });
});

describe("F1 / PRI-0 inventory API contract", () => {
  it("uses the live inventory_reservations column contract", () => {
    const start = INDEX_SRC.indexOf('app.post("/api/v1/inventory-reservations"');
    const end = INDEX_SRC.indexOf("// Inventory holds", start);
    const block = INDEX_SRC.slice(start, end);
    expect(block).toContain("unit_code");
    expect(block).toContain("buyer_id");
    expect(block).toContain("shipment_id");
    expect(block).toContain("created_by");
    expect(block).not.toContain("reference_id");
    expect(block).not.toContain("reference_type");
    expect(block).not.toContain("reserved_quantity, unit,");
  });

  it("keeps reservation release and expiry fail-closed until release_reason migration exists", () => {
    expect(INDEX_SRC).toContain('app.patch("/api/v1/inventory-reservations/:id/release"');
    expect(INDEX_SRC).toContain('app.patch("/api/v1/inventory-reservations/:id/expire"');
    expect(INDEX_SRC).toContain("RESERVATION_SCHEMA_MIGRATION_PENDING");
    expect(INDEX_SRC).toContain("release_reason = $3::text");
  });

  it("creates shipment allocations as draft against an exact reservation and shipment", () => {
    const start = INDEX_SRC.indexOf('app.post("/api/v1/shipment-allocations"');
    const end = INDEX_SRC.indexOf('app.patch("/api/v1/shipment-allocations/:id"', start);
    const block = INDEX_SRC.slice(start, end);
    expect(block).toContain("shipment_id");
    expect(block).toContain("reservation_id");
    expect(block).toContain("'draft'");
    expect(block).not.toContain("reference_id");
    expect(block).not.toContain("status, reversal_reason");
  });

  it("does not mutate reservation fulfillment counters from the API", () => {
    expect(INDEX_SRC).not.toMatch(/UPDATE inventory_reservations\s+SET fulfilled_quantity/i);
    expect(INDEX_SRC).toContain("ALLOCATION_TRANSITION_REJECTED");
  });
});

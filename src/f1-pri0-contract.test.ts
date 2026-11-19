import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { CANONICAL_ROLE_TEMPLATES, getCanonicalRoleTemplate, listProjectRoleTemplates } from "./role-catalogue.js";
import { validateAllocationCapacity, validateAllocationTransition } from "./f1-pri0-inventory-rules.js";
import { evaluatePmAppointment, isEffectiveProjectRoleAssignment, validateRoleAssignmentExpiry } from "./f1-role-assignment-rules.js";

const INDEX_SRC = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
const ROLE_ASSIGNMENT_MIGRATION_SRC = readFileSync(new URL("../migrations/043_project_role_assignments_and_history.sql", import.meta.url), "utf8");
const FRONTEND_APP_SRC = readFileSync(new URL("../frontend/src/App.tsx", import.meta.url), "utf8");
const ROLE_ASSIGNMENT_RULES_SRC = readFileSync(new URL("./f1-role-assignment-rules.ts", import.meta.url), "utf8");

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
    expect(INDEX_SRC).toContain("evaluatePmAppointment");
    expect(INDEX_SRC).toContain("USE_ROLE_ASSIGNMENT_ENDPOINT");
    expect(INDEX_SRC).toContain("PM_ADMIN_DECISION_REQUIRED");
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

describe("F1 / PRI-0 inventory mock backtest", () => {
  const capacityBase = {
    projectId: "project-a",
    shipmentProjectId: "project-a",
    lotProjectId: "project-a",
    reservationProjectId: "project-a",
    reservationLotId: "lot-a",
    lotId: "lot-a",
    reservationShipmentId: "shipment-a",
    shipmentId: "shipment-a",
    reservationStatus: "active",
    reservationQuantity: 100,
    existingReservationAllocations: 20,
    shipmentQuantity: 80,
    existingShipmentAllocations: 10,
    allocationQuantity: 30,
    unitMatches: true,
  } as const;

  it("accepts allocation when Project, shipment, lot, reservation, unit and both capacities match", () => {
    expect(validateAllocationCapacity({ ...capacityBase })).toEqual({ ok: true });
  });

  it("rejects reservation over-allocation without double-subtracting fulfilled quantity", () => {
    expect(validateAllocationCapacity({ ...capacityBase, existingReservationAllocations: 80 }).code)
      .toBe("RESERVATION_QUANTITY_EXCEEDED");
    // Fulfilled quantity is intentionally not part of the allocation capacity formula:
    // loaded allocations are already counted in existingReservationAllocations.
  });

  it("rejects shipment over-allocation", () => {
    expect(validateAllocationCapacity({ ...capacityBase, existingShipmentAllocations: 60 }).code)
      .toBe("SHIPMENT_QUANTITY_EXCEEDED");
  });

  it("rejects cross-Project shipment/lot/reservation combinations", () => {
    expect(validateAllocationCapacity({ ...capacityBase, shipmentProjectId: "project-b" }).code)
      .toBe("PROJECT_SCOPE_MISMATCH");
    expect(validateAllocationCapacity({ ...capacityBase, reservationLotId: "lot-b" }).code)
      .toBe("RESERVATION_SCOPE_MISMATCH");
  });

  it("rejects inactive reservations and unit mismatches", () => {
    expect(validateAllocationCapacity({ ...capacityBase, reservationStatus: "released" }).code)
      .toBe("RESERVATION_NOT_ACTIVE");
    expect(validateAllocationCapacity({ ...capacityBase, unitMatches: false }).code)
      .toBe("UNIT_MISMATCH");
  });

  it("permits only valid draft-to-load and reversal transitions", () => {
    expect(validateAllocationTransition({
      currentStatus: "draft", nextStatus: "allocated",
      currentLoadedQuantity: 0, allocatedQuantity: 30,
    })).toEqual({ ok: true });
    expect(validateAllocationTransition({
      currentStatus: "allocated", nextStatus: "partially_loaded",
      currentLoadedQuantity: 0, nextLoadedQuantity: 10, allocatedQuantity: 30,
    })).toEqual({ ok: true });
    expect(validateAllocationTransition({
      currentStatus: "partially_loaded", nextStatus: "loaded",
      currentLoadedQuantity: 10, nextLoadedQuantity: 30, allocatedQuantity: 30,
    })).toEqual({ ok: true });
    expect(validateAllocationTransition({
      currentStatus: "loaded", nextStatus: "reversed",
      currentLoadedQuantity: 30, allocatedQuantity: 30, reversalReason: "Duplicate shipment entry",
    })).toEqual({ ok: true });
  });

  it("rejects invalid state jumps, missing reversal reason and loaded quantity changes without state", () => {
    expect(validateAllocationTransition({
      currentStatus: "draft", nextStatus: "loaded",
      currentLoadedQuantity: 0, nextLoadedQuantity: 30, allocatedQuantity: 30,
    }).code).toBe("INVALID_ALLOCATION_TRANSITION");
    expect(validateAllocationTransition({
      currentStatus: "loaded", nextStatus: "cancelled",
      currentLoadedQuantity: 30, allocatedQuantity: 30,
    }).code).toBe("INVALID_ALLOCATION_TRANSITION");
    expect(validateAllocationTransition({
      currentStatus: "partially_loaded", nextStatus: "reversed",
      currentLoadedQuantity: 10, allocatedQuantity: 30,
    }).code).toBe("REVERSAL_REASON_REQUIRED");
    expect(validateAllocationTransition({
      currentStatus: "allocated", nextLoadedQuantity: 5,
      currentLoadedQuantity: 0, allocatedQuantity: 30,
    }).code).toBe("STATUS_REQUIRED_FOR_LOADING");
  });

  it("rejects non-positive, non-finite and over-allocated loaded quantities", () => {
    expect(validateAllocationTransition({
      currentStatus: "allocated", nextStatus: "partially_loaded",
      currentLoadedQuantity: 0, nextLoadedQuantity: 0, allocatedQuantity: 30,
    }).code).toBe("INVALID_ALLOCATION_TRANSITION");
    expect(validateAllocationTransition({
      currentStatus: "allocated", nextStatus: "loaded",
      currentLoadedQuantity: 0, nextLoadedQuantity: 31, allocatedQuantity: 30,
    }).code).toBe("INVALID_LOADED_QUANTITY");
  });
});


describe("F1 / PRI-0 independent Project role assignment contract", () => {
  it("resolves Project permission and audit attribution from active independent assignments", () => {
    const start = INDEX_SRC.indexOf("async function requireProjectPermission(");
    const end = INDEX_SRC.indexOf("async function getProjectOr404(", start);
    const block = INDEX_SRC.slice(start, end);
    expect(block).toContain("FROM public.project_role_assignments a");
    expect(block).toContain("a.revoked_at IS NULL");
    expect(block).toContain("a.expires_at > now()");
    expect(block).toContain("assignmentRows[0].project_role_id");
    expect(INDEX_SRC).toContain("validateRoleAssignmentExpiry(expiresAt)");
    expect(ROLE_ASSIGNMENT_RULES_SRC).toContain("Date.parse(expiresAt) <= nowMs");
    expect(INDEX_SRC).toContain("?.roleCode ?? null");
    expect(INDEX_SRC).toContain("?.roleName ?? null");
    expect(ROLE_ASSIGNMENT_MIGRATION_SRC).toContain("An active role assignment must expire in the future");
  });

  it("supports multiple role assignments with independent creation and revocation endpoints", () => {
    expect(INDEX_SRC).toContain('app.post("/api/v1/projects/:id/members/:memberId/role-assignments"');
    expect(INDEX_SRC).toContain('app.post("/api/v1/projects/:id/role-assignments/:assignmentId/revoke"');
    expect(ROLE_ASSIGNMENT_MIGRATION_SRC).toContain("project_role_assignment_events");
    expect(INDEX_SRC).toContain("role_assignments");
  });

  it("keeps PM appointment and deactivation under explicit Platform Admin control", () => {
    expect(INDEX_SRC).toContain('app.post("/api/v1/admin/projects/:projectId/pm-appointment"');
    expect(INDEX_SRC).toContain('app.post("/api/v1/admin/projects/:projectId/pm-appointment/:userId/deactivate"');
    expect(INDEX_SRC).toContain("project.pm.deactivated");
    expect(INDEX_SRC).toContain("membershipPreserved: true");
    expect(INDEX_SRC).toContain("MULTIPLE_ACTIVE_PM_ASSIGNMENTS");
  });

  it("does not overwrite a member's legacy role when appointing a PM", () => {
    const start = INDEX_SRC.indexOf('app.post("/api/v1/admin/projects/:projectId/pm-appointment"');
    const end = INDEX_SRC.indexOf('app.post("/api/v1/admin/projects/:projectId/pm-appointment/:userId/deactivate"', start);
    const block = INDEX_SRC.slice(start, end);
    expect(block).toContain("INSERT INTO public.project_role_assignments");
    expect(block).not.toContain("SET project_role_id = $3::uuid");
  });
});


describe("F1 / PRI-0 multi-role Admin UI contract", () => {
  it("renders multiple role assignments separately from Project membership status", () => {
    expect(FRONTEND_APP_SRC).toContain("Role assignments");
    expect(FRONTEND_APP_SRC).toContain("r.role_assignments");
    expect(FRONTEND_APP_SRC).toContain("Status membership");
    expect(FRONTEND_APP_SRC).not.toContain("value={r.project_role_id || ''}");
  });

  it("routes PM deactivation to the explicit Admin decision endpoint", () => {
    expect(FRONTEND_APP_SRC).toContain("/pm-appointment/${member.user_id}/deactivate");
    expect(FRONTEND_APP_SRC).toContain("Keanggotaan dan role lain tetap dipertahankan.");
    expect(FRONTEND_APP_SRC).toContain("/admin/projects/${selectedProjectId}/pm-appointment");
    expect(FRONTEND_APP_SRC).toContain("Tunjuk Project Manager");
    expect(FRONTEND_APP_SRC).toContain("Masa berlaku role (opsional)");
    expect(FRONTEND_APP_SRC).toContain("expiresAt: new Date(memberAddExpiresAt).toISOString()");
    expect(FRONTEND_APP_SRC).toContain("role.role_code !== 'pm'");
  });
});


describe("F1 / PRI-0 multi-role security backtest", () => {
  it("does not expose a user-settable migration bypass for assignment guards", () => {
    expect(ROLE_ASSIGNMENT_MIGRATION_SRC).not.toContain("app.migration_context");
    expect(ROLE_ASSIGNMENT_MIGRATION_SRC).toContain("pke_is_platform_admin()");
    expect(ROLE_ASSIGNMENT_MIGRATION_SRC).toContain("pg_advisory_xact_lock");
  });

  it("backfills every legacy membership role before installing runtime assignment guards", () => {
    const backfillMarker = ROLE_ASSIGNMENT_MIGRATION_SRC.indexOf("-- Preserve every existing legacy role assignment");
    const backfillAt = ROLE_ASSIGNMENT_MIGRATION_SRC.indexOf("INSERT INTO public.project_role_assignments", backfillMarker);
    const guardTriggerAt = ROLE_ASSIGNMENT_MIGRATION_SRC.indexOf("CREATE TRIGGER trg_project_role_assignment_guard");
    const eventTriggerAt = ROLE_ASSIGNMENT_MIGRATION_SRC.indexOf("CREATE TRIGGER trg_project_role_assignment_event\nAFTER INSERT OR UPDATE");
    expect(backfillAt).toBeGreaterThan(-1);
    expect(guardTriggerAt).toBeGreaterThan(backfillAt);
    expect(eventTriggerAt).toBeGreaterThan(backfillAt);
    expect(ROLE_ASSIGNMENT_MIGRATION_SRC).toContain("'legacy_backfill'");
    expect(ROLE_ASSIGNMENT_MIGRATION_SRC).toContain("No PM is selected, revoked, or replaced");
  });

  it("enforces Project and membership identity, unique active same-role assignment, and immutable event history", () => {
    expect(ROLE_ASSIGNMENT_MIGRATION_SRC).toContain("FOREIGN KEY (project_role_id, project_id)");
    expect(ROLE_ASSIGNMENT_MIGRATION_SRC).toContain("uq_project_role_assignments_member_role_active");
    expect(ROLE_ASSIGNMENT_MIGRATION_SRC).toContain("project_role_assignment_event_immutable");
    expect(ROLE_ASSIGNMENT_MIGRATION_SRC).toContain("REVOKE INSERT, UPDATE, DELETE ON public.project_role_assignment_events");
  });

  it("does not allow Project roles to create or revoke PM assignments", () => {
    const createStart = INDEX_SRC.indexOf('app.post("/api/v1/projects/:id/members/:memberId/role-assignments"');
    const revokeStart = INDEX_SRC.indexOf('app.post("/api/v1/projects/:id/role-assignments/:assignmentId/revoke"');
    const inviteStart = INDEX_SRC.indexOf('app.post("/api/v1/projects/:id/members/invite"');
    const createBlock = INDEX_SRC.slice(createStart, revokeStart);
    const revokeBlock = INDEX_SRC.slice(revokeStart, inviteStart);
    expect(createBlock).toContain("PM_ADMIN_DECISION_REQUIRED");
    expect(revokeBlock).toContain("PM_ADMIN_DECISION_REQUIRED");
    expect(ROLE_ASSIGNMENT_MIGRATION_SRC).toContain("PM role assignment and revocation require an explicit Platform Admin decision");
    expect(ROLE_ASSIGNMENT_MIGRATION_SRC).toContain("PM appointments cannot be accepted through invitations");
    const inviteRouteStart = INDEX_SRC.indexOf('app.post("/api/v1/projects/:id/members/invite"');
    const inviteRouteEnd = INDEX_SRC.indexOf('app.patch("/api/v1/projects/:id/members/:memberId"', inviteRouteStart);
    expect(INDEX_SRC.slice(inviteRouteStart, inviteRouteEnd)).toContain("PM_ADMIN_DECISION_REQUIRED");
  });

  it("keeps membership lifecycle separate from role lifecycle", () => {
    const start = INDEX_SRC.indexOf('app.patch("/api/v1/projects/:id/members/:memberId"');
    const end = INDEX_SRC.indexOf('app.post("/api/v1/projects/:id/members/:memberId/revoke"', start);
    const block = INDEX_SRC.slice(start, end);
    expect(block).toContain("USE_ROLE_ASSIGNMENT_ENDPOINT");
    expect(block).toContain("SET is_active = $3::boolean");
    expect(block).not.toContain("SET project_role_id");
  });

  it("updates all database-side permission and invitation paths to use assignments", () => {
    expect(ROLE_ASSIGNMENT_MIGRATION_SRC).toContain("CREATE OR REPLACE FUNCTION public.pke_has_any_project_permission");
    expect(ROLE_ASSIGNMENT_MIGRATION_SRC).toContain("CREATE OR REPLACE FUNCTION public.pke_can_receive_finance_report_notification");
    expect(ROLE_ASSIGNMENT_MIGRATION_SRC).toContain("CREATE OR REPLACE FUNCTION public.accept_pke_project_invitation");
    expect(ROLE_ASSIGNMENT_MIGRATION_SRC).toContain("FROM public.project_role_assignments a");
  });
});


describe("F1 / PRI-0 multi-role behavioral backtest", () => {
  const now = Date.parse("2026-11-19T12:00:00.000Z");
  const membership = {
    id: "membership-a", project_id: "project-a", user_id: "user-a",
    is_active: true, deactivated_at: null, expires_at: null, project_is_active: true,
  };

  it("allows concurrent distinct role assignments for one Project membership", () => {
    const finance = {
      project_id: "project-a", project_member_id: "membership-a", user_id: "user-a",
      is_active: true, revoked_at: null, expires_at: null, role_is_active: true,
    };
    const warehouse = { ...finance, role_is_active: true };
    expect(isEffectiveProjectRoleAssignment(finance, membership, now)).toBe(true);
    expect(isEffectiveProjectRoleAssignment(warehouse, membership, now)).toBe(true);
  });

  it("expires and revokes one role without deactivating another role or the membership", () => {
    const activeFinance = { project_id: "project-a", project_member_id: "membership-a", user_id: "user-a", is_active: true, revoked_at: null, expires_at: null };
    const expiredWarehouse = { ...activeFinance, expires_at: "2026-11-19T11:59:59.000Z" };
    const revokedChecker = { ...activeFinance, revoked_at: "2026-11-19T11:00:00.000Z" };
    expect(isEffectiveProjectRoleAssignment(activeFinance, membership, now)).toBe(true);
    expect(isEffectiveProjectRoleAssignment(expiredWarehouse, membership, now)).toBe(false);
    expect(isEffectiveProjectRoleAssignment(revokedChecker, membership, now)).toBe(false);
    expect(membership.is_active).toBe(true);
  });

  it("denies every role when the membership or Project is inactive/expired", () => {
    const assignment = { project_id: "project-a", project_member_id: "membership-a", user_id: "user-a", is_active: true, revoked_at: null, expires_at: null };
    expect(isEffectiveProjectRoleAssignment(assignment, { ...membership, is_active: false }, now)).toBe(false);
    expect(isEffectiveProjectRoleAssignment(assignment, { ...membership, expires_at: "2026-11-19T11:59:00.000Z" }, now)).toBe(false);
    expect(isEffectiveProjectRoleAssignment(assignment, { ...membership, project_is_active: false }, now)).toBe(false);
  });

  it("rejects cross-Project or cross-user assignment context", () => {
    const assignment = { project_id: "project-b", project_member_id: "membership-a", user_id: "user-a", is_active: true, revoked_at: null };
    expect(isEffectiveProjectRoleAssignment(assignment, membership, now)).toBe(false);
    expect(isEffectiveProjectRoleAssignment({ ...assignment, project_id: "project-a", user_id: "user-b" }, membership, now)).toBe(false);
  });

  it("requires future expiry and accepts an open-ended assignment", () => {
    expect(validateRoleAssignmentExpiry(null, now)).toEqual({ ok: true, value: null });
    expect(validateRoleAssignmentExpiry("not-a-date", now)).toEqual({ ok: false, code: "INVALID_ROLE_EXPIRY" });
    expect(validateRoleAssignmentExpiry("2026-11-19T12:00:00.000Z", now)).toEqual({ ok: false, code: "ROLE_EXPIRY_MUST_BE_FUTURE" });
    expect(validateRoleAssignmentExpiry("2026-11-20T12:00:00.000Z", now)).toEqual({ ok: true, value: "2026-11-20T12:00:00.000Z" });
  });

  it("does not choose among duplicate PMs and requires explicit Admin handover identity", () => {
    expect(evaluatePmAppointment([{ user_id: "pm-a" }, { user_id: "pm-b" }], "pm-c", "pm-a"))
      .toEqual({ ok: false, code: "MULTIPLE_ACTIVE_PM_ASSIGNMENTS" });
    expect(evaluatePmAppointment([{ user_id: "pm-a" }], "pm-b", null))
      .toEqual({ ok: false, code: "PM_HANDOVER_CONFIRMATION_REQUIRED" });
    expect(evaluatePmAppointment([{ user_id: "pm-a" }], "pm-b", "pm-a"))
      .toEqual({ ok: true, idempotent: false, handoverFromUserId: "pm-a" });
    expect(evaluatePmAppointment([{ user_id: "pm-a" }], "pm-a", null))
      .toEqual({ ok: true, idempotent: true, handoverFromUserId: null });
  });
});

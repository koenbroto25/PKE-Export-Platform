import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  evaluatePmAppointment,
  isEffectiveProjectRoleAssignment,
  validateRoleAssignmentExpiry,
} from "./f1-role-assignment-rules.js";

const INDEX = readFileSync(fileURLToPath(new URL("./index.ts", import.meta.url)), "utf8");

describe("F1 independent Project role assignments", () => {
  const now = new Date("2026-11-19T12:00:00.000Z").getTime();
  const assignment = {
    project_id: "project-a",
    user_id: "user-a",
    project_member_id: "member-a",
    is_active: true,
    revoked_at: null,
    expires_at: "2026-11-20T12:00:00.000Z",
    role_is_active: true,
  };
  const membership = {
    id: "member-a",
    project_id: "project-a",
    user_id: "user-a",
    is_active: true,
    deactivated_at: null,
    expires_at: null,
    project_is_active: true,
  };

  it("accepts only a matching, active, unrevoked, unexpired assignment and membership", () => {
    expect(isEffectiveProjectRoleAssignment(assignment, membership, now)).toBe(true);
    expect(isEffectiveProjectRoleAssignment({ ...assignment, project_id: "project-b" }, membership, now)).toBe(false);
    expect(isEffectiveProjectRoleAssignment({ ...assignment, user_id: "user-b" }, membership, now)).toBe(false);
    expect(isEffectiveProjectRoleAssignment({ ...assignment, project_member_id: "member-b" }, membership, now)).toBe(false);
    expect(isEffectiveProjectRoleAssignment({ ...assignment, is_active: false }, membership, now)).toBe(false);
    expect(isEffectiveProjectRoleAssignment({ ...assignment, revoked_at: "2026-11-19T11:00:00.000Z" }, membership, now)).toBe(false);
    expect(isEffectiveProjectRoleAssignment({ ...assignment, role_is_active: false }, membership, now)).toBe(false);
    expect(isEffectiveProjectRoleAssignment({ ...assignment, expires_at: "2026-11-19T11:59:59.999Z" }, membership, now)).toBe(false);
    expect(isEffectiveProjectRoleAssignment({ ...assignment, expires_at: "not-a-date" }, membership, now)).toBe(false);
  });

  it("rejects inactive, deactivated, expired, or inactive-Project memberships", () => {
    expect(isEffectiveProjectRoleAssignment(assignment, { ...membership, is_active: false }, now)).toBe(false);
    expect(isEffectiveProjectRoleAssignment(assignment, { ...membership, deactivated_at: "2026-11-19T11:00:00.000Z" }, now)).toBe(false);
    expect(isEffectiveProjectRoleAssignment(assignment, { ...membership, expires_at: "2026-11-19T11:59:59.999Z" }, now)).toBe(false);
    expect(isEffectiveProjectRoleAssignment(assignment, { ...membership, project_is_active: false }, now)).toBe(false);
  });

  it("validates optional expiry as either absent or a valid future timestamp", () => {
    expect(validateRoleAssignmentExpiry(null, now)).toEqual({ ok: true, value: null });
    expect(validateRoleAssignmentExpiry(undefined, now)).toEqual({ ok: true, value: null });
    expect(validateRoleAssignmentExpiry("", now)).toEqual({ ok: true, value: null });
    expect(validateRoleAssignmentExpiry("2026-11-20T12:00:00.000Z", now)).toEqual({ ok: true, value: "2026-11-20T12:00:00.000Z" });
    expect(validateRoleAssignmentExpiry("not-a-date", now)).toEqual({ ok: false, code: "INVALID_ROLE_EXPIRY" });
    expect(validateRoleAssignmentExpiry(12345, now)).toEqual({ ok: false, code: "INVALID_ROLE_EXPIRY" });
    expect(validateRoleAssignmentExpiry("2026-11-19T12:00:00.000Z", now)).toEqual({ ok: false, code: "ROLE_EXPIRY_MUST_BE_FUTURE" });
    expect(validateRoleAssignmentExpiry("2026-11-19T11:59:59.999Z", now)).toEqual({ ok: false, code: "ROLE_EXPIRY_MUST_BE_FUTURE" });
  });

  it("requires exact PM handover confirmation and blocks ambiguous multiple incumbents", () => {
    expect(evaluatePmAppointment([], "candidate", null)).toEqual({
      ok: true, idempotent: false, handoverFromUserId: null,
    });
    expect(evaluatePmAppointment([{ user_id: "candidate" }], "candidate", null)).toEqual({
      ok: true, idempotent: true, handoverFromUserId: null,
    });
    expect(evaluatePmAppointment([{ user_id: "current" }], "candidate", null)).toEqual({
      ok: false, code: "PM_HANDOVER_CONFIRMATION_REQUIRED",
    });
    expect(evaluatePmAppointment([{ user_id: "current" }], "candidate", "other")).toEqual({
      ok: false, code: "PM_HANDOVER_CONFIRMATION_REQUIRED",
    });
    expect(evaluatePmAppointment([{ user_id: "current" }], "candidate", "current")).toEqual({
      ok: true, idempotent: false, handoverFromUserId: "current",
    });
    expect(evaluatePmAppointment([{ user_id: "one" }, { user_id: "two" }], "candidate", "one")).toEqual({
      ok: false, code: "MULTIPLE_ACTIVE_PM_ASSIGNMENTS",
    });
  });

  it("keeps PM appointment/deactivation behind Platform Admin and independent of ordinary role endpoints", () => {
    expect(INDEX).toMatch(/app\.post\("\/api\/v1\/admin\/projects\/:projectId\/pm-appointment",\s*requireAuth,\s*requireAdmin/);
    expect(INDEX).toMatch(/app\.post\("\/api\/v1\/admin\/projects\/:projectId\/pm-appointment\/:userId\/deactivate",\s*requireAuth,\s*requireAdmin/);
    const ordinaryAssign = INDEX.slice(INDEX.indexOf('app.post("/api/v1/projects/:id/members/:memberId/role-assignments"'));
    expect(ordinaryAssign).toContain('"project.members.manage"');
    expect(ordinaryAssign).toContain('roleRows[0].role_code === "pm"');
    const revoke = INDEX.slice(INDEX.indexOf('app.post("/api/v1/projects/:id/role-assignments/:assignmentId/revoke"'));
    expect(revoke).toContain("reason.length < 5");
    expect(revoke).toContain('targetRows[0].role_code === "pm"');
    expect(INDEX).toContain("evaluatePmAppointment(currentRows, userId, replaceUserId || null)");
    expect(INDEX).toContain("MULTIPLE_ACTIVE_PM_ASSIGNMENTS");
    expect(INDEX).toContain("set_config('app.current_user_id', $1::text, true)");
  });
});

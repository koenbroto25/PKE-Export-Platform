export interface RoleAssignmentSnapshot {
  project_id?: string;
  user_id?: string;
  project_member_id?: string;
  is_active?: boolean;
  revoked_at?: string | Date | null;
  expires_at?: string | Date | null;
  role_is_active?: boolean;
}

export interface MembershipSnapshot {
  id?: string;
  project_id?: string;
  user_id?: string;
  is_active?: boolean;
  deactivated_at?: string | Date | null;
  expires_at?: string | Date | null;
  project_is_active?: boolean;
}

function timestamp(value: string | Date | null | undefined): number | null {
  if (value == null || value === "") return null;
  const parsed = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export function isEffectiveProjectRoleAssignment(
  assignment: RoleAssignmentSnapshot,
  membership: MembershipSnapshot,
  nowMs = Date.now(),
): boolean {
  const assignmentExpiry = timestamp(assignment.expires_at);
  const membershipExpiry = timestamp(membership.expires_at);
  if (Number.isNaN(assignmentExpiry) || Number.isNaN(membershipExpiry)) return false;
  if (assignment.project_id && membership.project_id && assignment.project_id !== membership.project_id) return false;
  if (assignment.user_id && membership.user_id && assignment.user_id !== membership.user_id) return false;
  if (assignment.project_member_id && membership.id && assignment.project_member_id !== membership.id) return false;
  return assignment.is_active === true &&
    assignment.revoked_at == null &&
    (assignment.role_is_active ?? true) === true &&
    (assignmentExpiry === null || assignmentExpiry > nowMs) &&
    membership.is_active === true &&
    membership.deactivated_at == null &&
    membership.project_is_active !== false &&
    (membershipExpiry === null || membershipExpiry > nowMs);
}

export function validateRoleAssignmentExpiry(
  expiresAt: unknown,
  nowMs = Date.now(),
): { ok: true; value: string | null } | { ok: false; code: "INVALID_ROLE_EXPIRY" | "ROLE_EXPIRY_MUST_BE_FUTURE" } {
  if (expiresAt === null || expiresAt === undefined || expiresAt === "") return { ok: true, value: null };
  if (typeof expiresAt !== "string" || !Number.isFinite(Date.parse(expiresAt))) {
    return { ok: false, code: "INVALID_ROLE_EXPIRY" };
  }
  if (Date.parse(expiresAt) <= nowMs) return { ok: false, code: "ROLE_EXPIRY_MUST_BE_FUTURE" };
  return { ok: true, value: expiresAt };
}

export function evaluatePmAppointment(
  activePmAssignments: Array<{ user_id: string }>,
  candidateUserId: string,
  replaceUserId: string | null | undefined,
): { ok: true; idempotent: boolean; handoverFromUserId: string | null } |
   { ok: false; code: "MULTIPLE_ACTIVE_PM_ASSIGNMENTS" | "PM_HANDOVER_CONFIRMATION_REQUIRED" } {
  if (activePmAssignments.length > 1) {
    return { ok: false, code: "MULTIPLE_ACTIVE_PM_ASSIGNMENTS" };
  }
  const current = activePmAssignments[0] ?? null;
  if (current?.user_id === candidateUserId) {
    return { ok: true, idempotent: true, handoverFromUserId: null };
  }
  if (current && current.user_id !== replaceUserId) {
    return { ok: false, code: "PM_HANDOVER_CONFIRMATION_REQUIRED" };
  }
  return { ok: true, idempotent: false, handoverFromUserId: current?.user_id ?? null };
}

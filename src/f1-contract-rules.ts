export interface F1Principal { isAdmin?: boolean; isActive?: boolean }

export function canManageContractProgram(principal: F1Principal | null | undefined): boolean {
  return principal?.isAdmin === true && principal?.isActive === true;
}

export function isPositiveQuantity(value: unknown): boolean {
  if (value === null || value === undefined || (typeof value === "string" && value.trim() === "")) return false;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0;
}

export function canAccessProjectMembership(input: {
  accountActive: boolean;
  projectActive: boolean;
  membershipActive: boolean;
  deactivatedAt?: string | Date | null;
  expiresAt?: string | Date | null;
  now?: Date;
}): boolean {
  if (!input.accountActive || !input.projectActive || !input.membershipActive || input.deactivatedAt) return false;
  if (input.expiresAt) {
    const expiry = new Date(input.expiresAt).getTime();
    if (!Number.isFinite(expiry) || expiry <= (input.now ?? new Date()).getTime()) return false;
  }
  return true;
}

export function canManageProjectBusiness(input: {
  accountActive: boolean;
  projectActive: boolean;
  membershipActive: boolean;
  projectRoleCode: string | null | undefined;
  deactivatedAt?: string | Date | null;
  expiresAt?: string | Date | null;
  now?: Date;
}): boolean {
  return input.projectRoleCode?.toLowerCase() === "pm" && canAccessProjectMembership(input);
}

export function isCobCyclePaid(amount: unknown, amountPaid: unknown): boolean {
  const total = Number(amount);
  const paid = Number(amountPaid);
  return Number.isFinite(total) && Number.isFinite(paid) && total > 0 && paid === total;
}

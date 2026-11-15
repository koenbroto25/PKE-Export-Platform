import { describe, it, expect } from "vitest";
import {
  requireAdmin,
  requireAdminMfa,
  checkAdminAvailability,
  type UserSession,
} from "./auth";

function mockRes(): any {
  const res: any = {};
  res.status = (code: number) => { res.statusCode = code; return res; };
  res.json = (body: any) => { res.body = body; return res; };
  return res;
}

function makeUser(overrides: Partial<UserSession> = {}): UserSession {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    email: "admin@example.com",
    name: "Admin",
    role: "admin",
    isAdmin: true,
    isActive: true,
    // MFA is deferred per owner decision D-107; server always resolves false.
    mfaVerified: false,
    ...overrides,
  };
}

function nextShouldNotBeCalled(): any {
  return () => { throw new Error("next() should not be called"); };
}

describe("Auth/RBAC MFA deferral (D-107 — initial release)", () => {
  // 5(a): unauthenticated request rejected
  it("rejects request with no authenticated user (requireAdmin)", () => {
    const req: any = { user: undefined };
    const res = mockRes();
    requireAdmin(req, res, nextShouldNotBeCalled());
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toContain("Admin principal required");
  });

  // 5(b): authenticated non-admin rejected
  it("rejects authenticated non-admin user", () => {
    const req: any = { user: makeUser({ isAdmin: false, role: "member" }) };
    const res = mockRes();
    requireAdmin(req, res, nextShouldNotBeCalled());
    expect(res.statusCode).toBe(403);
  });

  // 5(c): valid Admin may run allowed actions without MFA claim (MFA deferred)
  it("allows valid Admin without MFA claim", () => {
    const req: any = { user: makeUser({ mfaVerified: false }) };
    const res = mockRes();
    let called = false;
    const next: any = () => { called = true; };
    requireAdmin(req, res, next);
    expect(called).toBe(true);
    expect(res.statusCode).toBeUndefined();
  });

  // requireAdminMfa gate exists but is NOT mounted on any route (deferred per D-107)
  it("requireAdminMfa rejects when mfaVerified is false (gate present, unused on routes)", () => {
    const req: any = { user: makeUser({ mfaVerified: false }) };
    const res = mockRes();
    requireAdminMfa(req, res, nextShouldNotBeCalled());
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe("MFA_REQUIRED");
  });

  // 5(f): client-supplied mfaVerified does not change authorization outcome
  it("requireAdmin authorization depends on server session, not client MFA claim", () => {
    const req: any = { user: makeUser({ mfaVerified: true }) };
    const res = mockRes();
    let called = false;
    const next: any = () => { called = true; };
    requireAdmin(req, res, next);
    expect(called).toBe(true);
    expect(res.statusCode).toBeUndefined();
  });

  // Suspended admin rejected
  it("rejects suspended admin user", () => {
    const req: any = { user: makeUser({ isActive: false }) };
    const res = mockRes();
    checkAdminAvailability(req, res, nextShouldNotBeCalled());
    expect(res.statusCode).toBe(409);
    expect(res.body.error).toContain("suspended");
  });
});

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const INDEX = readFileSync(join(__dirname, "index.ts"), "utf8");
const APP = readFileSync(join(__dirname, "../frontend/src/App.tsx"), "utf8");
const AUTH = readFileSync(join(__dirname, "../frontend/src/auth-client.ts"), "utf8");
const MIGRATION = readFileSync(join(__dirname, "../migrations/038_admin_managed_neon_auth_user_lifecycle.sql"), "utf8");

function routeBlock(routeStart: string, max = 7000) {
  const i = INDEX.indexOf(routeStart);
  expect(i, "route should exist: " + routeStart).toBeGreaterThanOrEqual(0);
  return INDEX.slice(i, i + max);
}

describe("Admin-managed global user lifecycle contract", () => {
  it("protects the user directory with server-side authentication and Admin authorization", () => {
    const block = routeBlock('app.get("/api/v1/users"');
    expect(block).toMatch(/app\.get\(["']\/api\/v1\/users["']\s*,\s*requireAuth\s*,\s*requireAdmin/);
    expect(block).toContain("pke_admin_list_users");
  });

  it("fails closed unless Admin provisioning and signed webhook sync are enabled", () => {
    const block = routeBlock('app.post("/api/v1/admin/users/provision"');
    expect(block).toMatch(/app\.post\(["']\/api\/v1\/admin\/users\/provision["']\s*,\s*requireAuth\s*,\s*requireAdmin/);
    expect(block).toContain('NEON_AUTH_ADMIN_PROVISIONING_READY !== "true"');
    expect(block).toContain('NEON_AUTH_WEBHOOK_ENABLED !== "true"');
    expect(block).toContain("pke_admin_provision_user");
  });

  it("accepts identity linking only from a verified signed provider webhook", () => {
    const block = routeBlock('app.post("/api/v1/webhooks/neon-auth"');
    expect(block).toContain("verifyNeonAuthWebhook");
    expect(block).toContain('verified.eventType === "user.before_create"');
    expect(block).toContain('verified.eventType === "user.created"');
    expect(block).toContain("pke_is_preprovisioned_email");
    expect(block).toContain("pke_link_neon_auth_identity_from_webhook");
    expect(block).not.toMatch(/INSERT\s+INTO\s+neon_auth/i);
  });

  it("requires an Admin for global activation and delegates eligibility/audit checks to SQL", () => {
    const block = routeBlock('app.patch("/api/v1/admin/users/:id/status"');
    expect(block).toMatch(/app\.patch\(["']\/api\/v1\/admin\/users\/:id\/status["']\s*,\s*requireAuth\s*,\s*requireAdmin/);
    expect(block).toContain("pke_admin_set_user_active");
    expect(MIGRATION).toContain("IF NOT public.pke_is_platform_admin() THEN");
    expect(MIGRATION).toContain("verified Neon Auth identity is required before activation");
    expect(MIGRATION).toContain("admin cannot deactivate their own account");
  });

  it("uses the Neon Auth Admin SDK for create, ban, unban and session revocation", () => {
    for (const method of ["createUser", "banUser", "unbanUser", "revokeUserSessions"]) {
      expect(AUTH).toContain(method);
      expect(APP).toContain("authClient.admin." + method);
    }
  });

  it("deactivates PKE access before banning the Auth identity and revoking sessions", () => {
    const i = APP.indexOf("const updateGlobalStatus");
    const block = APP.slice(i, i + 4200);
    const disable = block.indexOf("isActive: false");
    const ban = block.indexOf("authClient.admin.banUser");
    const revoke = block.indexOf("authClient.admin.revokeUserSessions");
    expect(disable).toBeGreaterThanOrEqual(0);
    expect(ban).toBeGreaterThan(disable);
    expect(revoke).toBeGreaterThan(ban);
  });

  it("unbans the Auth identity before reactivating the PKE account", () => {
    const i = APP.indexOf("const updateGlobalStatus");
    const block = APP.slice(i, i + 4200);
    const unban = block.indexOf("authClient.admin.unbanUser");
    const activate = block.indexOf("isActive: true");
    expect(unban).toBeGreaterThanOrEqual(0);
    expect(activate).toBeGreaterThan(unban);
  });

  it("keeps project role and membership changes separate from global account status", () => {
    const i = APP.indexOf("const addMemberToProject");
    const block = APP.slice(i, i + 2600);
    expect(block).toContain("projectRoleId");
    expect(block).toContain("/admin/projects/");
    expect(block).not.toContain("isActive: true");
    expect(block).not.toContain("isActive: false");
  });

  it("does not persist or log the one-time temporary password in browser storage", () => {
    const start = APP.indexOf("const createAccount");
    const end = APP.indexOf("const updateGlobalStatus", start);
    const block = APP.slice(start, end);
    expect(block).toContain("window.crypto.getRandomValues");
    expect(block).toContain("setTemporaryCredential({ email, password: temporaryPassword })");
    expect(APP).toContain("Password sementara — tampil satu kali");
    expect(block).not.toMatch(/localStorage|sessionStorage|console\.(log|info|debug)/);
  });

  it("keeps Admin password reset as a provider reset request, never a server-side password assignment", () => {
    const block = routeBlock('app.post("/api/v1/admin/users/:id/password-reset"', 5200);
    expect(block).toMatch(/app\.post\(["']\/api\/v1\/admin\/users\/:id\/password-reset["']\s*,\s*requireAuth\s*,\s*requireAdmin/);
    expect(block).toContain("/request-password-reset");
    expect(block).not.toMatch(/newPassword|password_hash/i);
  });
});

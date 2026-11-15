import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const INDEX_SRC = readFileSync(join(__dirname, "index.ts"), "utf8");
const AUTH_CLIENT_SRC = readFileSync(join(__dirname, "../frontend/src/auth-client.ts"), "utf8");
const APP_SRC = readFileSync(join(__dirname, "../frontend/src/App.tsx"), "utf8");
const DEMO_ROUTES_SRC = readFileSync(join(__dirname, "demo/routes.ts"), "utf8");

describe("Admin password reset contract (Rev 5.7 closure checks)", () => {
  it("registers admin reset endpoint with auth and admin guards", () => {
    expect(INDEX_SRC).toMatch(/app\.post\(\s*["']\/api\/v1\/admin\/users\/:id\/password-reset["']\s*,\s*requireAuth\s*,\s*requireAdmin/);
  });

  it("resolves target by app user id and requires linked active neon_auth_user_id", () => {
    const i = INDEX_SRC.indexOf('/api/v1/admin/users/:id/password-reset');
    const block = INDEX_SRC.slice(i, i + 3000);
    expect(block).toContain("WHERE id = $1::uuid");
    expect(block).toContain("neon_auth_user_id");
    expect(block).toContain("NEON_IDENTITY_NOT_LINKED");
    expect(block).toContain("USER_INACTIVE");
    expect(block).not.toMatch(/password_hash/i);
  });

  it("calls Neon Auth request-password-reset endpoint without exposing secrets/tokens", () => {
    const i = INDEX_SRC.indexOf('/api/v1/admin/users/:id/password-reset');
    const block = INDEX_SRC.slice(i, i + 5000);
    expect(block).toContain("/request-password-reset");
    expect(block).toContain("NEON_AUTH_BASE_URL");
    expect(block).toContain("https:");
    expect(block).toContain("JSON.stringify(payload)");
    expect(block).toContain("RESET_REQUEST_FAILED");
    expect(block).not.toMatch(/newPassword/);
  });

  it("records password_reset_requested audit events without sensitive payload", () => {
    const i = INDEX_SRC.indexOf('/api/v1/admin/users/:id/password-reset');
    const block = INDEX_SRC.slice(i, i + 4500);
    expect(block).toContain("INSERT INTO approval_events");
    expect(block).toContain("'password_reset_requested'");
    expect(block).toContain("entity_type");
    expect(block).toContain("approved_by");
    expect(block).toContain("status");
  });

  it("frontend uses Neon Auth client wrappers for forgot/reset flows", () => {
    expect(AUTH_CLIENT_SRC).toContain("requestPasswordReset");
    expect(AUTH_CLIENT_SRC).toContain("resetPassword");
    expect(AUTH_CLIENT_SRC).toContain("forgetPassword");
    expect(AUTH_CLIENT_SRC).toContain("newPassword");
  });

  it("frontend pages enforce token/min-length UX and admin confirmation", () => {
    expect(APP_SRC).toContain("function ForgotPasswordPage");
    expect(APP_SRC).toContain("function ResetPasswordPage");
    expect(APP_SRC).toContain("PASSWORD_MIN_LENGTH");
    expect(APP_SRC).toContain("searchParams.get('token')");
    expect(APP_SRC).toContain("Kirim permintaan reset password");
    expect(APP_SRC).toContain("/admin/users/");
    expect(APP_SRC).toContain("window.confirm");
  });

  it("demo mode marks admin reset unavailable", () => {
    expect(DEMO_ROUTES_SRC).toContain('/api/v1/admin/users/:id/password-reset');
    expect(DEMO_ROUTES_SRC).toMatch(/notInDemo/);
  });
});


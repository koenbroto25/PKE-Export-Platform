import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = __dirname;
const INDEX_SRC = readFileSync(join(ROOT, "index.ts"), "utf8");
const AUTH_SRC = readFileSync(join(ROOT, "auth.ts"), "utf8");
const DEMO_MODE_SRC = readFileSync(join(ROOT, "demo", "mode.ts"), "utf8");
const DEMO_ROUTES_SRC = readFileSync(join(ROOT, "demo", "routes.ts"), "utf8");
const FRONTEND_APP_SRC = readFileSync(join(ROOT, "..", "frontend", "src", "App.tsx"), "utf8");
const FRONTEND_API_SRC = readFileSync(join(ROOT, "..", "frontend", "src", "api.ts"), "utf8");

type RouteRegistration = { method: string; path: string; at: number };
const ROUTE_RE = /app\.(get|post|put|patch|delete|use)\s*\(\s*["'`]([^"'`]+)["'`]/gi;

function registrations(source: string): RouteRegistration[] {
  return [...source.matchAll(ROUTE_RE)].map((match) => ({
    method: match[1].toUpperCase(),
    path: match[2],
    at: match.index ?? 0,
  }));
}

describe("P19 operational assurance: API security boundary", () => {
  const routes = registrations(INDEX_SRC);
  const authMount = INDEX_SRC.indexOf('app.use("/api/v1", async');
  const rlsMarker = INDEX_SRC.indexOf("// P03_RLS_REQUEST_TRANSACTION_MIDDLEWARE");
  const rlsMount = INDEX_SRC.indexOf('app.use("/api/v1", async', authMount + 1);

  it("keeps the global authentication and transaction-scoped RLS middleware in order", () => {
    expect(authMount).toBeGreaterThan(0);
    expect(rlsMarker).toBeGreaterThan(authMount);
    expect(rlsMount).toBeGreaterThan(rlsMarker);
    expect(INDEX_SRC.slice(authMount, rlsMount)).toContain("await requireAuth(req, res, next)");
    expect(INDEX_SRC.slice(rlsMount, rlsMount + 5000)).toContain("BEGIN");
    expect(INDEX_SRC.slice(rlsMount, rlsMount + 5000)).toContain("set_config('app.current_user_id'");
    expect(INDEX_SRC.slice(rlsMount, rlsMount + 12000)).toContain("COMMIT");
    expect(INDEX_SRC.slice(rlsMount, rlsMount + 12000)).toContain("ROLLBACK");
    expect(routes.filter((route) => route.method === "USE" && route.path === "/api/v1")).toHaveLength(2);
  });

  it("allows only the reviewed pre-authentication API exceptions", () => {
    const beforeAuth = routes
      .filter((route) => route.path.startsWith("/api/v1/") && route.at < authMount)
      .map((route) => `${route.method} ${route.path}`)
      .sort();
    expect(beforeAuth).toEqual([
      "GET /api/v1/admin/provisioning/status",
      "GET /api/v1/health",
      "GET /api/v1/health/live",
      "POST /api/v1/webhooks/neon-auth",
    ]);
    expect(INDEX_SRC).toContain("verifyNeonAuthWebhook(");
    expect(INDEX_SRC).toContain('process.env.NEON_AUTH_WEBHOOK_ENABLED !== "true"');
    expect(INDEX_SRC).toContain("requireAuth, requireAdmin");
    expect(INDEX_SRC).toContain("app.get(\"/api/v1/health/live\"");
    expect(INDEX_SRC).toContain("app.get(\"/api/v1/health\"");
  });

  it("keeps every registered API route under the versioned API prefix and prevents duplicate handlers", () => {
    expect(routes.length).toBeGreaterThanOrEqual(220);
    expect(routes.every((route) => route.path.startsWith("/api/v1"))).toBe(true);
    const handlers = routes.filter((route) => route.method !== "USE");
    const keys = handlers.map((route) => `${route.method} ${route.path}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("places every business route after both global security middleware mounts", () => {
    const businessRoutes = routes.filter((route) => route.at > rlsMount);
    expect(businessRoutes.length).toBeGreaterThan(200);
    expect(businessRoutes.every((route) => route.path.startsWith("/api/v1/"))).toBe(true);
  });

  it("requires explicit route-level project, role, or domain authorization for every write route", () => {
    const writeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);
    const writes = routes.filter((route) => writeMethods.has(route.method) && route.at > rlsMount);
    const authorizationSignals = [
      "requireProjectPermission",
      "requireAnyProjectPermission",
      "requireProjectDocumentPermission",
      "requireP16ReadAccess",
      "requireAdmin",
      "requireAdminMfa",
      "findExplicitProjectPermission",
      "applyExplicitProjectPermissionContext",
      "paymentExecutionOutOfScope",
      "isAdmin",
      "pke_is_platform_admin",
      "canApprove",
      "canDecide",
      "project_members",
    ];
    const missing: string[] = [];
    for (const route of writes) {
      const nextRegistration = routes.find((candidate) => candidate.at > route.at);
      const end = nextRegistration?.at ?? INDEX_SRC.length;
      const handlerBlock = INDEX_SRC.slice(route.at, end);
      if (!authorizationSignals.some((signal) => handlerBlock.includes(signal))) {
        missing.push(`${route.method} ${route.path}`);
      }
    }
    expect(writes.length).toBeGreaterThan(100);
    expect(missing).toEqual([]);
  });
});

describe("P19 operational assurance: identity and demo isolation", () => {
  it("verifies Neon Auth JWT issuer, EdDSA signature, finite expiry, and linked PKE identity", () => {
    expect(AUTH_SRC).toContain("jwtVerify(token, jwks");
    expect(AUTH_SRC).toContain('algorithms: ["EdDSA"]');
    expect(AUTH_SRC).toContain("issuer,");
    expect(AUTH_SRC).toContain("verified.payload.exp !== \"number\"");
    expect(AUTH_SRC).toContain("resolve_pke_user_by_neon_auth_user_id");
    expect(AUTH_SRC).toContain("user.is_active === true");
    expect(AUTH_SRC).toContain("user?.isAdmin || !user.isActive");
  });

  it("keeps privileged Admin MFA fail-closed until a verified MFA challenge exists", () => {
    expect(AUTH_SRC).toContain("mfaVerified: false");
    expect(AUTH_SRC).toContain("user.mfaVerified !== true");
    expect(AUTH_SRC).toContain('code: "MFA_REQUIRED"');
  });

  it("keeps Manual Trial Mode development-only, loopback-bound, and authenticated", () => {
    expect(DEMO_MODE_SRC).toContain('nodeEnv === "production"');
    expect(DEMO_MODE_SRC).toContain("isLoopbackHost(host)");
    expect(DEMO_ROUTES_SRC).toContain('app.use("/api/v1", (req: Request, res: Response, next) => demoRequireAuth(req, res, next))');
    expect(DEMO_ROUTES_SRC).toContain('app.post("/api/v1/demo/reset", demoRequireAuth');
    expect(INDEX_SRC).toContain('app.listen(Number(PORT) || 3000, "127.0.0.1"');
  });
});

describe("P19 operational assurance: frontend-to-API boundary", () => {
  it("keeps every visible navigation destination backed by a registered guarded route", () => {
    const navPaths = [...FRONTEND_APP_SRC.matchAll(/\{\s*to:\\s*["']([^"']+)["'],\\s*key:/g)].map((match) => match[1]);
    const routePaths = [...FRONTEND_APP_SRC.matchAll(/<Route\s+path=["']([^"']+)["']/g)].map((match) => match[1]);
    expect(navPaths.length).toBeGreaterThanOrEqual(20);
    expect(new Set(navPaths).size).toBe(navPaths.length);
    expect(navPaths.every((path) => routePaths.includes(path))).toBe(true);
    expect(FRONTEND_APP_SRC).toContain("RoleGuard allowedKeys=");
    expect(FRONTEND_APP_SRC).toContain("visiblePageKeys(workspaceUser || {})");
  });

  it("sends the authenticated session token through the shared API client and keeps DB secrets server-side", () => {
    expect(FRONTEND_API_SRC).toContain("getBearerToken()");
    expect(FRONTEND_API_SRC).toContain("headers.set('Authorization', `Bearer ${token}`)");
    expect(FRONTEND_API_SRC).toContain("fetch(`${API_BASE}");
    expect(FRONTEND_API_SRC).not.toMatch(/VITE_(DATABASE_URL|NEON_DATABASE_URL|NEON_AUTH_SECRET)/i);
  });
});

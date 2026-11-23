import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = __dirname;
const INDEX_SRC = readFileSync(join(ROOT, "index.ts"), "utf8");
const P17_SRC = readFileSync(join(ROOT, "p17-maritime.ts"), "utf8");
const AUTH_SRC = readFileSync(join(ROOT, "auth.ts"), "utf8");
const DEMO_MODE_SRC = readFileSync(join(ROOT, "demo", "mode.ts"), "utf8");
const DEMO_ROUTES_SRC = readFileSync(join(ROOT, "demo", "routes.ts"), "utf8");
const FRONTEND_APP_SRC = readFileSync(join(ROOT, "..", "frontend", "src", "App.tsx"), "utf8");
const FRONTEND_API_SRC = readFileSync(join(ROOT, "..", "frontend", "src", "api.ts"), "utf8");
const FRONTEND_P1_SRC = readFileSync(join(ROOT, "..", "frontend", "src", "P1WorkflowWorkbench.tsx"), "utf8");
const FRONTEND_PORT_SRC = readFileSync(join(ROOT, "..", "frontend", "src", "PortNetworkPage.tsx"), "utf8");
const FRONTEND_MARITIME_SRC = readFileSync(join(ROOT, "..", "frontend", "src", "MaritimeOperationsWorkspace.tsx"), "utf8");
const FRONTEND_REGULATORY_SRC = readFileSync(join(ROOT, "..", "frontend", "src", "RegulatoryCoreWorkspace.tsx"), "utf8");
const FRONTEND_ROLE_SRC = readFileSync(join(ROOT, "..", "frontend", "src", "RoleDashboardPage.tsx"), "utf8");

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
  const p17Routes = registrations(P17_SRC);
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
    expect(routes.filter((route) => route.method === "USE" && route.path === "/api/v1")).toHaveLength(3);
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

  it("keeps all API route modules under the versioned prefix and prevents cross-module duplicates", () => {
    const handlers = [
      ...routes.filter((route) => route.method !== "USE"),
      ...p17Routes.filter((route) => route.method !== "USE"),
    ];
    expect(handlers.length).toBeGreaterThanOrEqual(290);
    expect(handlers.every((route) => route.path.startsWith("/api/v1"))).toBe(true);
    const keys = handlers.map((route) => `${route.method} ${route.path}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("mounts fail-closed phase schema gates after RLS and before business routes", () => {
    const gateMount = INDEX_SRC.indexOf('app.use("/api/v1", phaseSchemaReleaseGate)');
    const firstBusinessRoute = INDEX_SRC.indexOf('app.get("/api/v1/me"');
    expect(gateMount).toBeGreaterThan(rlsMount);
    expect(firstBusinessRoute).toBeGreaterThan(gateMount);
    expect(INDEX_SRC).toContain("P1_SCHEMA_RELEASE_BLOCKED");
    expect(INDEX_SRC).toContain("P2A_CANDIDATE_SCHEMA_BLOCKED");
    expect(INDEX_SRC).toContain("P2A_CHANGE_REQUEST_SCHEMA_BLOCKED");
    expect(INDEX_SRC).toContain("P2A_QUALITY_SCHEMA_BLOCKED");
    expect(INDEX_SRC).toContain("P16_DOCUMENT_SCOPE_SCHEMA_BLOCKED");
    expect(INDEX_SRC).toContain("FUNDER_SHARE_SCHEMA_BLOCKED");
    expect(INDEX_SRC).toContain("P18_REGULATORY_SCHEMA_BLOCKED");
    expect(INDEX_SRC).toContain("storage");
    expect(INDEX_SRC).toContain("presigned-(?:upload|download)");
    expect(INDEX_SRC).toContain("country-document-requirements");
    expect(INDEX_SRC).toContain("phaseSchemaObjectsReady");
    expect(INDEX_SRC).toContain("pg_policies");
    expect(INDEX_SRC).toContain("pg_proc");
    expect(INDEX_SRC).toContain("pg_trigger");
    expect(INDEX_SRC).not.toContain("FROM public.migration_history");
    const gateStart = INDEX_SRC.indexOf("function phaseSchemaGateForPath");
    const gateEnd = INDEX_SRC.indexOf("async function phaseSchemaObjectsReady", gateStart);
    const gate = INDEX_SRC.slice(gateStart, gateEnd);
    expect(gate).not.toContain("FROM public.migration_history");
    expect(gate).not.toContain("FROM public.pke_project_role_permission_allowlist");
  });

  it("keeps the P17 runtime release gate compatible with the restricted runtime role", () => {
    const gateStart = P17_SRC.indexOf("const p17WriteReleaseGate");
    const gateEnd = P17_SRC.indexOf("app.use(p17WriteReleaseGate)", gateStart);
    const gate = P17_SRC.slice(gateStart, gateEnd);
    expect(gate).toContain("pg_policies");
    expect(gate).toContain("pg_proc");
    expect(gate).toContain("pg_trigger");
    expect(gate).toContain("pke_project_role_permission_allowlist_guard");
    expect(gate).toContain("pke_project_role_code_policy_guard");
    expect(gate).not.toContain("FROM public.migration_history");
    expect(gate).not.toContain("FROM public.pke_project_role_permission_allowlist");
  });

  it("mounts the P17 route module after global auth/RLS and its release gate before P17 handlers", () => {
    const p17Mount = INDEX_SRC.indexOf("registerP17MaritimeRoutes(app");
    const releaseGateMount = P17_SRC.indexOf("app.use(p17WriteReleaseGate)");
    const firstP17Handler = P17_SRC.search(/app\.(get|post|put|patch|delete)\s*\(/i);
    expect(p17Mount).toBeGreaterThan(rlsMount);
    expect(releaseGateMount).toBeGreaterThan(0);
    expect(firstP17Handler).toBeGreaterThan(releaseGateMount);
    const p17Writes = p17Routes.filter((route) => ["POST", "PUT", "PATCH", "DELETE"].includes(route.method));
    const guards = ["requireProjectAccess", "requireProjectAnyAccess", "requireProjectPermission", "requireAdmin", "pke_is_platform_admin"];
    const missing: string[] = [];
    for (const route of p17Writes) {
      const end = p17Routes.find((candidate) => candidate.at > route.at)?.at ?? P17_SRC.length;
      const block = P17_SRC.slice(route.at, end);
      if (!guards.some((guard) => block.includes(guard))) missing.push(`${route.method} ${route.path}`);
    }
    expect(p17Writes.length).toBeGreaterThan(30);
    expect(missing).toEqual([]);
  });

  it("places every business route after both global security middleware mounts", () => {
    const businessRoutes = routes.filter((route) => route.method !== "USE" && route.at > rlsMount);
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
      const deliberatelyDisabled = handlerBlock.includes("status(410)") ||
        handlerBlock.includes("ROLE_PERMISSION_TEMPLATES_IMMUTABLE");
      const recipientSelfScoped = handlerBlock.includes("recipient_user_id = $2::uuid") &&
        handlerBlock.includes("req.user?.id");
      if (!deliberatelyDisabled && !recipientSelfScoped &&
          !authorizationSignals.some((signal) => handlerBlock.includes(signal))) {
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

  it("maps Project product requirement APIs to the existing project specification schema", () => {
    expect(INDEX_SRC).toContain("public.project_product_specifications");
    expect(INDEX_SRC).toContain("contract_specification_snapshot");
    expect(INDEX_SRC).toContain('"product_specs.view"');
    expect(INDEX_SRC).toContain('"product_specs.create"');
    expect(INDEX_SRC).toContain('"product_specs.update"');
    expect(INDEX_SRC).toContain("canApprove: false");
    expect(INDEX_SRC).toContain("MASTER_SPEC_APPROVAL_REQUIRED");
    expect(INDEX_SRC).toContain("APPROVED_SPEC_SNAPSHOT_IMMUTABLE");
    expect(INDEX_SRC).not.toContain("project_product_requirements");
    expect(INDEX_SRC).not.toContain('"product.requirement.view"');
    expect(INDEX_SRC).not.toContain('"product.requirement.manage"');
  });

  it("keeps notification creation aligned with the existing Project RLS insert policy", () => {
    const start = INDEX_SRC.indexOf('app.post("/api/v1/notifications"');
    const end = INDEX_SRC.indexOf('app.patch("/api/v1/notifications/:id/read"', start);
    const notificationCreateRoute = INDEX_SRC.slice(start, end);
    expect(notificationCreateRoute).toContain("PROJECT_SCOPE_REQUIRED");
    expect(notificationCreateRoute).toContain('requireProjectPermission(req, res, scopedProjectId, "project.members.manage")');
    expect(notificationCreateRoute).toContain("INSERT INTO user_notifications");
    expect(notificationCreateRoute).toContain("recipient_user_id");
    expect(notificationCreateRoute).toContain("deactivated_at IS NULL");
    expect(notificationCreateRoute).toContain("expires_at > now()");
    expect(notificationCreateRoute).toContain("INVALID_RECIPIENT");
    expect(notificationCreateRoute).not.toContain("INSERT INTO notification_deliveries");
  });

  it("keeps notification mutation restricted to the authenticated recipient", () => {
    const notificationRoute = INDEX_SRC.slice(
      INDEX_SRC.indexOf('app.patch("/api/v1/notifications/:id/read"'),
      INDEX_SRC.indexOf('app.get("/api/v1/roles"', INDEX_SRC.indexOf('app.patch("/api/v1/notifications/:id/read"')),
    );
    expect(notificationRoute).toContain("recipient_user_id = $2::uuid");
    expect(notificationRoute).toContain("req.user?.id");
  });

  it("logs only sanitized exception type/code metadata on request and shutdown failures", () => {
    const helperStart = INDEX_SRC.indexOf("function safeErrorMetadata");
    const helperEnd = INDEX_SRC.indexOf("const logger =", helperStart);
    const helper = INDEX_SRC.slice(helperStart, helperEnd);
    expect(helper).toContain("errorType");
    expect(helper).toContain("errorCode");
    expect(helper).not.toContain("message");
    expect(helper).not.toContain("stack");
    expect(INDEX_SRC).toContain('logger.error("Unable to establish request-scoped RLS transaction:", safeErrorMetadata(error))');
    expect(INDEX_SRC).toContain('logger.error("RLS request transaction failed during finalization:", safeErrorMetadata(transactionFailure))');
    expect(INDEX_SRC).toContain('logger.error("Unexpected RLS transaction finalization error:", safeErrorMetadata(error))');
    expect(INDEX_SRC).not.toContain('logger.error("Unable to establish request-scoped RLS transaction:", error)');
    expect(INDEX_SRC).not.toContain('logger.error("RLS request transaction failed during finalization:", transactionFailure)');
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
    const navPaths = [...FRONTEND_APP_SRC.matchAll(/\{\s*to:\s*["']([^"']+)["'],\s*key:/g)].map((match) => match[1]);
    const routePaths = [...FRONTEND_APP_SRC.matchAll(/<Route\s+path=["']([^"']+)["']/g)].map((match) => match[1]);
    expect(navPaths.length).toBeGreaterThanOrEqual(20);
    expect(new Set(navPaths).size).toBe(navPaths.length);
    expect(navPaths.every((path) => routePaths.includes(path))).toBe(true);
    expect(FRONTEND_APP_SRC).toContain("RoleGuard allowedKeys=");
    expect(FRONTEND_APP_SRC).toContain("visiblePageKeys(workspaceUser || {})");
  });

  it("keeps out-of-scope payment execution endpoints explicitly disabled", () => {
    const start = INDEX_SRC.indexOf("const paymentExecutionOutOfScope");
    const end = INDEX_SRC.indexOf('app.get("/api/v1/payment-instructions"', start);
    const handler = INDEX_SRC.slice(start, end);
    expect(handler).toContain("res.status(410)");
    expect(handler).toContain("PAYMENT_EXECUTION_OUT_OF_SCOPE");
    expect(handler).toContain("available: false");
    expect(INDEX_SRC).toContain('app.get("/api/v1/payment-instructions", requireAuth, paymentExecutionOutOfScope)');
    expect(INDEX_SRC).toContain('app.post("/api/v1/payment-instructions", requireAuth, paymentExecutionOutOfScope)');
    expect(INDEX_SRC).toContain('app.patch("/api/v1/payment-instructions/:id", requireAuth, paymentExecutionOutOfScope)');
  });

  it("traces critical business journeys from UI to API and existing database domains", () => {
    const journeys = [
      {
        name: "PKS/supplier qualification",
        ui: ["/pks-sites", "pks-candidates", "product-requirements"],
        api: ["/api/v1/projects/:projectId/pks-sites", "/api/v1/projects/:projectId/pks-candidates", "/api/v1/projects/:projectId/product-requirements"],
        tables: ["pks_sites", "project_pks_site_participation", "project_product_specifications", "product_specifications"],
        frontend: FRONTEND_APP_SRC,
        backend: INDEX_SRC,
      },
      {
        name: "P1 procurement and operational workflow",
        ui: ["p1-workflows", "/p1-workflows"],
        api: ["/api/v1/projects/:projectId/p1-workflows", "/api/v1/projects/:projectId/p1-workflows/:id/transition", "/api/v1/projects/:projectId/p1-workflows/:id/evidence"],
        tables: ["p1_domain_records", "p1_domain_events", "p1_domain_evidence"],
        frontend: FRONTEND_P1_SRC,
        backend: INDEX_SRC,
      },
      {
        name: "Truck, warehouse and inventory",
        ui: ["/truck-trips", "/warehouse-receipts", "/inventory-lots", "/inventory-movements"],
        api: ["/api/v1/truck-trips", "/api/v1/warehouse-receipts", "/api/v1/inventory-lots", "/api/v1/inventory-movements"],
        tables: ["truck_trips", "warehouse_receipts", "inventory_lots", "inventory_movements"],
        frontend: FRONTEND_APP_SRC,
        backend: INDEX_SRC,
      },
      {
        name: "Port and warehouse network",
        ui: ["/ports", "/warehouses", "/p16/master/"],
        api: ["/api/v1/ports", "/api/v1/warehouses", "/api/v1/p16/master/:resource"],
        tables: ["ports", "warehouses", "pks_port_routes", "port_depth_observations", "port_tide_observations"],
        frontend: FRONTEND_PORT_SRC,
        backend: INDEX_SRC,
      },
      {
        name: "Voyage, vessel and loading",
        ui: ["/voyages", "/vessel-nominations", "/vessel-port-calls", "/loading-operations", "/vessel-positions"],
        api: ["/api/v1/projects/:projectId/voyages", "/api/v1/projects/:projectId/vessel-nominations", "/api/v1/projects/:projectId/vessel-port-calls", "/api/v1/projects/:projectId/loading-operations", "/api/v1/projects/:projectId/vessel-positions"],
        tables: ["voyages", "vessel_nominations", "vessel_port_calls", "loading_operations", "vessel_tracking_positions"],
        frontend: FRONTEND_MARITIME_SRC,
        backend: P17_SRC,
      },
      {
        name: "Export documents and regulatory assessment",
        ui: ["/regulatory-sources", "/regulatory-rules", "/regulatory-assessments", "/projects/"],
        api: ["/api/v1/regulatory-sources", "/api/v1/regulatory-rules", "/api/v1/projects/:projectId/regulatory-assessments"],
        tables: ["project_export_documents", "regulatory_sources", "regulatory_rules", "regulatory_rule_versions", "regulatory_assessments"],
        frontend: FRONTEND_REGULATORY_SRC,
        backend: INDEX_SRC,
      },
      {
        name: "Finance and accounting",
        ui: ["/cash-advances", "/payment-instructions", "/journal-entries", "/ap-invoices", "/ar-invoices", "/fx-rates", "/fx-exposure"],
        api: ["/api/v1/cash-advances", "/api/v1/payment-instructions", "/api/v1/journal-entries", "/api/v1/ap-invoices", "/api/v1/ar-invoices", "/api/v1/fx-rates", "/api/v1/fx-exposure"],
        tables: ["cash_advances", "journal_entries", "ap_invoices", "ar_invoices", "fx_exposures"],
        frontend: FRONTEND_APP_SRC,
        backend: INDEX_SRC,
      },
      {
        name: "Buyer identity and shipment visibility",
        ui: ["/buyer/shipments", "Identity mapping & visibility grants"],
        api: ["/api/v1/buyer/shipments", "/api/v1/projects/:projectId/buyer-visibility-grants", "/api/v1/admin/buyer-auth-mappings"],
        tables: ["buyer_auth_user_mappings", "buyer_visibility_grants", "shipments"],
        frontend: FRONTEND_APP_SRC + FRONTEND_ROLE_SRC,
        backend: P17_SRC,
      },
    ];
    for (const journey of journeys) {
      for (const path of journey.ui) expect(journey.frontend, journey.name).toContain(path);
      for (const path of journey.api) expect(journey.backend, journey.name).toContain(path);
      for (const table of journey.tables) expect(journey.backend, journey.name).toContain(table);
    }
  });

  it("sends the authenticated session token through the shared API client and keeps DB secrets server-side", () => {
    expect(FRONTEND_API_SRC).toContain("getBearerToken as getAuthToken");
    expect(FRONTEND_API_SRC).toContain("await getAuthToken()");
    expect(FRONTEND_API_SRC).toContain("headers.set('Authorization', `Bearer ${token}`)");
    expect(FRONTEND_API_SRC).toContain("fetch(`${API_BASE}");
    expect(FRONTEND_API_SRC).not.toMatch(/VITE_(DATABASE_URL|NEON_DATABASE_URL|NEON_AUTH_SECRET)/i);
  });
});

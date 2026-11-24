import { describe, expect, it, vi } from "vitest";
import { registerP17MaritimeRoutes } from "./p17-maritime.js";

type QueryResult = { rows: Record<string, unknown>[] };

function buildHarness(policyOverrides: Record<string, number> = {}) {
  const middleware: Array<(req: any, res: any, next: () => void) => unknown> = [];
  const app: any = {
    use: (handler: any) => { if (typeof handler === "function") middleware.push(handler); },
    get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn(),
  };
  const responses: QueryResult[] = [
    { rows: [{ found_count: 40, unsafe_count: 0 }] },
    { rows: [{ function_count: 4 }] },
    { rows: [{ trigger_count: 2 }] },
    { rows: [{
      admin_pending_select: 1,
      admin_review_update: 1,
      project_review_select: 1,
      project_scoped_legacy_select: 1,
      ...policyOverrides,
    }] },
  ];
  const query = vi.fn(async (): Promise<QueryResult> => {
    const next = responses.shift();
    if (!next) throw new Error("Unexpected database query in P17 release gate harness");
    return next;
  });
  registerP17MaritimeRoutes(app, {
    requireAuth: (_req: any, _res: any, next: () => void) => next(),
    requireAdmin: (_req: any, _res: any, next: () => void) => next(),
    requireProjectPermission: vi.fn(async () => true),
    uuidPattern: /^[0-9a-f-]{36}$/i,
    privateStorage: {} as any,
  } as any);
  const gate = middleware[0];
  if (!gate) throw new Error("P17 release middleware was not registered");
  return { gate, query };
}

async function runGate(overrides: Record<string, number> = {}) {
  const { gate, query } = buildHarness(overrides);
  let nextCalled = false;
  const payload: { status?: number; body?: any } = {};
  const res = {
    status(code: number) { payload.status = code; return this; },
    json(body: any) { payload.body = body; return this; },
  };
  await gate({
    path: "/api/v1/projects/00000000-0000-0000-0000-000000000001/vessel-positions",
    method: "GET",
    db: { query },
  }, res, () => { nextCalled = true; });
  return { ...payload, nextCalled, queryCount: query.mock.calls.length };
}

describe("P20 in-process P17 API release-boundary harness", () => {
  it("fails closed when the admin pending-position SELECT policy is missing", async () => {
    const result = await runGate({ admin_pending_select: 0 });
    expect(result.status).toBe(503);
    expect(result.body.code).toBe("P17_LEGACY_POSITION_SCOPE_BLOCKED");
    expect(result.nextCalled).toBe(false);
    expect(result.queryCount).toBe(4);
  });

  it("fails closed when the legacy SELECT policy is not Project-context scoped", async () => {
    const result = await runGate({ project_scoped_legacy_select: 0 });
    expect(result.status).toBe(503);
    expect(result.body.code).toBe("P17_LEGACY_POSITION_SCOPE_BLOCKED");
    expect(result.nextCalled).toBe(false);
  });


  it("denies a Project mutation before SQL INSERT when the caller lacks the scoped permission", async () => {
    const middleware: Array<(req: any, res: any, next: () => void) => unknown> = [];
    const routes = new Map<string, any[]>();
    const app: any = {
      use: (handler: any) => { if (typeof handler === "function") middleware.push(handler); },
      get: vi.fn(),
      post: (path: string, ...handlers: any[]) => routes.set(`POST ${path}`, handlers),
      patch: vi.fn(), put: vi.fn(), delete: vi.fn(),
    };
    const responses: QueryResult[] = [
      { rows: [{ found_count: 40, unsafe_count: 0 }] },
      { rows: [{ function_count: 4 }] },
      { rows: [{ trigger_count: 2 }] },
      { rows: [{
        admin_pending_select: 1, admin_review_update: 1,
        project_review_select: 1, project_scoped_legacy_select: 1,
      }] },
      { rows: [{ is_admin: false }] },
    ];
    const query = vi.fn(async (sql: string): Promise<QueryResult> => {
      if (/^INSERT|^UPDATE|^DELETE/i.test(sql.trim())) throw new Error("DML must not run after permission denial");
      const next = responses.shift();
      if (!next) throw new Error("Unexpected SQL query in route harness");
      return next;
    });
    const permission = vi.fn(async (_req: any, res: any) => {
      res.status(403).json({ error: "Project permission required", code: "PROJECT_PERMISSION_REQUIRED" });
      return false;
    });
    registerP17MaritimeRoutes(app, {
      requireAuth: (_req: any, _res: any, next: () => void) => next(),
      requireAdmin: (_req: any, _res: any, next: () => void) => next(),
      requireProjectPermission: permission,
      uuidPattern: /^[0-9a-f-]{36}$/i,
      privateStorage: {} as any,
    } as any);

    const handlers = routes.get("POST /api/v1/projects/:projectId/pke-logistics/simulation-scenarios");
    expect(handlers).toBeDefined();
    const payload: { status?: number; body?: any } = {};
    const res = {
      status(code: number) { payload.status = code; return this; },
      json(body: any) { payload.body = body; return this; },
    };
    const req = {
      path: "/api/v1/projects/00000000-0000-0000-0000-000000000001/pke-logistics/simulation-scenarios",
      method: "POST",
      params: { projectId: "00000000-0000-0000-0000-000000000001" },
      body: {
        scenarioCode: "P20-DENY-01",
        scenarioName: "Permission denial harness",
        graph: {
          nodes: [
            { id: "n1", name: "PKS", type: "pks_site", simulation_only: true, verification_status: "unverified" },
            { id: "n2", name: "Road", type: "road_route", simulation_only: true, verification_status: "unverified" },
            { id: "n3", name: "Port", type: "port", simulation_only: true, verification_status: "unverified" },
            { id: "n4", name: "Terminal", type: "terminal", simulation_only: true, verification_status: "unverified" },
            { id: "n5", name: "Loading", type: "loading_service", simulation_only: true, verification_status: "unverified" },
            { id: "n6", name: "Warehouse", type: "warehouse", simulation_only: true, verification_status: "unverified" },
          ],
          edges: [
            { from_id: "n1", to_id: "n2", relationship_type: "pks_to_road_route" },
            { from_id: "n2", to_id: "n3", relationship_type: "road_route_to_port" },
            { from_id: "n3", to_id: "n4", relationship_type: "port_has_terminal" },
            { from_id: "n4", to_id: "n5", relationship_type: "terminal_has_loading_service" },
            { from_id: "n4", to_id: "n6", relationship_type: "terminal_has_warehouse" },
          ],
        },
        sourceEvidence: [{ publisher: "Port Authority", claim: "Reference claim for test", scope: "Port facility", url: "https://example.com/source" }],
        assumptions: {},
      },
      db: { query },
    };

    await middleware[0](req, res, () => {});
    await handlers![0](req, res, () => {});
    await handlers![1](req, res);

    expect(payload.status).toBe(403);
    expect(payload.body.code).toBe("PROJECT_PERMISSION_REQUIRED");
    expect(permission).toHaveBeenCalledOnce();
    expect(query).toHaveBeenCalledTimes(5);
    expect(query.mock.calls.some(([sql]) => /INSERT|UPDATE|DELETE/i.test(sql))).toBe(false);
  });

  it("allows protected route dispatch only after all RLS, permission, trigger and AIS policy checks pass", async () => {
    const result = await runGate();
    expect(result.status).toBeUndefined();
    expect(result.body).toBeUndefined();
    expect(result.nextCalled).toBe(true);
    expect(result.queryCount).toBe(4);
  });
});

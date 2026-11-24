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
    { rows: [{ found_count: 28, unsafe_count: 0 }] },
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

  it("allows protected route dispatch only after all RLS, permission, trigger and AIS policy checks pass", async () => {
    const result = await runGate();
    expect(result.status).toBeUndefined();
    expect(result.body).toBeUndefined();
    expect(result.nextCalled).toBe(true);
    expect(result.queryCount).toBe(4);
  });
});

import { describe, expect, it, vi } from "vitest";
vi.mock("./index.js", () => ({
  default: vi.fn(),
  ensureRuntimeReady: vi.fn(),
  getRuntimeReadinessState: vi.fn(),
}));

import { createServerlessHandler } from "../api/[...path].js";

function makeResponse() {
  return {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: "",
    setHeader(name: string, value: string) {
      this.headers[name.toLowerCase()] = value;
      return this;
    },
    end(chunk?: string) {
      this.body = chunk ?? "";
      return this;
    },
  };
}

describe("Vercel serverless API readiness gate", () => {
  it("keeps the liveness endpoint available without database configuration", async () => {
    const app = vi.fn();
    const ensureRuntimeReady = vi.fn().mockRejectedValue(new Error("not configured"));
    const getRuntimeReadinessState = vi.fn().mockReturnValue({
      ready: false,
      failure: {
        code: "RUNTIME_ENV_MISSING",
        missingEnvironmentVariables: ["DATABASE_URL"],
      },
    });
    const handler = createServerlessHandler({ app, ensureRuntimeReady, getRuntimeReadinessState });
    const res = makeResponse();

    await handler({ url: "/api/v1/health/live" } as any, res as any);

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ status: "alive" });
    expect(ensureRuntimeReady).not.toHaveBeenCalled();
    expect(app).not.toHaveBeenCalled();
  });

  it("returns a controlled 503 instead of crashing when readiness fails", async () => {
    const app = vi.fn();
    const ensureRuntimeReady = vi.fn().mockRejectedValue(new Error("database not configured"));
    const getRuntimeReadinessState = vi.fn().mockReturnValue({
      ready: false,
      failure: {
        code: "RUNTIME_ENV_MISSING",
        missingEnvironmentVariables: ["DATABASE_URL", "NEON_AUTH_BASE_URL", "NEON_AUTH_JWKS_URL"],
      },
    });
    const handler = createServerlessHandler({ app, ensureRuntimeReady, getRuntimeReadinessState });
    const res = makeResponse();

    await handler({ url: "/api/v1/health" } as any, res as any);

    expect(res.statusCode).toBe(503);
    expect(JSON.parse(res.body).code).toBe("RUNTIME_ENV_MISSING");
    expect(JSON.parse(res.body).missingEnvironmentVariables).toEqual([
      "DATABASE_URL",
      "NEON_AUTH_BASE_URL",
      "NEON_AUTH_JWKS_URL",
    ]);
    expect(app).not.toHaveBeenCalled();
  });

  it("passes requests to Express only after readiness succeeds", async () => {
    const app = vi.fn((_req, res) => {
      res.statusCode = 200;
      res.end("express");
    });
    const ensureRuntimeReady = vi.fn().mockResolvedValue(undefined);
    const getRuntimeReadinessState = vi.fn().mockReturnValue({ ready: true, failure: null });
    const handler = createServerlessHandler({ app, ensureRuntimeReady, getRuntimeReadinessState });
    const res = makeResponse();

    await handler({ url: "/api/v1/me" } as any, res as any);

    expect(ensureRuntimeReady).toHaveBeenCalledOnce();
    expect(app).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe("express");
  });
});

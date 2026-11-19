import { describe, expect, it } from "vitest";
import {
  inspectRuntimeEnvironment,
  isServerlessRuntime,
  runtimeUnavailablePayload,
} from "./runtime-readiness.ts";

describe("serverless runtime readiness", () => {
  it("reports missing required variable names without returning values", () => {
    const result = inspectRuntimeEnvironment({
      NODE_ENV: "production",
      DATABASE_URL: "",
      NEON_AUTH_BASE_URL: undefined,
      NEON_AUTH_JWKS_URL: undefined,
      SECRET_VALUE: "must-never-appear",
    });

    expect(result.ready).toBe(false);
    expect(result.missingEnvironmentVariables).toEqual([
      "DATABASE_URL",
      "NEON_AUTH_BASE_URL",
      "NEON_AUTH_JWKS_URL",
    ]);
    expect(JSON.stringify(result)).not.toContain("must-never-appear");
  });

  it("accepts a complete runtime environment", () => {
    expect(inspectRuntimeEnvironment({
      DATABASE_URL: "postgresql://redacted",
      NODE_ENV: "production",
      NEON_AUTH_BASE_URL: "https://auth.example.test",
      NEON_AUTH_JWKS_URL: "https://auth.example.test/jwks",
    })).toEqual({ ready: true, missingEnvironmentVariables: [] });
  });

  it("detects Vercel and Lambda serverless runtimes", () => {
    expect(isServerlessRuntime({ VERCEL: "1" })).toBe(true);
    expect(isServerlessRuntime({ AWS_LAMBDA_FUNCTION_NAME: "pke" })).toBe(true);
    expect(isServerlessRuntime({ NODE_ENV: "production" })).toBe(false);
  });

  it("returns a safe, non-secret readiness payload", () => {
    expect(runtimeUnavailablePayload({
      code: "RUNTIME_ENV_MISSING",
      missingEnvironmentVariables: ["DATABASE_URL"],
    })).toEqual({
      status: "not_ready",
      error: "PKE API runtime readiness check failed.",
      code: "RUNTIME_ENV_MISSING",
      missingEnvironmentVariables: ["DATABASE_URL"],
    });
  });
});

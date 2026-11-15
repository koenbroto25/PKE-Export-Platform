import { describe, it, expect } from "vitest";
import {
  validateSingleBranchDatabaseUrl,
  runPreflight,
} from "../../scripts/test-db/preflight.mjs";
import { assertNoForbiddenTestEnv } from "../../scripts/test-db/run-integration.mjs";

const PW = "not-a-real-secret";
const VALID_HOST = "ep-odd-resonance-b3zb42fw.c-4.ap-southeast-1.aws.neon.tech";
const VALID_URL = `postgres://app_runtime_secure:${PW}@${VALID_HOST}:5432/neondb?sslmode=require`;
const LEGACY_PROD_HOST = "ep-restless-hat-b35j9x0d-pooler.c-4.ap-southeast-1.aws.neon.tech";
const LEGACY_VALIDATION_HOST = "ep-blue-rice-b3ywrqrq-pooler.c-4.ap-southeast-1.aws.neon.tech";

describe("Revision 4 — single production database preflight (permanent single project/branch)", () => {
  it("accepts exact mandated single-production DATABASE_URL", () => {
    const r = validateSingleBranchDatabaseUrl(VALID_URL, {});
    expect(r.ok).toBe(true);
    expect(r.mode).toBe("single-production");
    expect(r.config).toMatchObject({
      projectId: "purple-base-63944903",
      branchId: "br-damp-shape-b3xlh4nr",
      branchName: "production",
      host: VALID_HOST,
      database: "neondb",
      username: "app_runtime_secure",
      port: 5432,
    });
  });

  it("rejects missing, malformed, whitespace, and non-postgres URL", () => {
    expect(validateSingleBranchDatabaseUrl("", {}).ok).toBe(false);
    expect(validateSingleBranchDatabaseUrl(undefined as unknown as string, {}).ok).toBe(false);
    expect(validateSingleBranchDatabaseUrl("not-a-url", {}).ok).toBe(false);
    expect(validateSingleBranchDatabaseUrl(`postgres://app_runtime_secure:${PW}@${VALID_HOST}:5432/neondb?sslmode=require \n`, {}).ok).toBe(false);
    expect(validateSingleBranchDatabaseUrl(`https://app_runtime_secure:${PW}@${VALID_HOST}:5432/neondb?sslmode=require`, {}).ok).toBe(false);
  });

  it("rejects wrong host/db/user/port and missing password", () => {
    expect(validateSingleBranchDatabaseUrl(`postgres://app_runtime_secure:${PW}@ep-other.c-4.ap-southeast-1.aws.neon.tech:5432/neondb?sslmode=require`, {}).ok).toBe(false);
    expect(validateSingleBranchDatabaseUrl(`postgres://app_runtime_secure:${PW}@${VALID_HOST}:5432/pke_test?sslmode=require`, {}).ok).toBe(false);
    expect(validateSingleBranchDatabaseUrl(`postgres://other_user:${PW}@${VALID_HOST}:5432/neondb?sslmode=require`, {}).ok).toBe(false);
    expect(validateSingleBranchDatabaseUrl(`postgres://app_runtime_secure:${PW}@${VALID_HOST}:54331/neondb?sslmode=require`, {}).ok).toBe(false);
    expect(validateSingleBranchDatabaseUrl(`postgres://app_runtime_secure@${VALID_HOST}:5432/neondb?sslmode=require`, {}).problems.some((p) => p.code === "MISSING_PASSWORD")).toBe(true);
  });

  it("requires TLS and rejects disabled/insecure params/fragments", () => {
    expect(validateSingleBranchDatabaseUrl(`postgres://app_runtime_secure:${PW}@${VALID_HOST}:5432/neondb`, {}).problems.some((p) => p.code === "TLS_REQUIRED")).toBe(true);
    expect(validateSingleBranchDatabaseUrl(`postgres://app_runtime_secure:${PW}@${VALID_HOST}:5432/neondb?sslmode=disable`, {}).ok).toBe(false);
    expect(validateSingleBranchDatabaseUrl(`postgres://app_runtime_secure:${PW}@${VALID_HOST}:5432/neondb?sslmode=prefer`, {}).ok).toBe(false);
    expect(validateSingleBranchDatabaseUrl(`postgres://app_runtime_secure:${PW}@${VALID_HOST}:5432/neondb?sslmode=require&foo=bar`, {}).problems.some((p) => p.code === "UNEXPECTED_PARAMS")).toBe(true);
    expect(validateSingleBranchDatabaseUrl(`postgres://app_runtime_secure:${PW}@${VALID_HOST}:5432/neondb?sslmode=require#frag`, {}).problems.some((p) => p.code === "UNEXPECTED_FRAGMENT")).toBe(true);
  });

  it("rejects legacy project hosts/branch IDs and local/docker hosts (no branches, no local DB)", () => {
    expect(validateSingleBranchDatabaseUrl(`postgres://app_runtime_secure:${PW}@${LEGACY_PROD_HOST}:5432/neondb?sslmode=require`, {}).problems.some((p) => /LEGACY|INVALID_HOST/i.test(p.code))).toBe(true);
    expect(validateSingleBranchDatabaseUrl(`postgres://app_runtime_secure:${PW}@${LEGACY_VALIDATION_HOST}:5432/neondb?sslmode=require`, {}).problems.some((p) => /LEGACY|INVALID_HOST/i.test(p.code))).toBe(true);
    expect(validateSingleBranchDatabaseUrl(`postgres://app_runtime_secure:${PW}@${VALID_HOST}:5432/neondb?sslmode=require`, {}).ok).toBe(true);
    expect(validateSingleBranchDatabaseUrl(`postgres://app_runtime_secure:${PW}@127.0.0.1:5432/neondb?sslmode=require`, {}).problems.some((p) => /LOCAL|INVALID_HOST/i.test(p.code))).toBe(true);
    expect(validateSingleBranchDatabaseUrl(`postgres://app_runtime_secure:${PW}@localhost:5432/neondb?sslmode=require`, {}).ok).toBe(false);
  });

  it("rejects forbidden alternate env vars and wrong explicit project/branch assertions", () => {
    for (const k of ["NEON_TEST_DATABASE_URL", "NEON_TEST_PROJECT_ID", "NEON_TEST_BRANCH_ID", "PKE_TEST_TARGET", "LOCAL_TEST_DATABASE_URL", "LOCAL_TEST_MAINTENANCE_DATABASE_URL"]) {
      const r = validateSingleBranchDatabaseUrl(VALID_URL, { [k]: "x" });
      expect(r.ok).toBe(false);
      expect(r.problems.some((p) => p.code === "FORBIDDEN_ENV_VAR")).toBe(true);
      expect(() => assertNoForbiddenTestEnv({ [k]: "x" })).toThrow(/FORBIDDEN/);
    }
    expect(validateSingleBranchDatabaseUrl(VALID_URL, { NEON_PROJECT_ID: "lucky-glitter-99553107" }).ok).toBe(false);
    expect(validateSingleBranchDatabaseUrl(VALID_URL, { NEON_BRANCH_ID: "br-calm-glade-b3nrleet" }).ok).toBe(false);
    expect(validateSingleBranchDatabaseUrl(VALID_URL, { NEON_BRANCH_ID: "br-billowing-math-b31f4wos" }).ok).toBe(false);
    expect(validateSingleBranchDatabaseUrl(VALID_URL, { NEON_BRANCH_NAME: "staging" }).ok).toBe(false);
  });

  it("never leaks password and runPreflight is fail-closed before DB connect on invalid target", async () => {
    const r = validateSingleBranchDatabaseUrl(`postgres://app_runtime_secure:${PW}@${LEGACY_PROD_HOST}:5432/neondb?sslmode=require`, {});
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r)).not.toContain(PW);
    const pre = await runPreflight({ env: { DATABASE_URL: `postgres://app_runtime_secure:${PW}@${LEGACY_PROD_HOST}:5432/neondb?sslmode=require` } });
    expect(pre.ok).toBe(false);
    expect(pre.blocked).toBe(true);
    expect(pre.mode).toBe("single-production");
    expect(pre.stage).toBe("url_validation");
  });
});

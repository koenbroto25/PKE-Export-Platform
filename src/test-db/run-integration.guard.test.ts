import { describe, it, expect } from "vitest";
import {
  validateSingleBranchDatabaseUrl,
  assertNoForbiddenTestEnv,
} from "../../scripts/test-db/run-integration.mjs";
import { runPreflight } from "../../scripts/test-db/preflight.mjs";

const PW = "not-a-real-secret";
const VALID_HOST = "ep-odd-resonance-b3zb42fw.c-4.ap-southeast-1.aws.neon.tech";
const VALID_URL = `postgres://app_runtime_secure:${PW}@${VALID_HOST}:5432/neondb?sslmode=require`;
const LEGACY_PROD_HOST = "ep-restless-hat-b35j9x0d-pooler.c-4.ap-southeast-1.aws.neon.tech";
const LEGACY_VALIDATION_HOST = "ep-blue-rice-b3ywrqrq-pooler.c-4.ap-southeast-1.aws.neon.tech";

describe("Revision 4 — run-integration single-branch guard (fail-closed, no branches/local/legacy)", () => {
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
    });
  });

  it("rejects forbidden alternate env vars (NEON_TEST_*, PKE_TEST_TARGET, LOCAL_TEST_*)", () => {
    for (const k of ["NEON_TEST_DATABASE_URL", "NEON_TEST_PROJECT_ID", "NEON_TEST_BRANCH_ID", "PKE_TEST_TARGET", "LOCAL_TEST_DATABASE_URL", "LOCAL_TEST_MAINTENANCE_DATABASE_URL"]) {
      const r = validateSingleBranchDatabaseUrl(VALID_URL, { [k]: "x" });
      expect(r.ok).toBe(false);
      expect(r.problems.some((p) => p.code === "FORBIDDEN_ENV_VAR")).toBe(true);
      expect(() => assertNoForbiddenTestEnv({ [k]: "x" })).toThrow(/FORBIDDEN/);
    }
  });

  it("rejects legacy project/hosts/branch IDs and any non-mandated host", () => {
    expect(validateSingleBranchDatabaseUrl(`postgres://app_runtime_secure:${PW}@${LEGACY_PROD_HOST}:5432/neondb?sslmode=require`, {}).ok).toBe(false);
    expect(validateSingleBranchDatabaseUrl(`postgres://app_runtime_secure:${PW}@${LEGACY_VALIDATION_HOST}:5432/neondb?sslmode=require`, {}).ok).toBe(false);
    expect(validateSingleBranchDatabaseUrl(VALID_URL.replace(VALID_HOST, "ep-other-branch.c-4.ap-southeast-1.aws.neon.tech"), {}).ok).toBe(false);
    expect(validateSingleBranchDatabaseUrl(`postgres://app_runtime_secure:${PW}@${VALID_HOST}:5432/neondb?sslmode=require&branch=br-calm-glade-b3nrleet`, {}).ok).toBe(false);
  });

  it("rejects localhost/docker, wrong db/user/port, missing/invalid TLS, malformed/missing URL", () => {
    expect(validateSingleBranchDatabaseUrl(`postgres://app_runtime_secure:${PW}@127.0.0.1:5432/neondb?sslmode=require`, {}).ok).toBe(false);
    expect(validateSingleBranchDatabaseUrl(`postgres://app_runtime_secure:${PW}@localhost:5432/neondb?sslmode=require`, {}).ok).toBe(false);
    expect(validateSingleBranchDatabaseUrl(`postgres://app_runtime_secure:${PW}@${VALID_HOST}:5432/pke_test?sslmode=require`, {}).ok).toBe(false);
    expect(validateSingleBranchDatabaseUrl(`postgres://other:${PW}@${VALID_HOST}:5432/neondb?sslmode=require`, {}).ok).toBe(false);
    expect(validateSingleBranchDatabaseUrl(`postgres://app_runtime_secure:${PW}@${VALID_HOST}:54331/neondb?sslmode=require`, {}).ok).toBe(false);
    expect(validateSingleBranchDatabaseUrl(`postgres://app_runtime_secure:${PW}@${VALID_HOST}:5432/neondb`, {}).ok).toBe(false);
    expect(validateSingleBranchDatabaseUrl(`postgres://app_runtime_secure:${PW}@${VALID_HOST}:5432/neondb?sslmode=disable`, {}).ok).toBe(false);
    expect(validateSingleBranchDatabaseUrl("", {}).ok).toBe(false);
    expect(validateSingleBranchDatabaseUrl("not-a-url", {}).ok).toBe(false);
  });

  it("never leaks password in validation result and runPreflight is fail-closed before DB connect", async () => {
    const r = validateSingleBranchDatabaseUrl(`postgres://app_runtime_secure:${PW}@${LEGACY_PROD_HOST}:5432/neondb?sslmode=require`, {});
    expect(JSON.stringify(r)).not.toContain(PW);
    const pre = await runPreflight({ env: { DATABASE_URL: `postgres://app_runtime_secure:${PW}@${LEGACY_PROD_HOST}:5432/neondb?sslmode=require` } });
    expect(pre.ok).toBe(false);
    expect(pre.blocked).toBe(true);
    expect(pre.mode).toBe("single-production");
  });

  it("rejects wrong explicit project/branch env assertions", () => {
    expect(validateSingleBranchDatabaseUrl(VALID_URL, { NEON_PROJECT_ID: "lucky-glitter-99553107" }).ok).toBe(false);
    expect(validateSingleBranchDatabaseUrl(VALID_URL, { NEON_BRANCH_ID: "br-billowing-math-b31f4wos" }).ok).toBe(false);
    expect(validateSingleBranchDatabaseUrl(VALID_URL, { NEON_BRANCH_ID: "br-calm-glade-b3nrleet" }).ok).toBe(false);
  });
});

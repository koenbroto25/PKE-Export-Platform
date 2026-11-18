import { describe, expect, it } from "vitest";
import {
  REQUIRED_RUNTIME_ROLE,
  normalizePostgresSslMode,
  roleFromDatabaseUrl,
  validateRuntimeRoleState,
  type RuntimeRoleState,
} from "./runtime-security.ts";
import { validateSingleBranchDatabaseUrl, F0_VALIDATION_TARGET } from "../scripts/test-db/preflight.mjs";

const safeRole: RuntimeRoleState = {
  current_role: "app_runtime_secure",
  rolsuper: false,
  rolbypassrls: false,
  rolcreatedb: false,
  rolcreaterole: false,
  has_neon_superuser_membership: false,
  can_resolve_identity: true,
};

describe("Revision 028 runtime database guard", () => {
  it("accepts only a least-privilege runtime role", () => {
    expect(validateRuntimeRoleState(safeRole, REQUIRED_RUNTIME_ROLE)).toEqual([]);
  });

  it("rejects a role URL that is not app_runtime_secure", () => {
    const problems = validateRuntimeRoleState(safeRole, "app_runtime");
    expect(problems).toContain("DATABASE_URL must use the app_runtime_secure role.");
  });

  it("rejects BYPASSRLS and privileged role membership", () => {
    const problems = validateRuntimeRoleState(
      { ...safeRole, rolbypassrls: true, has_neon_superuser_membership: true },
      REQUIRED_RUNTIME_ROLE,
    );
    expect(problems).toContain("Runtime role must not have BYPASSRLS.");
    expect(problems).toContain("Runtime role must not inherit or be able to SET ROLE neon_superuser.");
  });

  it("rejects an identity resolver that is not executable", () => {
    const problems = validateRuntimeRoleState(
      { ...safeRole, can_resolve_identity: false },
      REQUIRED_RUNTIME_ROLE,
    );
    expect(problems).toContain("Runtime role cannot execute the verified Neon Auth identity resolver.");
  });

  it("normalizes legacy PostgreSQL SSL aliases to the current strict behavior", () => {
    const normalized = new URL(normalizePostgresSslMode(
      "postgresql://app_runtime_secure:secret@host.example/db?sslmode=require&application_name=pke",
    ));
    expect(normalized.searchParams.get("sslmode")).toBe("verify-full");
    expect(normalized.searchParams.get("application_name")).toBe("pke");
  });

  it("preserves explicit verify-full and URLs without an SSL alias", () => {
    const strict = normalizePostgresSslMode(
      "postgresql://app_runtime_secure:secret@host.example/db?sslmode=verify-full",
    );
    const noAlias = normalizePostgresSslMode(
      "postgresql://app_runtime_secure:secret@host.example/db?application_name=pke",
    );
    expect(new URL(strict).searchParams.get("sslmode")).toBe("verify-full");
    expect(new URL(noAlias).searchParams.has("sslmode")).toBe(false);
  });

  it("reads the role name without exposing connection credentials", () => {
    expect(roleFromDatabaseUrl("postgresql://app_runtime_secure:secret@host.example/db?sslmode=require"))
      .toBe(REQUIRED_RUNTIME_ROLE);
    expect(() => roleFromDatabaseUrl("not-a-url")).toThrow(/valid PostgreSQL/);
  });
});


describe("temporary F0 validation database exception", () => {
  const validationUrl = "postgresql://app_runtime_secure:secret@ep-lucky-credit-b3knh2t7.c-4.ap-southeast-1.aws.neon.tech/neondb?sslmode=require";
  const validationEnv = {
    VERCEL_ENV: "preview",
    VERCEL_GIT_COMMIT_REF: F0_VALIDATION_TARGET.gitBranch,
    PKE_F0_VALIDATION_BRANCH: F0_VALIDATION_TARGET.branchName,
    NEON_PROJECT_ID: F0_VALIDATION_TARGET.projectId,
    NEON_BRANCH_ID: F0_VALIDATION_TARGET.branchId,
    NEON_BRANCH_NAME: F0_VALIDATION_TARGET.branchName,
  };

  it("accepts only the exact temporary validation branch in its named Vercel Preview", () => {
    const result = validateSingleBranchDatabaseUrl(validationUrl, validationEnv, Date.parse("2026-11-18T12:00:00Z"));
    expect(result.ok).toBe(true);
    expect(result.mode).toBe("f0-validation-preview");
    expect(result.config?.branchId).toBe(F0_VALIDATION_TARGET.branchId);
  });

  it("rejects a validation branch in Production", () => {
    const result = validateSingleBranchDatabaseUrl(validationUrl, {
      ...validationEnv,
      VERCEL_ENV: "production",
    }, Date.parse("2026-11-18T12:00:00Z"));
    expect(result.ok).toBe(false);
    expect(result.problems.map(problem => problem.code)).toContain("F0_VALIDATION_PREVIEW_ONLY");
  });

  it("rejects the validation branch on any other Preview branch", () => {
    const result = validateSingleBranchDatabaseUrl(validationUrl, {
      ...validationEnv,
      VERCEL_GIT_COMMIT_REF: "main",
    }, Date.parse("2026-11-18T12:00:00Z"));
    expect(result.ok).toBe(false);
    expect(result.problems.map(problem => problem.code)).toContain("F0_VALIDATION_EXCEPTION_REJECTED");
  });

  it("rejects the temporary validation exception after branch expiry", () => {
    const result = validateSingleBranchDatabaseUrl(validationUrl, validationEnv, Date.parse("2026-11-20T00:00:00Z"));
    expect(result.ok).toBe(false);
    expect(result.problems.map(problem => problem.code)).toContain("F0_VALIDATION_EXCEPTION_REJECTED");
  });

  it("refuses Production database access from Vercel Preview without the explicit validation flag", () => {
    const productionUrl = "postgresql://app_runtime_secure:secret@ep-odd-resonance-b3zb42fw.c-4.ap-southeast-1.aws.neon.tech/neondb?sslmode=require";
    const result = validateSingleBranchDatabaseUrl(productionUrl, { VERCEL_ENV: "preview" }, Date.parse("2026-11-18T12:00:00Z"));
    expect(result.ok).toBe(false);
    expect(result.problems.map(problem => problem.code)).toContain("PREVIEW_DATABASE_TARGET_REQUIRED");
  });
});

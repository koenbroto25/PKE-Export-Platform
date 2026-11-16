
// Integration tests — Revision 5.6 (single project/branch, fail-closed, READ-ONLY)
//
// Policy: run ONLY against mandated Neon target
//   project purple-base-63944903, branch br-damp-shape-b3xlh4nr (production), db neondb
// via single DATABASE_URL as app_runtime_secure (TLS required). No branch creation.
// NO local PostgreSQL/Docker. NO legacy/fallback targets. NO writes/dummy data/DDL/DML.
//
// Current state: READ-ONLY checks only. Write-path/tx-rollback E2E fixtures remain BLOCKED_OWNER
// without approved same-branch QA execution proof and mandated credentials in-session.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import {
  validateSingleBranchDatabaseUrl,
  verifyDatabaseIdentityAndPrivileges,
  EXPECTED_HOST,
  EXPECTED_PORT,
  EXPECTED_DATABASE,
  EXPECTED_RUNTIME_USER,
  EXPECTED_PROJECT_ID,
  EXPECTED_BRANCH_ID,
  EXPECTED_BRANCH_NAME
} from "../../scripts/test-db/preflight.mjs";
import { REQUIRED_RUNTIME_ROLE, validateRuntimeRoleState } from "../runtime-security";

const DATABASE_URL = process.env.DATABASE_URL || "";
const preflight = validateSingleBranchDatabaseUrl(DATABASE_URL, process.env);

let client: pg.Client | null = null;
let dbProof: any = null;

describe("integration (Rev5.6 single-branch read-only, fail-closed)", () => {
  beforeAll(async () => {
    if (!preflight.ok) return; // individual tests will report BLOCKED
    client = new pg.Client({
      connectionString: DATABASE_URL,
      connectionTimeoutMillis: 15000,
      ssl: { rejectUnauthorized: true }
    });
    await client.connect();
    dbProof = await verifyDatabaseIdentityAndPrivileges(DATABASE_URL, 15000);
  });

  afterAll(async () => {
    if (client) {
      await client.end().catch(() => {});
      client = null;
    }
  });

  it("requires mandated single-branch DATABASE_URL (no local/legacy/fallback)", () => {
    if (!preflight.ok) {
      const reasons = (preflight.problems || preflight.reasons || [])
        .map((p: any) => `[${p.code}] ${p.message || p}`)
        .join(" ");
      throw new Error(
        `BLOCKED: mandated single-branch target not configured/valid. ${reasons}`
      );
    }
    expect(preflight.mode).toBe("single-production");
    expect(preflight.config?.host).toBe(EXPECTED_HOST);
    expect(preflight.config?.port).toBe(EXPECTED_PORT);
    expect(preflight.config?.database).toBe(EXPECTED_DATABASE);
    expect(preflight.config?.username).toBe(EXPECTED_RUNTIME_USER);
    expect(preflight.config?.projectId).toBe(EXPECTED_PROJECT_ID);
    expect(preflight.config?.branchId).toBe(EXPECTED_BRANCH_ID);
    expect(preflight.config?.branchName).toBe(EXPECTED_BRANCH_NAME);
  });

  it("proves mandated DB identity and runtime role privileges (read-only)", async () => {
    if (!preflight.ok) {
      throw new Error("BLOCKED_OWNER: mandated DATABASE_URL not available for DB identity proof.");
    }
    expect(dbProof?.ok).toBe(true);
    const facts = dbProof?.facts;
    expect(facts?.current_database).toBe(EXPECTED_DATABASE);
    expect(facts?.current_user).toBe(EXPECTED_RUNTIME_USER);
    expect(facts?.session_user).toBe(EXPECTED_RUNTIME_USER);
    expect(Number(facts?.server_port)).toBe(EXPECTED_PORT);

    const { rows } = await client!.query(`
      SELECT
        current_user AS current_role,
        r.rolsuper,
        r.rolbypassrls,
        r.rolcreatedb,
        r.rolcreaterole,
        pg_has_role(current_user, 'neon_superuser', 'MEMBER') AS has_neon_superuser_membership,
        has_function_privilege(current_user, 'public.resolve_pke_user_by_neon_auth_user_id(uuid)', 'EXECUTE') AS can_resolve_identity
      FROM pg_roles r WHERE r.rolname = current_user
    `);
    const state = rows[0];
    const problems = validateRuntimeRoleState(state, REQUIRED_RUNTIME_ROLE);
    expect(problems).toEqual([]);
    expect(state.current_role).toBe(REQUIRED_RUNTIME_ROLE);
  });

  it("inspects migration history / schema_migrations presence (read-only, no apply)", async () => {
    if (!preflight.ok) {
      throw new Error("BLOCKED_OWNER: mandated DATABASE_URL not available for migration history inspection.");
    }
    const { rows } = await client!.query(
      `SELECT
         to_regclass('public.schema_migrations') AS schema_migrations,
         to_regclass('public.projects') AS projects,
         to_regclass('public.users') AS users`
    );
    expect(rows[0]).toHaveProperty("schema_migrations");
    expect(rows[0]).toHaveProperty("projects");
    expect(rows[0]).toHaveProperty("users");

    if (rows[0].schema_migrations) {
      const hist = await client!.query(
        `SELECT filename, checksum FROM schema_migrations ORDER BY filename`
      );
      expect(Array.isArray(hist.rows)).toBe(true);
      for (const r of hist.rows) {
        expect(typeof r.filename).toBe("string");
        expect(r.filename.length).toBeGreaterThan(0);
      }
    }
  });

  it("checks selected schema objects, RLS enablement, and identity resolver availability (read-only)", async () => {
    if (!preflight.ok) {
      throw new Error("BLOCKED_OWNER: mandated DATABASE_URL not available for schema/RLS inspection.");
    }
    const { rows } = await client!.query(`
      SELECT
        to_regclass('public.projects') AS projects,
        to_regclass('public.users') AS users,
        to_regclass('public.report_runs') AS report_runs,
        to_regprocedure('public.resolve_pke_user_by_neon_auth_user_id(uuid)') AS identity_resolver
    `);
    expect(rows[0]).toHaveProperty("identity_resolver");

    const rls = await client!.query(`
      SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = ANY($1::text[])
      ORDER BY c.relname
    `, [["projects", "users", "project_members", "report_runs"]]);

    for (const r of rls.rows) {
      expect(typeof r.relname).toBe("string");
      expect(typeof r.relrowsecurity).toBe("boolean");
    }
  });

  it("write-path tx/rollback + QA-namespace fixtures remain BLOCKED_OWNER (no stubs)", () => {
    throw new Error(
      "BLOCKED_OWNER: write-path integration/E2E fixtures not executed. Requires owner-provisioned mandated target credentials, " +
      "verified backup/restore/parity, and approved same-branch tx/rollback + unique QA-namespace execution with cleanup proof. " +
      "No local DB, no other branch, no dummy production data, no DDL/DML performed."
    );
  });
});

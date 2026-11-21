import { describe, expect, it } from "vitest";
import fs from "node:fs";
import crypto from "node:crypto";
const migration = fs.readFileSync("migrations/056_project_context_and_funder_report_shares.sql");
const sql = migration.toString("utf8");
const api = fs.readFileSync("src/index.ts", "utf8");
describe("Migration 056 Project context and explicit Funder report sharing", () => {
  it("pins the exact migration SHA-256", () => {
    expect(crypto.createHash("sha256").update(migration).digest("hex")).toBe("8cfb54c6c9dc728f2ae71975826ad8e589fabb82ee3cd634c3f6672abcd8ecc7");
  });
  it("is transactional and provisions the least-privilege permission grants", () => {
    expect(sql).toMatch(/^--[^\n]*\nBEGIN;/);
    expect(sql).toMatch(/COMMIT;\s*$/);
    expect(sql).toContain("('finance','project.view'),('accounting','project.view')");
    expect(sql).toContain("('funder','project.view'),('funder','funder.view')");
  });
  it("limits Funder report visibility to explicitly shared rows", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.project_funder_report_shares");
    expect(sql).toContain("funder_user_id = public.pke_current_user_id()");
    expect(sql).toContain("CREATE POLICY pke_report_runs_funder_shared_select");
    expect(sql).toContain("share.revoked_at IS NULL");
    expect(sql).toContain("rr.status = 'completed'");
  });
  it("validates the target Funder role and immutable/revocable share history", () => {
    expect(sql).toContain("pr.role_code = 'funder'");
    expect(sql).toContain("perm.code = 'funder.view'");
    expect(sql).toContain("Funder report share identity is immutable");
    expect(sql).toContain("revoked_by IS DISTINCT FROM public.pke_current_user_id()");
  });
  it("implements authenticated list, share and revoke endpoints", () => {
    expect(api).toContain('/api/v1/funder/shared-reports');
    expect(api).toContain('/api/v1/projects/:projectId/funder/report-shares');
    expect(api).toContain('/api/v1/projects/:projectId/funder/report-shares/:shareId/revoke');
  });
});

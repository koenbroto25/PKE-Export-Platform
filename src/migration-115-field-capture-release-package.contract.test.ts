import{describe,it,expect}from"vitest";
import{readFileSync}from"node:fs";
import{join}from"node:path";
const manifest=JSON.parse(readFileSync(join(process.cwd(),"migration_release_manifest_p20_field_capture_server_sync_115.json"),"utf8"));
const sql=readFileSync(join(process.cwd(),"migrations/115_project_field_capture_server_sync.sql"),"utf8");
const verifier=readFileSync(join(process.cwd(),"scripts/verify-pm115-release-package.mjs"),"utf8");
describe("Migration 115 prepared release state",()=>{
 it("keeps Production unauthorized and UAT not applied pending owner approval",()=>{
  expect(manifest.production_application).toBe("not_authorized");
  expect(manifest.owner_approval.status).toBe("pending");
  expect(manifest.uat_application.status).toBe("not_applied");
  expect(manifest.migrations[0].application_status).toBe("not_applied");
 });
 it("pins exactly one migration with SHA verification",()=>{
  expect(manifest.migrations).toHaveLength(1);
  expect(manifest.migrations[0].migration_number).toBe(115);
  expect(manifest.migrations[0].source_sha_verified).toBe(true);
  expect(manifest.migrations[0].sha256).toMatch(/^[a-f0-9]{64}$/);
  expect(verifier).toContain("Migration 115 SHA mismatch");
 });
 it("requires the prepared package verifier to fail closed before any DB application",()=>{
  expect(verifier).toContain('owner_approval?.status!=="pending"');
  expect(verifier).toContain('uat_application?.status!=="not_applied"');
  expect(verifier).toContain('production_application!=="not_authorized"');
 });
 it("is non-destructive and RLS forced",()=>{
  expect(sql).toContain("FORCE ROW LEVEL SECURITY");
  expect(sql).not.toMatch(/^\s*(DROP\s+TABLE|DROP\s+SCHEMA|TRUNCATE)\b/im);
 });
});

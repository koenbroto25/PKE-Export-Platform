import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {join} from "node:path";
const sql=readFileSync(join(process.cwd(),"migrations/115_project_field_capture_server_sync.sql"),"utf8");
describe("Migration 115 Field Capture server sync/RLS release contract",()=>{
 it("creates an immutable Project-scoped capture submission with idempotency",()=>{
  expect(sql).toContain("project_field_capture_submissions");
  expect(sql).toContain("UNIQUE (project_id,actor_user_id,local_capture_id)");
  expect(sql).toContain("UNIQUE (project_id,actor_user_id,idempotency_key)");
  expect(sql).toContain("FORCE ROW LEVEL SECURITY");
  expect(sql).toContain("GRANT SELECT,INSERT ON public.project_field_capture_submissions TO app_runtime_secure");
 });
 it("requires current actor, task assignment and Project permission on insert",()=>{
  expect(sql).toContain("actor_user_id=public.pke_current_user_id()");
  expect(sql).toContain("pke_has_project_permission(project_id,'project.tasks.update')");
  expect(sql).toContain("wi.assignee_user_id=project_field_capture_submissions.actor_user_id");
  expect(sql).toContain("wi.status NOT IN ('resolved','closed','cancelled')");
  expect(sql).not.toMatch(/GRANT[^;]+UPDATE[^;]+project_field_capture_submissions/i);
  expect(sql).not.toMatch(/GRANT[^;]+DELETE[^;]+project_field_capture_submissions/i);
 });
 it("validates GPS, evidence checksum/size/MIME and Project namespace",()=>{
  expect(sql).toContain("latitude BETWEEN -90 AND 90");
  expect(sql).toContain("longitude BETWEEN -180 AND 180");
  expect(sql).toContain("gps_accuracy_m>0");
  expect(sql).toContain("latitude IS NOT NULL AND longitude IS NOT NULL");
  expect(sql).toContain("evidence_original_filename IS NOT NULL");
  expect(sql).toContain("evidence_sha256 NOT SIMILAR TO '%[^0-9a-f]%'");
  expect(sql).toContain("evidence_size_bytes BETWEEN 1 AND 15728640");
  expect(sql).toContain("projects/'||project_id::text||'/field-captures/'||local_capture_id::text");
 });
 it("uses a transaction and has no destructive migration operations",()=>{
  expect((sql.match(/^BEGIN;$/gim)||[]).length).toBe(1);
  expect((sql.match(/^COMMIT;$/gim)||[]).length).toBe(1);
  expect(sql).not.toMatch(/^\s*(DROP\s+TABLE|DROP\s+SCHEMA|TRUNCATE)\b/im);
 });
});

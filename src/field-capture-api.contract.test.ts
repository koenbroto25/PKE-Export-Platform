import{describe,it,expect}from"vitest";
import{readFileSync}from"node:fs";
import{join}from"node:path";
const api=readFileSync(join(process.cwd(),"src/index.ts"),"utf8");
describe("P23 Field Capture API boundary",()=>{
 it("requires authenticated task update permission for upload and sync",()=>{
  expect(api).toContain('/api/v1/projects/:projectId/field-captures",requireAuth');
  expect(api).toContain("requireProjectPermission(req,res,projectId,\"project.tasks.view\")");
  expect(api).toContain('/api/v1/projects/:projectId/field-captures/presigned-upload",requireAuth');
  expect(api).toContain('/api/v1/projects/:projectId/field-captures/sync",requireAuth');
  expect(api).toContain('requireProjectPermission(req,res,projectId,"project.tasks.update")');
 });
 it("server-proxies raw image uploads to avoid storage CORS and verifies checksum",()=>{
  expect(api).toContain('/api/v1/projects/:projectId/field-captures/upload",requireAuth');
  expect(api).toContain('express.raw({type:["image/jpeg","image/png","image/webp"],limit:"15mb"})');
  expect(api).toContain("privateStorage.uploadObject(objectKey,mimeType,body,sha256)");
  expect(api).toContain("FIELD_CAPTURE_UPLOAD_FAILED");
  expect(api).toContain("X-Original-Filename, X-Object-Key");
  expect(api).toContain("x-field-capture-id");
  expect(api).toContain("x-work-item-id");
 });
 it("exposes server review history and role-gated maker-checker review endpoint",()=>{
  expect(api).toContain("project_field_capture_review_events");
  expect(api).toContain("can_review");
  expect(api).toContain('/api/v1/projects/:projectId/field-captures/:submissionId/review",requireAuth');
  expect(api).toContain("project.tasks.resolve");
  expect(api).toContain("pke_review_field_capture_submission");
  expect(api).toContain("FIELD_CAPTURE_MAKER_CHECKER");
  expect(api).toContain("FIELD_CAPTURE_FINAL_DECISION");
 });
 it("revalidates active task assignment server-side and fails closed",()=>{
  expect(api).toContain("requireAssignedFieldCaptureWorkItem");
  expect(api).toContain("wi.assignee_user_id=$3::uuid");
  expect(api).toContain("wi.status NOT IN ('resolved','closed','cancelled')");
  expect(api).toContain("FIELD_CAPTURE_ASSIGNMENT_REQUIRED");
 });
 it("verifies private evidence checksum before creating authoritative submission",()=>{
  expect(api).toContain("privateStorage.verifyObject(input.evidenceObjectKey");
  expect(api).toContain("FIELD_CAPTURE_EVIDENCE_VERIFICATION_FAILED");
  expect(api).toContain("FIELD_CAPTURE_PAYLOAD_CONFLICT");
  expect(api).toContain('/api/v1/projects/:projectId/field-captures",requireAuth');
  expect(api).toContain("field.capture.submitted");
  expect(api).toContain("recordRegulatoryAudit(req");
 });
 it("uses idempotent server submission and never auto-updates task status",()=>{
  expect(api).toContain("ON CONFLICT(project_id,actor_user_id,local_capture_id) DO NOTHING RETURNING *");
  expect(api).toContain("project_field_capture_submissions");
  expect(api).not.toMatch(/UPDATE public\.project_work_items[^;]+field_capture/i);
 });
});

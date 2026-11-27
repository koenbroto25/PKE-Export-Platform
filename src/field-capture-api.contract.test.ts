import{describe,it,expect}from"vitest";
import{readFileSync}from"node:fs";
import{join}from"node:path";
const api=readFileSync(join(process.cwd(),"src/index.ts"),"utf8");
describe("P23 Field Capture API boundary",()=>{
 it("requires authenticated task update permission for upload and sync",()=>{
  expect(api).toContain('/api/v1/projects/:projectId/field-captures/presigned-upload",requireAuth');
  expect(api).toContain('/api/v1/projects/:projectId/field-captures/sync",requireAuth');
  expect(api).toContain('requireProjectPermission(req,res,projectId,"project.tasks.update")');
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
  expect(api).toContain("FIELD_CAPTURE_PAYLOAD_CONFLICT");\n  expect(api).toContain('/api/v1/projects/:projectId/field-captures",requireAuth');\n  expect(api).toContain("field.capture.submitted");\n  expect(api).toContain("recordRegulatoryAudit(req");
 });
 it("uses idempotent server submission and never auto-updates task status",()=>{
  expect(api).toContain("ON CONFLICT(project_id,actor_user_id,local_capture_id) DO NOTHING RETURNING *");
  expect(api).toContain("project_field_capture_submissions");
  expect(api).not.toMatch(/UPDATE public\.project_work_items[^;]+field_capture/i);
 });
});

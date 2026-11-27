import{describe,it,expect}from"vitest";
import{readFileSync}from"node:fs";
import{join}from"node:path";
const frontend=readFileSync(join(process.cwd(),"frontend/src/FieldCapturePage.tsx"),"utf8");
const apiClient=readFileSync(join(process.cwd(),"frontend/src/api.ts"),"utf8");
const storage=readFileSync(join(process.cwd(),"src/storage.ts"),"utf8");
describe("P26 CORS-independent Field Capture evidence upload",()=>{
 it("uses the authenticated same-origin binary API helper from the client",()=>{
  expect(apiClient).toContain("export async function postBinary<T>");
  expect(apiClient).toContain("Authorization");
  expect(apiClient).toContain("headers.set('Content-Type', contentType)");
  expect(frontend).toContain("postBinary");
  expect(frontend).toContain("/field-captures/upload");
  expect(frontend).not.toContain("presigned.uploadUrl");
  expect(frontend).not.toContain("fetch(presigned.upload.uploadUrl");
 });
 it("binds the upload to Project, capture and assigned task identifiers",()=>{
  expect(frontend).toContain("'X-Field-Capture-Id'");
  expect(frontend).toContain("'X-Work-Item-Id'");
  expect(frontend).toContain("'X-Original-Filename'");
  expect(frontend).toContain("uploaded.verified");
  expect(frontend).toContain("uploaded.sha256.toLowerCase()");
 });
 it("verifies payload locally and on the storage provider and cleans up verification failure",()=>{
  expect(storage).toContain("async uploadObject(objectKey: string, mimeType: string, body: Buffer, expectedSha256: string)");
  expect(storage).toContain("actualSha256.toLowerCase() !== expectedSha256.toLowerCase()");
  expect(storage).toContain("return await this.verifyObject(objectKey, body.length, expectedSha256)");
  expect(storage).toContain("await this.deleteObject(objectKey)");
 });
});

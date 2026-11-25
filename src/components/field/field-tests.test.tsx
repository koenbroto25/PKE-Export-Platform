import {describe,it,expect} from "vitest";
import {createFieldDraft} from "./field-offline-queue";
describe("field offline draft contract",()=>{
 it("creates an immutable local draft with unique id, capture time and queued state",async()=>{
  const a=await createFieldDraft({principalId:"U-1",projectId:"P-1",assignmentId:"A-1",kind:"checkpoint",note:"Captured"});
  const b=await createFieldDraft({projectId:"P-1",assignmentId:"A-1",kind:"checkpoint",note:"Captured"});
  expect(a.id).not.toBe(b.id);expect(a.projectId).toBe("P-1");expect(a.assignmentId).toBe("A-1");expect(a.status).toBe("queued");expect(Date.parse(a.capturedAt)).not.toBeNaN();
 });
 it("preserves optional evidence and GPS metadata without asserting server verification",async()=>{
  const blob=new Blob(["field-evidence"],{type:"image/jpeg"});const d=await createFieldDraft({principalId:"U-1",projectId:"P",assignmentId:"A",kind:"inspection",note:"ok",latitude:-3,longitude:114,accuracy:10,evidenceName:"photo.jpg",evidenceType:"image/jpeg",evidenceSize:blob.size,evidenceBlob:blob});
  expect(d.latitude).toBe(-3);expect(d.longitude).toBe(114);expect(d.evidenceName).toBe("photo.jpg");expect(d.status).toBe("queued");expect(d.evidenceBlob).toBe(blob);expect(d.checksum).toMatch(/^[a-f0-9]{64}$/);
 });
});

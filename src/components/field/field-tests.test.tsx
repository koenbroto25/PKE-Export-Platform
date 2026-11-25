import {describe,it,expect} from "vitest";
import {createFieldDraft} from "./field-offline-queue";
describe("field offline draft contract",()=>{
 it("creates an immutable local draft with unique id, capture time and queued state",async()=>{
  const a=await createFieldDraft({principalId:"U-1",projectId:"P-1",assignmentId:"A-1",kind:"checkpoint",note:"Captured"});
  const b=await createFieldDraft({principalId:"U-1",projectId:"P-1",assignmentId:"A-1",kind:"checkpoint",note:"Captured"});
  expect(a.id).not.toBe(b.id);expect(a.projectId).toBe("P-1");expect(a.assignmentId).toBe("A-1");expect(a.status).toBe("queued");expect(Date.parse(a.capturedAt)).not.toBeNaN();
 });
 it("preserves optional evidence and GPS metadata without asserting server verification",async()=>{
  const blob=new Blob(["field-evidence"],{type:"image/jpeg"});const d=await createFieldDraft({principalId:"U-1",projectId:"P",assignmentId:"A",kind:"inspection",note:"ok",latitude:-3,longitude:114,accuracy:10,gpsCapturedAt:"2026-11-25T12:30:00.000Z",evidenceName:"photo.jpg",evidenceType:"image/jpeg",evidenceSize:blob.size,evidenceBlob:blob});
  expect(d.latitude).toBe(-3);expect(d.longitude).toBe(114);expect(d.gpsCapturedAt).toBe("2026-11-25T12:30:00.000Z");expect(d.evidenceName).toBe("photo.jpg");expect(d.status).toBe("queued");expect(d.evidenceBlob).toBe(blob);expect(d.checksum).toMatch(/^[a-f0-9]{64}$/);
 });
});

describe("field draft input validation backtest",()=>{
 it("rejects missing identity, project, assignment and empty note",async()=>{
  await expect(createFieldDraft({principalId:"",projectId:"P",assignmentId:"A",kind:"checkpoint",note:"x"})).rejects.toThrow(/principalId/);
  await expect(createFieldDraft({principalId:"U",projectId:"",assignmentId:"A",kind:"checkpoint",note:"x"})).rejects.toThrow(/projectId/);
  await expect(createFieldDraft({principalId:"U",projectId:"P",assignmentId:"",kind:"checkpoint",note:"x"})).rejects.toThrow(/assignmentId/);
  await expect(createFieldDraft({principalId:"U",projectId:"P",assignmentId:"A",kind:"checkpoint",note:"   "})).rejects.toThrow(/note is required/);
 });
 it("rejects out-of-range coordinates, invalid accuracy and timestamp",async()=>{
  await expect(createFieldDraft({principalId:"U",projectId:"P",assignmentId:"A",kind:"checkpoint",note:"ok",latitude:91,longitude:181,accuracy:0,gpsCapturedAt:"bad"})).rejects.toThrow(/latitude.*longitude.*accuracy.*gpsCapturedAt/);
 });
 it("rejects evidence metadata without blob, invalid MIME, empty/oversize file and inconsistent metadata",async()=>{
  await expect(createFieldDraft({principalId:"U",projectId:"P",assignmentId:"A",kind:"inspection",note:"ok",evidenceName:"photo.jpg",evidenceType:"image/jpeg",evidenceSize:1})).rejects.toThrow(/evidenceBlob/);
  const badType=new Blob(["x"],{type:"text/plain"});
  await expect(createFieldDraft({principalId:"U",projectId:"P",assignmentId:"A",kind:"inspection",note:"ok",evidenceName:"file.txt",evidenceType:"text/plain",evidenceSize:1,evidenceBlob:badType})).rejects.toThrow(/evidenceType/);
  const large=new Blob([new Uint8Array(15*1024*1024+1)],{type:"image/jpeg"});
  await expect(createFieldDraft({principalId:"U",projectId:"P",assignmentId:"A",kind:"inspection",note:"ok",evidenceName:"large.jpg",evidenceType:"image/jpeg",evidenceSize:large.size,evidenceBlob:large})).rejects.toThrow(/15 MB/);
  const valid=new Blob(["abc"],{type:"image/jpeg"});
  await expect(createFieldDraft({principalId:"U",projectId:"P",assignmentId:"A",kind:"inspection",note:"ok",evidenceName:"photo.jpg",evidenceType:"image/jpeg",evidenceSize:99,evidenceBlob:valid})).rejects.toThrow(/evidenceSize/);
 });
});

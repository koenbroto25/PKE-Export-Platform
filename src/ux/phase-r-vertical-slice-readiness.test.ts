import{describe,it,expect}from"vitest";
import{P27_VERTICAL_SLICES,p27VerticalSliceSummary}from"./phase-r-vertical-slice-readiness";
describe("P27 cross-role operational vertical-slice evidence",()=>{
 it("reports slice statuses without overstating full readiness",()=>{
  expect(p27VerticalSliceSummary()).toMatchObject({total:13,pass:1,partial:8,gap:2,blocked:2,allEvidencePresent:true});
  expect(P27_VERTICAL_SLICES.some(x=>x.status==="gap"||x.status==="blocked")).toBe(true);
 });
 it("marks appointment-first PM flow as UAT pass and Field Capture as partial",()=>{
  expect(P27_VERTICAL_SLICES.find(x=>x.id==="pm-contract-project-portfolio")?.status).toBe("pass");
  expect(P27_VERTICAL_SLICES.find(x=>x.id==="field-capture-server-acceptance")?.status).toBe("partial");
 });
 it("does not claim port, customs, settlement or operational cross-document live E2E completion",()=>{
  for(const id of ["port-vessel-loading-tally","customs-permit-document-trace","quantity-cross-document-reconciliation","finance-obligation-cash-plan-reporting"])expect(P27_VERTICAL_SLICES.find(x=>x.id===id)?.status).toBe("partial");
 });
 it("keeps provider license and bank execution dependencies external",()=>{
  expect(P27_VERTICAL_SLICES.find(x=>x.id==="ais-provider-license")?.status).toBe("blocked");
  expect(P27_VERTICAL_SLICES.find(x=>x.id==="external-bank-execution")?.status).toBe("blocked");
 });
});

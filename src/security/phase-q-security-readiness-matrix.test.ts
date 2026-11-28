import{describe,it,expect}from"vitest";
import{P25_SECURITY_READINESS,p25SecuritySummary}from"./phase-q-security-readiness-matrix";
describe("P25 final security and production readiness matrix",()=>{
 it("reports explicit evidence and does not overstate overall security readiness",()=>{
  expect(p25SecuritySummary()).toMatchObject({total:10,pass:1,partial:5,gap:2,blocked:2,allHaveEvidence:true});
  expect(P25_SECURITY_READINESS.some(x=>x.status==="gap"||x.status==="blocked")).toBe(true);
 });
 it("keeps PM RLS isolation backed by UAT evidence",()=>{
  expect(P25_SECURITY_READINESS.find(x=>x.id==="pm-project-rls-isolation")?.status).toBe("pass");
  expect(P25_SECURITY_READINESS.find(x=>x.id==="field-capture-rls")?.status).toBe("partial");
 });
 it("does not claim all API permissions, session, maker-checker or object storage are fully integrated",()=>{
  for(const id of ["api-role-permission-parity","auth-session-lifecycle","maker-checker-audit","private-object-storage"])expect(P25_SECURITY_READINESS.find(x=>x.id===id)?.status).toBe("partial");
 });
 it("keeps backup restore, browser E2E, provider rights and Production release as explicit blockers",()=>{
  for(const id of ["backup-restore-recovery","browser-role-isolation-e2e"])expect(P25_SECURITY_READINESS.find(x=>x.id===id)?.status).toBe("gap");
  for(const id of ["external-provider-rights","production-release"])expect(P25_SECURITY_READINESS.find(x=>x.id===id)?.status).toBe("blocked");
 });
});

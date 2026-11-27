import {describe,it,expect} from "vitest";
import {P23_OPERATIONAL_GAPS,p23GapSummary} from "./phase-o-operational-readiness-matrix";
import {readFileSync} from "node:fs";
import {join} from "node:path";
const read=(p:string)=>readFileSync(join(process.cwd(),p),"utf8");
describe("P23 role-based operational UX readiness gap matrix",()=>{
 const dashboard=read("frontend/src/RoleDashboardPage.tsx");
 const pm360=read("frontend/src/PMProject360.tsx");
 const field=read("frontend/src/FieldCapturePage.tsx");
 it("contains a unique, evidence-backed gap for each major incomplete integration",()=>{
  expect(P23_OPERATIONAL_GAPS.length).toBeGreaterThanOrEqual(8);
  expect(new Set(P23_OPERATIONAL_GAPS.map(x=>x.id)).size).toBe(P23_OPERATIONAL_GAPS.length);
  expect(p23GapSummary().allHaveEvidence).toBe(true);
  for(const g of P23_OPERATIONAL_GAPS){expect(g.currentTruth.trim().length).toBeGreaterThan(20);expect(g.acceptanceEvidence.length).toBeGreaterThan(0);expect(g.roles.length).toBeGreaterThan(0);}
 });
 it("does not mislabel Field Capture as a server-accepted operational transaction",()=>{
  expect(field).toContain("Draft dan bukti tersimpan lokal. Belum dikirim atau diterima server.");
  expect(field).toContain("Sync server, upload evidence, conflict handling, and authoritative acceptance are not available");
  expect(P23_OPERATIONAL_GAPS.find(x=>x.id==="field-capture-server-sync")?.status).toBe("gap");
 });
 it("keeps production/QC, port/loading, customs and reconciliation readiness explicitly unverified",()=>{
  for(const text of ["Production, packing & quality","Port & loading","Official customs / permit status","Quantity / document reconciliation"])expect(dashboard).toContain(text);
  expect(pm360).toContain("Tahap yang belum mempunyai integrasi verified akan ditandai");
  for(const id of ["production-packing-quality-integration","port-loading-readiness","official-customs-permit-status","quantity-document-reconciliation"])expect(P23_OPERATIONAL_GAPS.find(x=>x.id===id)?.status).toBe("gap");
 });
 it("keeps bank execution and external-provider rights as explicit blockers rather than inferred features",()=>{
  expect(dashboard).toContain("bank execution dan reconciliation belum tersedia");
  expect(P23_OPERATIONAL_GAPS.find(x=>x.id==="bank-execution-settlement")?.status).toBe("gap");
  expect(P23_OPERATIONAL_GAPS.find(x=>x.id==="external-crosscheck-provider")?.status).toBe("blocked-external");
 });
 it("records browser multi-role E2E as missing and not replaced by static route tests",()=>{
  expect(P23_OPERATIONAL_GAPS.find(x=>x.id==="browser-e2e")?.status).toBe("gap");
  expect(P23_OPERATIONAL_GAPS.find(x=>x.id==="browser-e2e")?.acceptanceEvidence).toContain("browser runner in CI");
 });
});

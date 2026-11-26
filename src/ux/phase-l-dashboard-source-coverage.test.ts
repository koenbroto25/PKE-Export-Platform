import{describe,it,expect}from"vitest";import{readFileSync}from"node:fs";import{join}from"node:path";
const read=(p:string)=>readFileSync(join(process.cwd(),p),"utf8");
describe("Phase L role-dashboard source coverage and truthful readiness",()=>{
 const dashboard=read("frontend/src/RoleDashboardPage.tsx");
 const pm360=read("frontend/src/PMProject360.tsx");
 it("loads its dashboard source domains from explicit API endpoints",()=>{
  for(const endpoint of ["/projects","/reports/portfolio","/work-items","/contracts?projectId=","/contract-programs?projectId=","/warehouse-receipts?projectId=","/inventory-lots?projectId=","/truck-trips?projectId=","/shipment-allocations?projectId=","/documents","/document-requirements","/ap-invoices?projectId=","/ar-invoices?projectId=","/cash-advances?projectId=","/journal-entries?projectId=","/reports/project/"])expect(dashboard).toContain(endpoint);
 });
 it("keeps source failures and missing payloads unknown instead of zero",()=>{
  expect(dashboard).toContain("sourceFailed");
  expect(dashboard).toContain("hasOwnProperty.call(data, key)");
  expect(dashboard).toContain("? '—' : fmt");
  expect(dashboard).toContain("errors.push");
  expect(dashboard).toContain("state.errors");
 });
 it("explicitly marks unintegrated critical operational stages",()=>{
  for(const label of ["Production, packing & quality","Port & loading","Official customs / permit status","Quantity / document reconciliation","Field mobile capture & offline sync"])expect(dashboard).toContain(label);
  expect(dashboard).toContain("not_integrated");
  expect(dashboard).toContain("belum terintegrasi");
  expect(dashboard).toContain("belum tersedia");
 });
 it("PM Project 360 never treats record counts as approval/readiness and links role workspaces",()=>{
  expect(pm360).toContain("Record existence is evidence of data, not proof of stage approval or readiness");
  expect(pm360).toContain("Status disimpulkan hanya dari source yang diketahui");
  expect(pm360).toContain("status approval tidak diinferensikan");
  expect(pm360).toContain("CrossProcessDependencyPanel");
  expect(pm360).toContain("KnowledgeReviewQueuePanel");
  expect(pm360).toContain("Workspace access not granted");
 });
 it("declares known integration gaps for production, quality, port/loading, customs, reconciliation and field sync",()=>{
  const gaps=[
   "Production Batch","Packing Batch","QC Sample","Lab Result","QA Release",
   "Vessel/Port Call","Loading Plan","survey","laytime","AIS provider rights/freshness",
   "PEB/NPE","Lartas/permit","COO/e-SKA","bank execution","reconciliation",
   "barcode","offline queue","sync conflict","signature",
  ];
  for(const gap of gaps)expect(dashboard+pm360).toContain(gap);
 });
});

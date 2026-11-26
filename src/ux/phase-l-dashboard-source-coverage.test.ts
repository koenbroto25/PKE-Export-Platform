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
  expect(dashboard).toContain("Array.isArray(rows) ? fmt(rows.length) : '—'");
  expect(dashboard).toContain("!Array.isArray((data.apInvoices as RecordData)?.apInvoices)");
  expect(dashboard).toContain("!Array.isArray((data.contracts as RecordData)?.contracts)");
  expect(dashboard).toContain("? '—' : fmt");
  expect(dashboard).toContain("errors.push");
  expect(dashboard).toContain("state.errors");
 });
 it("explicitly marks unintegrated critical operational stages",()=>{
  for(const label of ["Production, packing & quality","Port & loading","Official customs / permit status","Quantity / document reconciliation","Field mobile capture & offline sync"])expect(dashboard).toContain(label);
  expect(dashboard).toContain("Draft lokal");
  expect(dashboard).toContain("GPS, foto bukti, assignment cache dan IndexedDB offline draft tersedia");
  expect(dashboard).toContain("server sync/upload, conflict resolution, barcode dan signature");
  expect(dashboard).toContain("not_integrated");
  expect(dashboard).toContain("hasPageAccess('field', activeUser as WorkspaceAccessUser)");
  expect(dashboard).toContain("hasPageAccess('port-network', activeUser as WorkspaceAccessUser)");
  expect(dashboard).toContain("hasPageAccess('maritime-operations', activeUser as WorkspaceAccessUser)");
  expect(dashboard).toContain("hasPageAccess('shipment-allocations', activeUser as WorkspaceAccessUser)");
  expect(dashboard).toContain("hasPageAccess('p1-workflows', activeUser as WorkspaceAccessUser) ? '/p1-workflows' : '/operations'");
  expect(dashboard).toContain("hasPageAccess('maritime-operations', activeUser as WorkspaceAccessUser) ? '/maritime-operations' : '/port-network'");
  expect(dashboard).toContain("hasPageAccess('finance', activeUser as WorkspaceAccessUser) ? '/finance' : '/journal-entries'");
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
   "barcode","offline draft","sync conflict","signature",
  ];
  for(const gap of gaps)expect(dashboard+pm360).toContain(gap);
 });
});

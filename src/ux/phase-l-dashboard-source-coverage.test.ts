import{describe,it,expect}from"vitest";import{readFileSync}from"node:fs";import{join}from"node:path";
const read=(p:string)=>readFileSync(join(process.cwd(),p),"utf8");
describe("Phase L role-dashboard source coverage and truthful readiness",()=>{
 const dashboard=read("frontend/src/RoleDashboardPage.tsx");
 const app=read("frontend/src/App.tsx");
 const pm360=read("frontend/src/PMProject360.tsx");
 const adminControl=read("frontend/src/AdminControlCenter.tsx");
 it("loads its dashboard source domains from explicit API endpoints",()=>{
  for(const endpoint of ["/projects","/reports/portfolio","/work-items","/contracts?projectId=","/contract-programs?projectId=","/warehouse-receipts?projectId=","/inventory-lots?projectId=","/truck-trips?projectId=","/shipment-allocations?projectId=","/documents","/document-requirements","/ap-invoices?projectId=","/ar-invoices?projectId=","/cash-advances?projectId=","/journal-entries?projectId=","/reports/project/"])expect(dashboard).toContain(endpoint);
 });

 it("clears prior Project data and ignores stale responses after scope changes or overlapping refreshes",()=>{
  expect(dashboard).toContain("const loadGeneration = useRef(0)");
  expect(dashboard).toContain("const requestGeneration = ++loadGeneration.current");
  expect(dashboard).toContain("setState({ data: {}, loading: true, errors: [] })");
  expect(dashboard).toContain("if (requestGeneration !== loadGeneration.current) return;");
 });

 it("does not turn missing task payload into zero counts or an empty-task assertion",()=>{
  expect(dashboard).toContain("const workItemRows: RecordData[] | null = Array.isArray");
  expect(dashboard).toContain("sourceFailed('workItems') || !workItemRows ? '—'");
  expect(dashboard).toContain("workItemRows?.length === 0");
  expect(dashboard).toContain("Antrean belum tersedia karena payload sumber belum terverifikasi.");
 });

 it("only loads dashboard metrics when their destination workspace is accessible",()=>{
  for(const pair of [
   "can('project.tasks.view') && hasPageAccess('my-work'",
   "can('contract.view') && hasPageAccess('contracts'",
   "can('inventory.view') && hasPageAccess('warehouse'",
   "can('warehouse.view') && hasPageAccess('warehouse'",
   "can('logistics.view') && hasPageAccess('operations'",
   "can('shipping.view') && hasPageAccess('shipment-allocations'",
   "can('documents.view') && hasPageAccess('compliance'",
   "can('finance.view') && hasPageAccess('finance'",
   "can('accounting.view') && hasPageAccess('journal-entries'",
   "(can('reports.view') || can('report.view')) && hasPageAccess('reports'",
  ]) expect(dashboard).toContain(pair);
 });

 it("Admin Control Tower renders missing nested metrics as unknown rather than zero",()=>{
  for(const field of ["shipment_count","planned_quantity","loading_operations","voyage_count","pending_nominations","actual_port_calls","approved_documents","overdue_work_items","open_exceptions"]) expect(dashboard).toContain(`?.${field}??'—'`);
 });

 it("Admin Control Center distinguishes unavailable project source from verified zero and preserves partial-source visibility",()=>{
  expect(adminControl).toContain("const projectSourceAvailable = Array.isArray(projects)");
  expect(adminControl).toContain("value={projectSourceAvailable ? projectRows.length : '—'}");
  expect(adminControl).toContain("projectRows.every(p => typeof p.status === 'string')");
  expect(adminControl).toContain("projectVolumeKnown");
  expect(adminControl).toContain("state={activeCount !== '—' ? 'available' : 'unknown'}");
  expect(adminControl).toContain("state={volume !== '—' ? 'available' : 'unknown'}");
  expect(adminControl).toContain("projectSourceAvailable && projectRows.length===0");
  expect(adminControl).toContain("Project source belum terverifikasi");
  expect(adminControl).toContain("key={p.id || p.name || index}");
  expect(adminControl).toContain("const canOpen = (page:string) => allowedPages.includes(page)");
  expect(adminControl).toContain("canOpen('access') ? <Link");
  expect(adminControl).toContain("canOpen('projects') ? <Link");
  expect(adminControl).toContain("canOpen('my-work') ? <Link");
  expect(adminControl).toContain("canOpen('reports') ? <Link");
  expect(adminControl).toContain("canOpenProjectDetail ? <Link");
  expect(app).toContain("allowedPages={visiblePageKeys(activeUser || {})} canOpenProjectDetail={hasPageAccess('project-detail', activeUser || {})}");
  expect(adminControl).toContain("canOpenProjectDetail ? <Link");
 });

 it("Executive Overview clears prior source data and never presents missing project/trip/task payloads as zero",()=>{
  expect(app).toContain("setData(null)");
  expect(app).toContain("const projectRowsVerified = Array.isArray(projects.data?.projects)");
  expect(app).toContain("const projectTargetsVerified = projectRowsVerified");
  expect(app).toContain("const tripRowsVerified = Boolean(projectId && canViewLogistics) && Array.isArray(trips.data?.truckTrips)");
  expect(app).toContain("Boolean(projectId && canViewLogistics) && Array.isArray(trips.data?.truckTrips)");
  expect(app).toContain("Promise.resolve({})");
  expect(app).not.toContain("Promise.resolve({ truckTrips: [] })");
  expect(app).not.toContain("Promise.resolve({ contracts: [] })");
  expect(app).toContain("const visibleTripCount = tripRowsVerified ? tripRows.length : null");
  expect(app).toContain("const countText = (rows: AnyRecord[] | null) => rows === null ? '—'");
  expect(app).toContain('taskRows === null ? "—"');
  expect(app).toContain("Project source terverifikasi mengembalikan nol record");
  expect(app).toContain("r.target_quantity !== null && r.target_quantity !== undefined ? number(r.target_quantity) : '—'");
  expect(app).toContain("Tracking source terverifikasi mengembalikan nol event");
  expect(app).toContain("Payload task belum terverifikasi; angka 0 tidak ditampilkan.");
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

 it("PM Project 360 never displays unverified source payloads as zero evidence or confirmed empty",()=>{
  expect(pm360).toContain("const sourceVerified = (key:string)");
  expect(pm360).toContain("sources[key].payloadValid!==false");
  expect(pm360).toContain("s.payloadValid===false||!Array.isArray(s.rows)");
  expect(app).toContain("payloadValid:Array.isArray(contracts.data?.contracts)");
  expect(app).toContain("payloadValid:Array.isArray(programs.data?.contractPrograms)");
  expect(app).toContain("payloadValid:Array.isArray(tasks.data?.workItems)");
  expect(app).toContain("payloadValid:Array.isArray(inventory.data?.inventoryLots)");
  expect(app).toContain("payloadValid:Array.isArray(trips.data?.truckTrips)");
  expect(app).toContain("payloadValid:Array.isArray(documents.data?.documents)");
  expect(app).toContain("payloadValid:Array.isArray(requirements.data?.documentRequirements)");
  expect(app).toContain("payloadValid:Array.isArray(supply.data?.participations)");
  expect(pm360).toContain("const safeSourceCount = (key:string, rows:Row[]) => sourceVerified(key) ? rows.length : '—'");
  expect(pm360).toContain("const taskCount=safeSourceCount('tasks',tasks)");
  expect(pm360).toContain("const documentCount=");
  expect(pm360).toContain("const evidenceVerifiedEmpty = evidenceSummary.every(x=>x.count===0)");
  expect(pm360).toContain("if(!s||s.loading||s.error||s.authorized===false) return 'unknown'");
  expect(pm360).toContain("if(s.payloadValid===false||!Array.isArray(s.rows)) return 'unknown'");
  expect(pm360).toContain("if(s.available===false) return 'unavailable'");
  expect(pm360).toContain("sourceVerified('tasks') ? tasks.filter");
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

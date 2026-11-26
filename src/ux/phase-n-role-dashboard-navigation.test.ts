import{describe,it,expect}from"vitest";import{readFileSync}from"node:fs";import{join}from"node:path";
const read=(p:string)=>readFileSync(join(process.cwd(),p),"utf8");
describe("Phase N role-dashboard navigation route coverage",()=>{
 const roleDashboard=read("frontend/src/RoleDashboardPage.tsx");
 const app=read("frontend/src/App.tsx");
 it("every role dashboard link resolves to an app route or navigation item",()=>{
  const links=[...roleDashboard.matchAll(/to:\s*['"]([^'"]+)['"]/g)].map(m=>m[1]);
  const unique=[...new Set(links)];
  const missing=unique.filter(path=>!app.includes(`to: '${path}'`)&&!app.includes(`path="${path}"`)&&!app.includes(`path='${path}'`));
  expect(missing).toEqual([]);
  const roleLinkMap=read("frontend/src/RoleDashboardPage.tsx");
  const unmapped=unique.filter(path=>!roleLinkMap.includes(`\x27${path}\x27:`));
  expect(unmapped).toEqual([]);
  expect(unique.length).toBeGreaterThan(15);
 });
 it("dashboard links include work queues and all major export-process workspaces",()=>{
  for(const path of ["/my-work","/contracts","/pks-sites","/operations","/warehouse","/shipment-allocations","/port-network","/maritime-operations","/compliance","/finance","/reports"])expect(roleDashboard).toContain(`to: '${path}'`);
 });
 it("links do not bypass selected Project permission gates",()=>{
  expect(app).toContain("hasPageAccess");
  expect(app).toContain("visiblePageKeys");
  expect(app).toContain("allowedPages");
  expect(app).toContain("function RoleGuard");
  expect(app).toContain("const allowed = allowedKeys.some(key => hasPageAccess(key, activeUser));");
  expect(app).toContain("if (!allowed) return <div className=\"panel\">");
  expect(roleDashboard).toContain("role.links.filter");
  expect(roleDashboard).toContain("hasPageAccess(pageKey, activeUser as WorkspaceAccessUser)");
  expect(roleDashboard).toContain("ROLE_LINK_PAGE_KEYS");
  expect(roleDashboard).toContain("Workspace links disembunyikan karena permission belum tersedia.");
  expect(roleDashboard).toContain("item.status === 'permission' || !hasPageAccess(ROLE_LINK_PAGE_KEYS[item.href], activeUser as WorkspaceAccessUser)");
  expect(roleDashboard).toContain("Field mobile capture & offline sync");
  expect(roleDashboard).toContain("href: '/field'");
  for (const role of ["pks_site_manager","production_manager","packing_supervisor","qc_officer","qa_manager","laboratory_officer","hse_officer","warehouse_manager","warehouse_officer","transport_manager","dispatcher","transporter","checker","driver","master_of_loading","loading_supervisor","loading_operator","terminal_representative","shipping_agent","marine_surveyor"]) { const roleLine = roleDashboard.split("\n").find(line => line.trim().startsWith(role + ":")); expect(roleLine).toContain("to: '/field'"); }
 });
});

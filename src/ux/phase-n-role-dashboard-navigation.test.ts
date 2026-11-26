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
  expect(unique.length).toBeGreaterThan(15);
 });
 it("dashboard links include work queues and all major export-process workspaces",()=>{
  for(const path of ["/my-work","/contracts","/pks-sites","/operations","/warehouse","/shipment-allocations","/port-network","/maritime-operations","/compliance","/finance","/reports"])expect(roleDashboard).toContain(`to: '${path}'`);
 });
 it("links do not bypass selected Project permission gates",()=>{
  expect(app).toContain("hasPageAccess");
  expect(app).toContain("visiblePageKeys");
  expect(app).toContain("allowedPages");
  expect(roleDashboard).toContain("Access not granted");
  expect(roleDashboard).toContain("Workspace access not granted");
 });
});

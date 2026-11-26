import { describe, expect, it } from "vitest";
import { hasPageAccess, visiblePageKeys, type WorkspaceAccessUser } from "../../frontend/src/role-permissions";
import { CANONICAL_ROLE_TEMPLATES } from "../role-catalogue";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const make=(role:string,permissions:string[],overrides:Partial<WorkspaceAccessUser>={}) : WorkspaceAccessUser=>({
 selectedProjectId:"SIM-PROJECT-001",projectPermissions:permissions,projectPermissionsLoading:false,
 projectMemberships:[{isActive:true,projectId:"SIM-PROJECT-001",roleAssignments:[{roleCode:role,isActive:true,roleIsActive:true}]}],
 ...overrides,
});
describe("Phase K role dashboard and workspace access matrix",()=>{
 it("shows project dashboard only to an active selected-project member",()=>{
  expect(hasPageAccess("dashboard",make("viewer",[]))).toBe(true);
  expect(hasPageAccess("dashboard",make("viewer",[],{selectedProjectId:"SIM-PROJECT-002"}))).toBe(false);
  expect(hasPageAccess("dashboard",{projectMemberships:[{isActive:true,roleAssignments:[]}]})).toBe(true);
  expect(hasPageAccess("dashboard",make("viewer",[],{projectMemberships:[]}))).toBe(false);
 });
 it("fails closed while permission loading or permission fetch error exists",()=>{
  const u=make("pm",["contract.view"],{projectPermissionsLoading:true});
  expect(hasPageAccess("contracts",u)).toBe(false);
  expect(hasPageAccess("operations",make("pm",["operations.view"],{projectPermissionsError:"permission fetch failed"}))).toBe(false);
 });
 it("keeps finance page restricted by both role and permission",()=>{
  expect(hasPageAccess("finance",make("finance",["finance.view"]))).toBe(true);
  expect(hasPageAccess("finance",make("warehouse_manager",["finance.view"]))).toBe(false);
  expect(hasPageAccess("finance",make("pm",["finance.view"]))).toBe(true);
  expect(hasPageAccess("finance",make("finance",[]))).toBe(false);
 });
 it("restricts reports to designated roles even if permission exists",()=>{
  expect(hasPageAccess("reports",make("viewer",["reports.view"]))).toBe(true);
  expect(hasPageAccess("reports",make("driver",["reports.view"]))).toBe(false);
  expect(hasPageAccess("reports",make("finance",["report.view"]))).toBe(true);
 });
 it("requires all transporter permissions and role code",()=>{
  expect(hasPageAccess("transporter",make("transporter",["record_truck_trips","verify_checkpoints"]))).toBe(true);
  expect(hasPageAccess("transporter",make("driver",["record_truck_trips","verify_checkpoints"]))).toBe(true);
  expect(hasPageAccess("transporter",make("transporter",["record_truck_trips"]))).toBe(false);
 });
 it("requires scoped warehouse, supplier and funder capabilities",()=>{
  expect(hasPageAccess("warehouse",make("warehouse_manager",["warehouse.view","inventory.view"]))).toBe(true);
  expect(hasPageAccess("warehouse",make("warehouse_manager",["warehouse.view"]))).toBe(true);\n  expect(hasPageAccess("warehouse",make("warehouse_manager",[]))).toBe(false);
  expect(hasPageAccess("supplier",make("supplier",["supplier.view","shipment.view"]))).toBe(true);
  expect(hasPageAccess("supplier",make("supplier",["supplier.view"]))).toBe(false);
  expect(hasPageAccess("funder",make("funder",["funder.view"]))).toBe(true);
  expect(hasPageAccess("funder",make("finance",["funder.view"]))).toBe(false);
 });
 it("keeps compliance inaccessible to partner-only roles and requires a non-external permission",()=>{
  expect(hasPageAccess("compliance",make("document_officer",["documents.view","compliance.view"]))).toBe(true);
  expect(hasPageAccess("compliance",make("buyer",["documents.view","buyer.shipment.view"]))).toBe(false);
  expect(hasPageAccess("compliance",make("viewer",["project.view"]))).toBe(false);
 });
 it("keeps Field Capture and My Work role-specific and project-scoped",()=>{
  expect(hasPageAccess("field",make("master_of_loading",["operations.view"]))).toBe(true);
  expect(hasPageAccess("field",make("finance",["operations.view"]))).toBe(false);
  expect(hasPageAccess("my-work",make("pm",["project.tasks.view"]))).toBe(true);
  expect(hasPageAccess("my-work",make("funder",["project.tasks.view"]))).toBe(false);
  expect(hasPageAccess("field",make("driver",["operations.view"],{selectedProjectId:""}))).toBe(false);
 });
 it("exposes only pages allowed by the current role and permissions",()=>{
  const u=make("warehouse_manager",["warehouse.view","inventory.view","project.view"]);
  const pages=visiblePageKeys(u);
  expect(pages).toContain("dashboard");
  expect(pages).toContain("warehouse");
  expect(pages).not.toContain("finance");
  expect(pages).not.toContain("access");
  expect(pages).not.toContain("transporter");
 });
 it("keeps notifications available and access management platform-admin gated",()=>{
  expect(hasPageAccess("notifications",make("viewer",[]))).toBe(true);
  expect(hasPageAccess("access",make("viewer",[]))).toBe(false);
  expect(hasPageAccess("access",make("viewer",[],{platformAdmin:true}))).toBe(true);
  expect(hasPageAccess("port-network",make("viewer",[],{platformAdmin:true}))).toBe(true);
 });
});

 it("provides a role dashboard metadata entry for every canonical role and a project dashboard for every active membership",()=>{
  const dashboardSource=readFileSync(join(process.cwd(),"frontend/src/RoleDashboardPage.tsx"),"utf8");
  const metaKeys=CANONICAL_ROLE_TEMPLATES.map(r=>r.code).filter(code=>dashboardSource.includes(`  ${code}: { label:`));
  const missing=CANONICAL_ROLE_TEMPLATES.map(r=>r.code).filter(code=>!metaKeys.includes(code));
  expect(missing).toEqual([]);
  for(const role of CANONICAL_ROLE_TEMPLATES.filter(r=>r.scope==="project")){
   expect(hasPageAccess("dashboard",make(role.code,[])),role.code).toBe(true);
  }
 });

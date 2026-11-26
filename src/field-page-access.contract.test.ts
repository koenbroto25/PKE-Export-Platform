import {describe,it,expect} from "vitest";
import {hasPageAccess} from "../frontend/src/role-permissions";
const userFor=(roleCode:string,permissions:string[]=["operations.view"])=>({selectedProjectId:"P-1",projectPermissions:permissions,projectMemberships:[{isActive:true,projectId:"P-1",roleAssignments:[{roleCode,isActive:true,roleIsActive:true}]}]});
describe("Field Capture route access",()=>{
 it("allows operational field personas with an active Project permission",()=>{for(const role of ["field_manager","driver","checker","dispatcher","warehouse_manager","master_of_loading","qc_officer"])expect(hasPageAccess("field",userFor(role))).toBe(true)});
 it("does not expose Field Capture to finance or funder personas",()=>{expect(hasPageAccess("field",userFor("finance"))).toBe(false);expect(hasPageAccess("field",userFor("funder"))).toBe(false)});
 it("fails closed without selected Project or permissions",()=>{expect(hasPageAccess("field",userFor("driver",[]))).toBe(false);expect(hasPageAccess("field",{projectMemberships:[{isActive:true,roleAssignments:[{roleCode:"driver",isActive:true}]}]})).toBe(false)});
});

import {readFileSync} from "node:fs";
import {join} from "node:path";
describe("Field Capture account-scoped local retention control",()=>{
 const queue=readFileSync(join(process.cwd(),"src","components","field","field-offline-queue.ts"),"utf8");
 const page=readFileSync(join(process.cwd(),"frontend","src","FieldCapturePage.tsx"),"utf8");
 it("provides principal-scoped purge across both local stores",()=>{
  expect(queue).toContain("deleteFieldLocalDataForPrincipal");
  expect(queue).toContain("db.transaction([STORE,ASSIGNMENT_STORE]");
  expect(queue).toContain('index("principalId").getAll(principalId)');
  expect(queue).toContain("assignmentCaches");
 });
 it("requires explicit irreversible confirmation before account purge",()=>{
  expect(page).toContain("HAPUS PERMANEN semua draft, foto bukti dan cache assignment");
  expect(page).toContain("deleteFieldLocalDataForPrincipal(String(activeUser.id))");
  expect(page).toContain("Data yang belum tersinkron tidak dapat dipulihkan");
 });
});
describe("Field Capture local-data lifecycle UI contract",()=>{
 const page=readFileSync(join(process.cwd(),"frontend","src","FieldCapturePage.tsx"),"utf8");
 it("lets users clear cached assignments even when no draft exists",()=>{
  expect(page).toContain("cache assignment untuk akun dan Project ini");
  expect(page).toContain("disabled={busy} onClick={()=>void clearProjectDrafts()}");
  expect(page).toContain("await deleteFieldAssignmentCache(String(activeUser.id),projectId)");
 });
 it("clearly labels offline cached assignments as stale and unvalidated",()=>{
  expect(page).toContain("Assignment tidak dapat diverifikasi ulang secara online");
  expect(page).toContain("Cache tugas terakhir diperbarui");
 });
 it("does not claim local drafts were server accepted",()=>{
  expect(page).toContain("Belum dikirim atau diterima server");
  expect(page).toContain("Draft belum disinkronkan");
 });
});

import {describe,it,expect} from "vitest";
import {hasPageAccess} from "../frontend/src/role-permissions";
const userFor=(roleCode:string,permissions:string[]=["operations.view"])=>({selectedProjectId:"P-1",projectPermissions:permissions,projectMemberships:[{isActive:true,projectId:"P-1",roleAssignments:[{roleCode,isActive:true,roleIsActive:true}]}]});
describe("Field Capture route access",()=>{
 it("allows operational field personas with an active Project permission",()=>{for(const role of ["field_manager","driver","checker","dispatcher","warehouse_manager","master_of_loading","qc_officer"])expect(hasPageAccess("field",userFor(role))).toBe(true)});
 it("does not expose Field Capture to finance or funder personas",()=>{expect(hasPageAccess("field",userFor("finance"))).toBe(false);expect(hasPageAccess("field",userFor("funder"))).toBe(false)});
 it("fails closed without selected Project or permissions",()=>{expect(hasPageAccess("field",userFor("driver",[]))).toBe(false);expect(hasPageAccess("field",{projectMemberships:[{isActive:true,roleAssignments:[{roleCode:"driver",isActive:true}]}]})).toBe(false)});
});

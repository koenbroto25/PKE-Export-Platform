import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const read=(path:string)=>readFileSync(new URL(path,import.meta.url),"utf8");
const api=read("./index.ts"),service=read("./cash-advance-service.ts");
const ui=read("../frontend/src/App.tsx"),sql=read("../migrations/045_cash_advance_financial_audit.sql");
describe("F1 Cash Advance vertical slice contract",()=>{
 it("binds the requestor to the authenticated identity and explicit role permission",()=>{
  expect(api).toContain('findExplicitProjectPermission(req,projectId,["finance.cash_advance.request"])');
  expect(api).toContain("requestorId:req.user.id");
  expect(sql).toContain("requestor_id=public.pke_current_user_id()");
 });
 it("requires a distinct Finance actor and does not expose disbursement mutations",()=>{
  expect(api).toContain('permission.role_code!=="finance"');
  expect(service).toContain("requestor_id<>$3::uuid");
  expect(sql).toContain("requestor_id<>public.pke_current_user_id()");
  expect(api).not.toContain("SET disbursement_status");
 });
 it("restricts RLS to requestor-own reads or Finance reads and excludes platform Admin bypass",()=>{
  expect(sql).toContain("NOT public.pke_is_platform_admin()");
  expect(sql).toContain("OR public.pke_has_project_permission(project_id,'finance.view')");
 });
 it("adds creation audit events without replacing existing update audit behavior",()=>{
  expect(sql).toContain("pke_financial_creation_audit_event()");
  expect(sql).toContain("existing UPDATE audit function remains untouched");
  for(const t of ["cash_advances","payment_obligations","ap_invoices","ar_invoices"]) expect(sql).toContain("AFTER INSERT ON public."+t);
 });
 it("connects the UI form and decisions to the service API",()=>{
  expect(ui).toContain("function CashAdvancesPage");
  expect(ui).toContain("post('/cash-advances'");
  expect(ui).toContain("patch(`/cash-advances/${row.id}/decision`");
 });
});

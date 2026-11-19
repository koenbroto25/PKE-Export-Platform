import {describe,expect,it} from "vitest";
import {canDecideCashAdvance,isValidCashAdvanceRequest} from "./f1-cash-advance-rules.js";
const request={amount:1250000,currencyId:"464fae2a-80b9-4720-bf29-27e536218658",purpose:"Biaya operasional lapangan",advanceDate:"2026-11-20"};
describe("Cash Advance request validation",()=>{
 it("accepts a valid request",()=>expect(isValidCashAdvanceRequest(request)).toBe(true));
 it.each([0,-1,NaN,Infinity,"abc"])("rejects invalid amount %s",amount=>expect(isValidCashAdvanceRequest({...request,amount})).toBe(false));
 it("rejects invalid currency, purpose and impossible date",()=>{
  expect(isValidCashAdvanceRequest({...request,currencyId:"IDR"})).toBe(false);
  expect(isValidCashAdvanceRequest({...request,purpose:"  "})).toBe(false);
  expect(isValidCashAdvanceRequest({...request,advanceDate:"2026-02-31"})).toBe(false);
 });
});
describe("Cash Advance maker-checker",()=>{
 const base={actorId:"finance",requestorId:"maker",roleCode:"finance",currentStatus:"draft",decision:"approved"};
 it("allows independent Finance",()=>expect(canDecideCashAdvance(base)).toBe(true));
 it("rejects self-approval and non-Finance roles",()=>{
  expect(canDecideCashAdvance({...base,actorId:"maker"})).toBe(false);
  expect(canDecideCashAdvance({...base,roleCode:"pm"})).toBe(false);
  expect(canDecideCashAdvance({...base,roleCode:"platform_admin"})).toBe(false);
 });
 it("rejects terminal states and invalid decisions",()=>{
  expect(canDecideCashAdvance({...base,currentStatus:"approved"})).toBe(false);
  expect(canDecideCashAdvance({...base,decision:"disbursed"})).toBe(false);
 });
});

import {describe,it,expect} from "vitest";
import {evaluateCrosscheck,type CrosscheckEvidence} from "./export-crosscheck";
const ev=(sourceId:string,value:any,unit?:string,verification:"verified"|"unverified"|"pending"="verified",observedAt="2026-11-25T10:00:00Z"):CrosscheckEvidence=>({sourceId,sourceLabel:sourceId,tier:1,value,unit,verification,observedAt});
describe("export cross-check engine advisory contract",()=>{
 it("normalizes metric-tonne and kilogram quantities with tolerance",()=>{
  const f=evaluateCrosscheck({field:"loading_quantity",label:"Loading quantity",type:"quantity",tolerance:0.05,canonicalUnit:"MT"},[ev("tally",100,"MT"),ev("survey",100050,"KG")],Date.parse("2026-11-25T11:00:00Z"));
  expect(f.status).toBe("MATCH");expect(f.variance).toBeCloseTo(0.05);
 });
 it("flags quantities outside tolerance",()=>{
  const f=evaluateCrosscheck({field:"quantity",label:"Quantity",type:"quantity",tolerance:0.1,canonicalUnit:"MT"},[ev("a",100,"MT"),ev("b",100.2,"MT")]);
  expect(f.status).toBe("MISMATCH");expect(f.mismatchPairs).toBe(1);
 });
 it("normalizes text and date comparison",()=>{
  expect(evaluateCrosscheck({field:"buyer",label:"Buyer",type:"text"},[ev("a"," BUYER  ABC "),ev("b","buyer abc")]).status).toBe("MATCH");
  expect(evaluateCrosscheck({field:"date",label:"Date",type:"date"},[ev("a","2026-11-25T00:00:00Z"),ev("b","2026-11-25T18:00:00Z")]).status).toBe("MATCH");
 });
 it("returns MISSING for incomplete source pairs",()=>{
  expect(evaluateCrosscheck({field:"qty",label:"Qty",type:"quantity"},[ev("a",2,"MT")]).status).toBe("MISSING");
 });
 it("returns STALE when evidence exceeds freshness rule",()=>{
  expect(evaluateCrosscheck({field:"eta",label:"ETA",type:"date",maxAgeMs:3600000},[ev("a","2026-11-20"),ev("b","2026-11-25")],Date.parse("2026-11-25T11:00:00Z")).status).toBe("STALE");
 });
 it("does not treat pending or unverified sources as authoritative",()=>{
  expect(evaluateCrosscheck({field:"qty",label:"Qty",type:"quantity"},[ev("a",1,"MT"),ev("b",1,"MT","pending")]).status).toBe("EXTERNAL_CONFIRMATION_PENDING");
  expect(evaluateCrosscheck({field:"qty",label:"Qty",type:"quantity"},[ev("a",1,"MT"),ev("b",1,"MT","unverified")]).status).toBe("UNVERIFIED");
 });
 it("fails closed on unknown units",()=>{
  expect(evaluateCrosscheck({field:"qty",label:"Qty",type:"quantity",canonicalUnit:"MT"},[ev("a",1,"bag"),ev("b",1,"bag")]).status).toBe("UNVERIFIED");
 });
});

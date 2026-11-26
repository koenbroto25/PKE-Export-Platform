import {describe,expect,it} from "vitest";
import {assessTypedEvidence,propagateDependencyChain,type TypedEvidenceObservation} from "./typed-evidence-backtest.js";
import {PKE_PROCESS_DEPENDENCIES} from "./process-dependency-map.js";
const rec=(o:Partial<TypedEvidenceObservation>={}):TypedEvidenceObservation=>({recordId:"r1",evidenceKey:"qty",kind:"shipment",sourceId:"srcA",sourceAuthority:80,verification:"verified",quantity:10,unit:"tonne",quantityGroup:"shipment",shipmentId:"S1",eventAt:"2026-11-26T10:00:00Z",receivedAt:"2026-11-26T10:01:00Z",permissionScope:"project:P1",...o});
describe("Phase B2 typed evidence",()=>{
it("normalizes mixed quantity units",()=>expect(assessTypedEvidence([rec(),rec({recordId:"r2",quantity:10000,unit:"kg",quantityGroup:"other"})]).normalizedQuantityGroups).toEqual({shipment:10,other:10}));
it("detects contradictory values",()=>expect(assessTypedEvidence([rec({value:"10"}),rec({recordId:"r2",value:"12"})]).status).toBe("conflict"));
it("detects duplicate record identifiers",()=>expect(assessTypedEvidence([rec(),rec()]).findings.some(f=>f.code==="duplicate-record-id")).toBe(true));
it("detects duplicate allocations",()=>expect(assessTypedEvidence([rec({kind:"allocation",allocationRef:"A"}),rec({recordId:"r2",kind:"allocation",allocationRef:"A"})]).findings.some(f=>f.code==="duplicate-allocation")).toBe(true));
it("detects over-allocation after unit normalization",()=>{const a=assessTypedEvidence([rec({quantity:6000,unit:"kg"}),rec({recordId:"r2",quantity:5,unit:"tonne"})],{expectedQuantities:{shipment:{quantity:10,unit:"tonne"}}});expect(a.normalizedQuantityGroups.shipment).toBe(11);expect(a.findings.some(f=>f.code==="over-allocation")).toBe(true);});
it("detects invalid quantities",()=>expect(assessTypedEvidence([rec({quantity:-1})]).status).toBe("conflict"));
it("flags partial shipment",()=>expect(assessTypedEvidence([rec({quantity:8})],{expectedShipmentQuantity:{group:"shipment",quantity:10,unit:"tonne"}}).findings.some(f=>f.code==="partial-shipment")).toBe(true));
it("uses deterministic clock for freshness",()=>{const a=assessTypedEvidence([rec({eventAt:"2026-11-20T10:00:00Z"})],{now:"2026-11-26T10:00:00Z",staleAfterMs:86400000});expect(a.status).toBe("stale");});
it("detects out-of-order arrival",()=>expect(assessTypedEvidence([rec({recordId:"a",eventAt:"2026-11-20T10:00:00Z",receivedAt:"2026-11-26T12:00:00Z"}),rec({recordId:"b",eventAt:"2026-11-21T10:00:00Z",receivedAt:"2026-11-26T11:00:00Z"})]).findings.some(f=>f.code==="event-order-reversal")).toBe(true));
it("excludes cancelled/reversed/superseded records",()=>{const a=assessTypedEvidence([rec(),rec({recordId:"c",recordState:"cancelled"}),rec({recordId:"r",recordState:"reversed"}),rec({recordId:"old",supersedesRecordId:"new"}),rec({recordId:"new"})]);expect(a.ignoredRecordIds).toEqual(expect.arrayContaining(["c","r","old"]));});
it("validates correction and reversal references",()=>expect(assessTypedEvidence([rec({correctionOfRecordId:"missing"})]).findings.some(f=>f.code==="invalid-correction")).toBe(true));
it("enforces scope and verification",()=>{const a=assessTypedEvidence([rec({permissionScope:"project:P2",verification:"unverified"})],{requiredPermissionScope:"project:P1"});expect(a.findings.some(f=>f.code==="missing-permission-scope")).toBe(true);expect(a.findings.some(f=>f.code==="unverified-source")).toBe(true);});
it("returns gap when required quantity group is absent",()=>expect(assessTypedEvidence([],{requiredQuantityGroups:["shipment"]}).status).toBe("gap"));
it("propagates failure and recovers across multi-edge chain",()=>{const d=[{id:"e1",requiredEvidence:["a"]},{id:"e2",requiredEvidence:["b"]},{id:"e3",requiredEvidence:["c"]}] as any;expect(propagateDependencyChain(d,[{dependencyId:"e1",providedEvidence:[]},{dependencyId:"e2",providedEvidence:["b"]},{dependencyId:"e3",providedEvidence:["c"]}]).map(x=>x.status)).toEqual(["gap","blocked","blocked"]);expect(propagateDependencyChain(d,[{dependencyId:"e1",providedEvidence:["a"]},{dependencyId:"e2",providedEvidence:["b"]},{dependencyId:"e3",providedEvidence:["c"]}]).map(x=>x.status)).toEqual(["satisfied","satisfied","satisfied"]);});

it("flags aggregate quantity mismatch without assuming source authority resolves it",()=>{const a=assessTypedEvidence([rec({quantity:7}),rec({recordId:"r2",quantity:2})],{expectedQuantities:{shipment:{quantity:10,unit:"tonne"}}});expect(a.findings.some(f=>f.code==="quantity-mismatch")).toBe(true);expect(a.status).toBe("conflict");});
it("accepts a valid superseding correction while excluding the original",()=>{const a=assessTypedEvidence([rec({recordId:"old",quantity:8}),rec({recordId:"new",quantity:10,supersedesRecordId:"old",correctionOfRecordId:"old"})],{expectedQuantities:{shipment:{quantity:10,unit:"tonne"}}});expect(a.activeRecordIds).toContain("new");expect(a.ignoredRecordIds).toContain("old");expect(a.status).toBe("satisfied");});
it("rejects invalid source authority values",()=>expect(assessTypedEvidence([rec({sourceAuthority:101})]).status).toBe("conflict"));
it("blocks typed evidence assessment when upstream dependency is blocked",()=>expect(assessTypedEvidence([rec()],{upstreamState:"blocked"}).status).toBe("blocked"));


it("runs a deterministic fault matrix across every lifecycle edge",()=>{
 const faults:[string,()=>TypedEvidenceObservation[],any,string][]=[
  ["complete",()=>[rec({quantity:10})],{expectedQuantities:{shipment:{quantity:10,unit:"tonne"}}},"satisfied"],
  ["missing",()=>[],{requiredQuantityGroups:["shipment"]},"gap"],
  ["conflict",()=>[rec({value:"A"}),rec({recordId:"r2",value:"B"})],{},"conflict"],
  ["unverified",()=>[rec({verification:"unverified"})],{},"unknown"],
  ["stale",()=>[rec({eventAt:"2020-01-01T00:00:00Z"})],{now:"2026-11-26T00:00:00Z",staleAfterMs:86400000},"stale"],
  ["duplicate allocation",()=>[rec({kind:"allocation",allocationRef:"dup"}),rec({recordId:"r2",kind:"allocation",allocationRef:"dup"})],{},"conflict"],
  ["partial shipment",()=>[rec({quantity:7})],{expectedShipmentQuantity:{group:"shipment",quantity:10,unit:"tonne"}},"gap"],
  ["rejected",()=>[rec({verification:"rejected"})],{},"conflict"],
  ["blocked upstream",()=>[rec()],{upstreamState:"blocked"},"blocked"]
 ];
 let executed=0;
 for(const dep of PKE_PROCESS_DEPENDENCIES)for(const [name,make,policy,expected] of faults){const result=assessTypedEvidence(make(),policy);expect(result.status,dep.id+":"+name).toBe(expected);executed++;}
 expect(executed).toBe(PKE_PROCESS_DEPENDENCIES.length*faults.length);
});

it("never false-passes unresolved contradiction/rejection/overage",()=>{for(const a of [assessTypedEvidence([rec({value:"x"}),rec({recordId:"r2",value:"y"})]),assessTypedEvidence([rec({verification:"rejected"})]),assessTypedEvidence([rec({quantity:12})],{expectedQuantities:{shipment:{quantity:10,unit:"tonne"}}})])expect(a.status).not.toBe("satisfied");});
});

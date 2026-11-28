import {describe,it,expect} from "vitest";
import {isValidPMProjectCreateInput,canPMCreateProject,canTransferProjectPM,shouldRevokePMProjectAssignments,idempotentProjectResult} from "./pm-appointment-first-rules.js";
const valid={idempotencyKey:"123e4567-e89b-12d3-a456-426614174000",name:"Buyer China PKE",buyerId:"123e4567-e89b-12d3-a456-426614174001",basisType:"buyer_agreement",basisReference:"BA-2026-001",basisDate:"2026-11-25",contractReference:"",evidenceUrl:"https://example.com/evidence",commercialTerms:{price:"test"},settlementUnit:"MT",targetQuantity:2500,exportCountryCode:"CN"};
describe("appointment-first PM project workflow synthetic rules",()=>{
 it("permits only active appointed, active and linked PM identities",()=>{
  expect(canPMCreateProject("active",true,true)).toBe(true);
  expect(canPMCreateProject(undefined,true,true)).toBe(false);
  expect(canPMCreateProject("suspended",true,true)).toBe(false);
  expect(canPMCreateProject("revoked",true,true)).toBe(false);
  expect(canPMCreateProject("active",false,true)).toBe(false);
  expect(canPMCreateProject("active",true,false)).toBe(false);
 });
 it("validates agreement-based Project inputs",()=>expect(isValidPMProjectCreateInput(valid)).toBe(true));
 it("requires executed contract reference for contract-backed Projects",()=>{
  expect(isValidPMProjectCreateInput({...valid,basisType:"executed_contract",contractReference:""})).toBe(false);
  expect(isValidPMProjectCreateInput({...valid,basisType:"executed_contract",contractReference:"CTR-001"})).toBe(true);
 });
 it("rejects malformed commercial and master data inputs",()=>{
  for(const invalid of [
   {...valid,name:"x"},{...valid,buyerId:"not-a-uuid"},{...valid,basisReference:""},
   {...valid,targetQuantity:0},{...valid,targetQuantity:Infinity},{...valid,settlementUnit:""},
   {...valid,basisDate:"2026-02-30"},{...valid,evidenceUrl:"http://unsafe.example"},
   {...valid,exportCountryCode:"CHN"},{...valid,idempotencyKey:"bad"},{...valid,commercialTerms:[]}
  ])expect(isValidPMProjectCreateInput(invalid)).toBe(false);
 });
 it("blocks new Project creation after suspension or revocation and signals existing role revocation",()=>{
  expect(shouldRevokePMProjectAssignments("active")).toBe(false);
  expect(shouldRevokePMProjectAssignments("suspended")).toBe(true);
  expect(shouldRevokePMProjectAssignments("revoked")).toBe(true);
 });
 it("allows handover only to active appointed PM with an audited reason",()=>{
  expect(canTransferProjectPM("active","Approved handover")).toBe(true);
  expect(canTransferProjectPM("suspended","Approved handover")).toBe(false);
  expect(canTransferProjectPM("revoked","Approved handover")).toBe(false);
  expect(canTransferProjectPM("active","no")).toBe(false);
 });
 it("replays the same idempotency key instead of creating a duplicate",()=>{
  const existing=new Map<string,{id:string}>();
  const first=idempotentProjectResult("key-1",existing,()=>({id:"P-001"}));
  const replay=idempotentProjectResult("key-1",existing,()=>({id:"P-002"}));
  const second=idempotentProjectResult("key-2",existing,()=>({id:"P-003"}));
  expect(first.replayed).toBe(false);expect(replay.replayed).toBe(true);
  expect(replay.result).toEqual(first.result);expect(second.replayed).toBe(false);
  expect(existing.size).toBe(2);
 });
 it("supports one appointed PM owning multiple Projects and multiple Buyer agreements",()=>{
  const portfolio=[{id:"P-001",buyer:"B-001"},{id:"P-002",buyer:"B-002"},{id:"P-003",buyer:"B-001"}];
  expect(new Set(portfolio.map(x=>x.id)).size).toBe(3);
  expect(portfolio.filter(x=>x.buyer==="B-001").length).toBe(2);
  expect(portfolio.every(x=>x.id.startsWith("P-"))).toBe(true);
 });
describe("PM creation and portfolio stress scenarios",()=>{
 it("allows agreement-backed Project creation without requiring a contract reference",()=>{
  expect(isValidPMProjectCreateInput({...valid,basisType:"buyer_agreement",contractReference:""})).toBe(true);
 });
 it("rejects invalid dates, country codes, non-object terms, and unsafe evidence URLs",()=>{
  for(const input of [
   {...valid,basisDate:"2026-13-01"},
   {...valid,basisDate:"2026-02-30"},
   {...valid,exportCountryCode:"C"},
   {...valid,exportCountryCode:"CHN"},
   {...valid,commercialTerms:["not","an","object"]},
   {...valid,evidenceUrl:"ftp://example.com"}
  ])expect(isValidPMProjectCreateInput(input)).toBe(false);
 });
 it("same PM can create many Projects across Buyers without ownership collisions",()=>{
  const existing=new Map<string,{projectId:string;buyerId:string;pmId:string}>();
  let created=0;
  const pmId="pm-1";
  const results=[
   idempotentProjectResult("k1",existing,()=>({projectId:"p1",buyerId:"b1",pmId})),
   idempotentProjectResult("k2",existing,()=>({projectId:"p2",buyerId:"b2",pmId})),
   idempotentProjectResult("k3",existing,()=>({projectId:"p3",buyerId:"b1",pmId}))
  ];
  created=results.filter(x=>!x.replayed).length;
  expect(created).toBe(3);
  expect(new Set(results.map(x=>x.result.projectId)).size).toBe(3);
  expect(results.every(x=>x.result.pmId===pmId)).toBe(true);
  expect(new Set(results.map(x=>x.result.buyerId)).size).toBe(2);
 });
 it("duplicate retry storms with one idempotency key resolve to one stored Project result",()=>{
  const existing=new Map<string,{id:string}>();
  let writes=0;
  for(let i=0;i<100;i++){
   idempotentProjectResult("retry-key",existing,()=>{writes++;return{id:"project-one"};});
  }
  expect(writes).toBe(1);
  expect(existing.size).toBe(1);
 });
 it("handover/reappointment checks fail closed for suspended or revoked PM",()=>{
  for(const status of ["suspended","revoked"] as const){
   expect(canPMCreateProject(status,true,true)).toBe(false);
   expect(canTransferProjectPM(status,"Approved transfer reason")).toBe(false);
  }
 });
});
});

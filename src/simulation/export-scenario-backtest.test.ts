import {describe,it,expect} from "vitest";
import {EXPORT_SIMULATION_SCENARIOS,evaluateScenario,SIMULATION_STAGE_ORDER} from "./export-scenario-catalog";
import {evaluateCrosscheck} from "../export-crosscheck";
import {validateP1Create,validateP1Transition,canApprovePurchaseOrder,canDecideQaRelease,canCloseAuditFinding} from "../p1-workflow-engine";
import {hasPageAccess} from "../../frontend/src/role-permissions";
const NOW=Date.parse("2026-11-25T12:00:00Z");
describe("PKE simulated export backtest catalog",()=>{
 it("contains at least 20 deterministic, uniquely keyed realistic scenarios",()=>{
  expect(EXPORT_SIMULATION_SCENARIOS.length).toBeGreaterThanOrEqual(20);
  expect(new Set(EXPORT_SIMULATION_SCENARIOS.map(s=>s.id)).size).toBe(EXPORT_SIMULATION_SCENARIOS.length);
  expect(new Set(EXPORT_SIMULATION_SCENARIOS.map(s=>s.category)).size).toBeGreaterThanOrEqual(10);
  for(const s of EXPORT_SIMULATION_SCENARIOS){expect(s.description.length).toBeGreaterThan(20);expect(s.userFacingMessage.trim()).not.toBe("");expect(s.nextAction.trim()).not.toBe("");}
 });
 it("catalog outcomes agree with expected outcomes and no non-ready case is reported ready",()=>{
  for(const s of EXPORT_SIMULATION_SCENARIOS){const actual=evaluateScenario(s);expect(actual,s.id+" "+s.title).toBe(s.expectedOutcome);if(s.expectedOutcome!=="ready")expect(actual).not.toBe("ready");}
 });
 it("covers every export milestone and exception class",()=>{
  for(const stage of SIMULATION_STAGE_ORDER)expect(EXPORT_SIMULATION_SCENARIOS.some(s=>stage in s.stages),stage).toBe(true);
  for(const state of ["blocked","missing","stale","mismatch","pending","hold","not-run"])expect(EXPORT_SIMULATION_SCENARIOS.some(s=>Object.values(s.stages).includes(state as any)),state).toBe(true);
 });
 it("baseline only passes when every milestone is ready",()=>{
  const happy=EXPORT_SIMULATION_SCENARIOS.find(s=>s.id==="SIM-001")!;
  expect(evaluateScenario(happy)).toBe("ready");
  expect(evaluateScenario({...happy,stages:{...happy.stages,documents:"missing"}})).toBe("blocked");
  expect(evaluateScenario({...happy,stages:{...happy.stages,loading:"mismatch"}})).toBe("review");
 });
 it("uses clear, actionable Indonesian messages rather than raw technical error language",()=>{
  for(const s of EXPORT_SIMULATION_SCENARIOS){expect(s.userFacingMessage).not.toMatch(/stack trace|undefined|null pointer|SQLSTATE/i);expect(s.nextAction).toMatch(/\S/);}
 });
});
describe("simulated quantity/text/date evidence matrix",()=>{
 const e=(id:string,value:any,unit?:string,verification:"verified"|"unverified"|"pending"="verified",observedAt="2026-11-25T11:00:00Z")=>({sourceId:id,sourceLabel:id,tier:1 as const,value,unit,verification,observedAt});
 const rule={field:"quantity",label:"Quantity",type:"quantity" as const,tolerance:0.05,canonicalUnit:"MT" as const,maxAgeMs:3*3600000};
 it("matches equivalent MT and KG, catches beyond tolerance and zero quantity",()=>{
  expect(evaluateCrosscheck(rule,[e("tally",100,"MT"),e("survey",100050,"KG")],NOW).status).toBe("MATCH");
  expect(evaluateCrosscheck(rule,[e("tally",100,"MT"),e("survey",100.2,"MT")],NOW).status).toBe("MISMATCH");
  expect(evaluateCrosscheck(rule,[e("tally",0,"MT"),e("survey",0,"KG")],NOW).status).toBe("MATCH");
 });
 it("handles blank, whitespace, invalid numeric, negative quantity, unknown unit and non-finite values safely",()=>{
  for(const invalid of ["", "   ", "abc", -1, Number.NaN, Number.POSITIVE_INFINITY])expect(evaluateCrosscheck(rule,[e("a",invalid,"MT"),e("b",10,"MT")],NOW).status).not.toBe("MATCH");
  expect(evaluateCrosscheck(rule,[e("a",10,"bag"),e("b",10,"bag")],NOW).status).toBe("UNVERIFIED");
 });
 it("rejects invalid or future evidence timestamps as stale",()=>{
  expect(evaluateCrosscheck(rule,[e("a",10,"MT","verified","invalid"),e("b",10,"MT")],NOW).status).toBe("STALE");
  expect(evaluateCrosscheck(rule,[e("a",10,"MT","verified","2026-11-25T13:00:00Z"),e("b",10,"MT")],NOW).status).toBe("STALE");
 });
 it("does not allow invalid dates to compare equal",()=>{
  expect(evaluateCrosscheck({field:"date",label:"Date",type:"date"},[e("a","bad"),e("b","bad")],NOW).status).toBe("UNVERIFIED");
 });
 it("normalizes text but treats blank as missing",()=>{
  expect(evaluateCrosscheck({field:"buyer",label:"Buyer",type:"text"},[e("a","  Buyer   ABC "),e("b","buyer abc")],NOW).status).toBe("MATCH");
  expect(evaluateCrosscheck({field:"buyer",label:"Buyer",type:"text"},[e("a"," "),e("b"," ")],NOW).status).toBe("MISSING");
 });
 it("presence values use explicit semantics instead of JavaScript truthiness",()=>{
  expect(evaluateCrosscheck({field:"permit",label:"Permit",type:"presence"},[e("a","false"),e("b",false)],NOW).status).toBe("MATCH");
  expect(evaluateCrosscheck({field:"permit",label:"Permit",type:"presence"},[e("a","true"),e("b",false)],NOW).status).toBe("MISMATCH");
  expect(evaluateCrosscheck({field:"permit",label:"Permit",type:"presence"},[e("a","unknown"),e("b",true)],NOW).status).toBe("UNVERIFIED");
 });
 it("compares all source pairs and catches non-transitive tolerance edge cases",()=>{
  const f=evaluateCrosscheck({field:"qty",label:"Q",type:"quantity",tolerance:0.05,canonicalUnit:"MT"},[e("a",100,"MT"),e("b",100.04,"MT"),e("c",100.08,"MT")],NOW);
  expect(f.status).toBe("MISMATCH");expect(f.comparedPairs).toBe(3);expect(f.mismatchPairs).toBe(1);
 });
});
describe("workflow gate backtests",()=>{
 it("rejects invalid PO data and same-maker approval",()=>{
  expect(validateP1Create("purchase_order",{currencyCode:"IDR",supplierId:"S-1",items:[{description:"PKE",quantity:0,unitCode:"MT",unitPrice:1}]}).length).toBeGreaterThan(0);
  expect(canApprovePurchaseOrder("maker","maker","procurement")).toBe(false);
  expect(canApprovePurchaseOrder("checker","maker","procurement")).toBe(true);
  expect(validateP1Transition("purchase_order","issued","draft")).toBe(false);
 });
 it("keeps QA release independent and audit closure independent",()=>{
  expect(canDecideQaRelease("qa","producer","qa_manager")).toBe(true);
  expect(canDecideQaRelease("producer","producer","qa_manager")).toBe(false);
  expect(canCloseAuditFinding("auditor","owner","responder","internal_auditor")).toBe(true);
  expect(canCloseAuditFinding("owner","owner","responder","internal_auditor")).toBe(false);
 });
});
describe("simulated role access / confusion matrix",()=>{
 const base=(roleCode:string,permission:string[]=["operations.view"])=>({selectedProjectId:"SIM-PROJECT-A",projectPermissions:permission,projectMemberships:[{isActive:true,projectId:"SIM-PROJECT-A",roleAssignments:[{roleCode,isActive:true,roleIsActive:true}]}]});
 it("allows operational personas but blocks finance/funder and cross-scope unauthenticated users from Field",()=>{
  for(const r of ["driver","checker","dispatcher","warehouse_manager","master_of_loading","qc_officer","field_manager"])expect(hasPageAccess("field",base(r))).toBe(true);
  for(const r of ["finance","funder","buyer","internal_auditor"])expect(hasPageAccess("field",base(r))).toBe(false);
  expect(hasPageAccess("field",base("driver",[]))).toBe(false);
  expect(hasPageAccess("field",{selectedProjectId:"SIM-PROJECT-A",projectPermissions:["operations.view"],projectMemberships:[]})).toBe(false);
 });
 it("fails closed for inactive or expired role assignments",()=>{
  const inactive={selectedProjectId:"SIM-PROJECT-A",projectPermissions:["operations.view"],projectMemberships:[{isActive:true,projectId:"SIM-PROJECT-A",roleAssignments:[{roleCode:"driver",isActive:false,roleIsActive:true}]}]};
  const expired={selectedProjectId:"SIM-PROJECT-A",projectPermissions:["operations.view"],projectMemberships:[{isActive:true,projectId:"SIM-PROJECT-A",roleAssignments:[{roleCode:"driver",isActive:true,roleIsActive:true,expiresAt:"2020-01-01T00:00:00Z"}]}]};
  expect(hasPageAccess("field",inactive)).toBe(false);expect(hasPageAccess("field",expired)).toBe(false);
 });
});

import {describe,it,expect} from "vitest";
import {EXPORT_SIMULATION_SCENARIOS,evaluateScenario,SIMULATION_STAGE_ORDER} from "./export-scenario-catalog";
import {PKE_AI_EVAL_FIXTURES} from "./pke-ai-eval-fixtures";
import {evaluateCrosscheck} from "../export-crosscheck";
import {P1_RECORD_TYPES,initialP1Status,validateP1Create,validateP1Transition,canApprovePurchaseOrder,canDecideQaRelease,canCloseAuditFinding} from "../p1-workflow-engine";
import {hasPageAccess} from "../../frontend/src/role-permissions";
import {readFileSync} from "node:fs";
import {join} from "node:path";
const ROLE_DASHBOARD_SOURCE=readFileSync(join(process.cwd(),"frontend","src","RoleDashboardPage.tsx"),"utf8");
const APP_ROUTE_SOURCE=readFileSync(join(process.cwd(),"frontend","src","App.tsx"),"utf8");
const ADMIN_CONTROL_SOURCE=readFileSync(join(process.cwd(),"frontend","src","AdminControlCenter.tsx"),"utf8");
const DASHBOARD_LINK_PATHS=[...ROLE_DASHBOARD_SOURCE.matchAll(/to:\s*'([^']+)'/g)].map(m=>m[1]);
const APP_ROUTE_PATHS=new Set([...APP_ROUTE_SOURCE.matchAll(/<Route\s+path="([^"]+)"/g)].map(m=>m[1]));
const ROLE_META_KEYS=new Set([...EXPORT_SIMULATION_SCENARIOS.map(s=>s.persona)].filter(role=>ROLE_DASHBOARD_SOURCE.includes(role+": {")));
const NOW=Date.parse("2026-11-25T12:00:00Z");
describe("PKE simulated export backtest catalog",()=>{
 it("contains at least 20 deterministic, uniquely keyed realistic scenarios",()=>{
  expect(EXPORT_SIMULATION_SCENARIOS.length).toBe(165);
  expect(EXPORT_SIMULATION_SCENARIOS.filter(s=>s.category==='synthetic-matrix').length).toBe(84);
  expect(EXPORT_SIMULATION_SCENARIOS.filter(s=>s.sourceRefs?.length).length).toBe(30);
  expect(new Set(EXPORT_SIMULATION_SCENARIOS.map(s=>s.id)).size).toBe(EXPORT_SIMULATION_SCENARIOS.length);
  expect(new Set(EXPORT_SIMULATION_SCENARIOS.map(s=>s.category)).size).toBeGreaterThanOrEqual(10);
  for(const s of EXPORT_SIMULATION_SCENARIOS){expect(s.simulationOnly).toBe(true);expect(s.description.length).toBeGreaterThan(20);expect(s.userFacingMessage.trim()).not.toBe("");expect(s.nextAction.trim()).not.toBe("");}
 });
 it("derives a 30-case AI evaluation fixture set with grounding and abstention requirements",()=>{
  expect(PKE_AI_EVAL_FIXTURES).toHaveLength(30);
  expect(new Set(PKE_AI_EVAL_FIXTURES.map(x=>x.caseId)).size).toBe(30);
  for(const x of PKE_AI_EVAL_FIXTURES){
   expect(x.simulationOnly).toBe(true);
   expect(x.sourceRefs.length).toBeGreaterThan(0);
   expect(x.expectedBehaviors.length).toBeGreaterThan(0);
   expect(x.mustNotClaim.length).toBeGreaterThan(0);
   expect(x.mustAbstainOnAuthorityDecision).toBe(true);
  }
 });
 it("contains 30 researched PKE scenarios with provenance and AI-oriented tags",()=>{
  const researched=EXPORT_SIMULATION_SCENARIOS.filter(s=>s.id>="SIM-136"&&s.id<="SIM-165");
  expect(researched).toHaveLength(30);
  for(const s of researched){
   expect(s.simulationOnly).toBe(true);
   expect(s.sourceRefs?.length).toBeGreaterThan(0);
   expect(s.aiUseTags?.length).toBeGreaterThan(0);
   expect(s.dataConfidence).toBeTruthy();
   expect(s.expectedOutcome).not.toBe("ready");
  }
  expect(researched.some(s=>s.aiUseTags?.includes("customs-amendment"))).toBe(true);
  expect(researched.some(s=>s.aiUseTags?.includes("source-conflict"))).toBe(true);
 });
 it("contains a deterministic stage × fault matrix for all 12 stages and 7 exception states",()=>{
  const matrix=EXPORT_SIMULATION_SCENARIOS.filter(s=>s.category==="synthetic-matrix");
  expect(matrix).toHaveLength(84);
  for(const stage of SIMULATION_STAGE_ORDER) for(const fault of ["blocked","missing","stale","mismatch","pending","unverified","hold"]) {
   expect(matrix.some(s=>s.stages[stage]===fault),stage+" / "+fault).toBe(true);
  }
  for(const s of matrix){expect(s.simulationOnly).toBe(true);expect(s.expectedOutcome).not.toBe("ready");}
 });
 it("Admin Control Center surfaces unique exception records with reason and work-queue action",()=>{
  expect(ADMIN_CONTROL_SOURCE).toContain("uniqueExceptions");
  expect(ADMIN_CONTROL_SOURCE).toContain("Actionable task exceptions");
  expect(ADMIN_CONTROL_SOURCE).toContain("Review task");
  expect(ADMIN_CONTROL_SOURCE).toContain("Overdue");
  expect(ADMIN_CONTROL_SOURCE).toContain("Blocked");
  expect(ADMIN_CONTROL_SOURCE).toContain("Unassigned");
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
  expect(evaluateScenario({...happy,stages:{}})).toBe("blocked");
  expect(evaluateScenario({...happy,stages:{contract:"ready"}})).toBe("blocked");
 });
 it("maps every dashboard shortcut to a declared application route",()=>{
  for(const path of DASHBOARD_LINK_PATHS)expect(APP_ROUTE_PATHS.has(path),path).toBe(true);
 });
 it("maps every simulated persona to an actual role dashboard definition",()=>{
  for(const s of EXPORT_SIMULATION_SCENARIOS)expect(ROLE_META_KEYS.has(s.persona),s.id+" persona "+s.persona).toBe(true);
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

describe("complete P1 workflow type synthetic validation backtest",()=>{
 const validPayloads:Record<string,Record<string,unknown>>={
  purchase_requisition:{currencyCode:"IDR",items:[{description:"PKE",quantity:100,unitCode:"MT",unitPrice:0}]},
  purchase_order:{currencyCode:"IDR",supplierId:"SIM-SUP-01",items:[{description:"PKE",quantity:100,unitCode:"MT",unitPrice:1000}]},
  supplier_commitment:{purchaseOrderRecordId:"SIM-PO-01",committedQuantity:100,unitCode:"MT",committedAt:"2026-11-25T10:00:00Z"},
  goods_receipt_match:{purchaseOrderRecordId:"SIM-PO-01",warehouseReceiptId:"SIM-GR-01",apInvoiceId:"SIM-INV-01",matchedQuantity:100,matchedAmount:100000,unitCode:"MT",currencyCode:"IDR"},
  production_batch:{quantity:100,unitCode:"MT",startedAt:"2026-11-25T10:00:00Z"},
  packing_batch:{quantity:100,unitCode:"MT",startedAt:"2026-11-25T10:00:00Z"},
  quality_sample:{sampleId:"SIM-SAMPLE-01",sampleType:"PKE"},
  quality_result:{sampleId:"SIM-SAMPLE-01",attributeId:"MOISTURE",methodCode:"SIM-METHOD",resultNumeric:8.5},
  qa_release:{sourceRecordId:"SIM-LOT-01",decisionReason:"Synthetic test decision",decision:"release"},
  hse_inspection:{category:"site",severity:"low",observedAt:"2026-11-25T10:00:00Z"},
  hse_action:{findingRecordId:"SIM-HSE-01",actionOwnerRoleCode:"hse_officer",dueAt:"2026-11-26T10:00:00Z"},
  dispatch_assignment:{tripId:"SIM-TRIP-01",driverUserId:"SIM-DRIVER-01",vehicleId:"SIM-TRUCK-01",plannedDepartureAt:"2026-11-25T10:00:00Z",plannedArrivalAt:"2026-11-25T12:00:00Z"},
  vessel_call:{voyageId:"SIM-VOYAGE-01",vesselId:"SIM-VESSEL-01",portId:"SIM-PORT-01",predictedArrivalAt:"2026-11-26T10:00:00Z"},
  loading_plan:{loadingOperationId:"SIM-LOAD-01",shipmentId:"SIM-SHIP-01",plannedQuantity:100,unitCode:"MT"},
  loading_survey:{loadingOperationId:"SIM-LOAD-01",certificateObjectKey:"sim/certificate.pdf",sha256Checksum:"a".repeat(64),surveyedQuantity:100,certificateFileSizeBytes:1000},
  ship_master_ack:{voyageId:"SIM-VOYAGE-01",acknowledgementType:"cargo_received",acknowledgedAt:"2026-11-25T10:00:00Z"},
  laytime_event:{voyageId:"SIM-VOYAGE-01",eventCode:"NOR",eventAt:"2026-11-25T10:00:00Z",startAt:"2026-11-25T10:00:00Z",endAt:"2026-11-25T11:00:00Z",allowedHours:24,excludedHours:0},
  lc_record:{lcNumber:"SIM-LC-01",issuingBank:"Synthetic Bank",currencyCode:"USD",amount:100000,expiryAt:"2026-12-31T00:00:00Z",latestShipmentAt:"2026-12-15T00:00:00Z"},
  lc_clause:{lcRecordId:"SIM-LC-01",clauseCode:"DOC-01",requirementText:"Synthetic required document",documentTypeCode:"INVOICE",requiredOriginals:1,requiredCopies:2},
  lc_discrepancy:{lcRecordId:"SIM-LC-01",clauseRecordId:"SIM-CLAUSE-01",description:"Synthetic discrepancy",resolutionDueAt:"2026-11-26T00:00:00Z"},
  lc_presentation:{lcRecordId:"SIM-LC-01",documentSelections:[{documentRecordId:"SIM-DOC-01",clauseCode:"DOC-01",copyType:"original"}],presentationReference:"SIM-PRESENT-01"},
  audit_finding:{findingCode:"SIM-AUD-01",criteria:"Synthetic criterion",condition:"Synthetic condition",cause:"Synthetic cause",effect:"Synthetic effect",recommendation:"Synthetic recommendation",ownerRoleCode:"pm",dueAt:"2026-11-26T00:00:00Z",severity:"moderate"},
  audit_response:{findingRecordId:"SIM-AUD-01",response:"Synthetic response",correctiveAction:"Synthetic action",dueAt:"2026-11-26T00:00:00Z"},
  audit_closure:{findingRecordId:"SIM-AUD-01",verificationResult:"Verified",closureReason:"Synthetic closure"},
 };
 const nextInitial:Record<string,string>={
  purchase_requisition:"submitted",purchase_order:"submitted",supplier_commitment:"submitted",goods_receipt_match:"matched",production_batch:"in_progress",packing_batch:"in_progress",quality_sample:"submitted",quality_result:"submitted",qa_release:"submitted",hse_inspection:"submitted",hse_action:"in_progress",dispatch_assignment:"approved",vessel_call:"submitted",loading_plan:"submitted",loading_survey:"submitted",ship_master_ack:"submitted",laytime_event:"submitted",lc_record:"issued",lc_clause:"submitted",lc_discrepancy:"responded",lc_presentation:"presented",audit_finding:"responded",audit_response:"submitted",audit_closure:"submitted"
 };
 it("provides valid synthetic payloads for every P1 record type",()=>{
  expect(Object.keys(validPayloads).sort()).toEqual([...P1_RECORD_TYPES].sort());
  for(const type of P1_RECORD_TYPES)expect(validateP1Create(type,validPayloads[type]),type).toEqual([]);
 });
 it("fails incomplete payloads closed for every P1 record type",()=>{
  for(const type of P1_RECORD_TYPES)expect(validateP1Create(type,{}).length,type).toBeGreaterThan(0);
 });
 it("tests each record type's initial transition and rejects invalid closure shortcut",()=>{
  for(const type of P1_RECORD_TYPES){const from=initialP1Status(type);expect(validateP1Transition(type,from,nextInitial[type]),type+" initial transition").toBe(true);expect(validateP1Transition(type,from,"closed"),type+" invalid shortcut").toBe(false);}
 });
});

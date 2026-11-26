import type { DependencyStatus, ProcessDependency } from "./process-dependency-map.js";
export type EvidenceVerification = "verified" | "unverified" | "rejected";
export type EvidenceRecordState = "active" | "cancelled" | "reversed" | "superseded";
export type QuantityUnit = "kg" | "tonne" | "mt" | "g";
export type EvidenceKind = "contract"|"commitment"|"production"|"qc-release"|"allocation"|"dispatch"|"loading-tally"|"survey"|"invoice"|"manifest"|"shipment"|"payment"|"checkpoint"|"port-readiness"|"document"|"custom";
export type TypedEvidenceObservation = {recordId:string;evidenceKey:string;kind:EvidenceKind;sourceId:string;sourceAuthority:number;verification:EvidenceVerification;recordState?:EvidenceRecordState;value?:string|number|boolean|null;quantity?:number;unit?:QuantityUnit;quantityGroup?:string;allocationRef?:string;lotId?:string;batchId?:string;shipmentId?:string;eventAt?:string;receivedAt?:string;expiresAt?:string;supersedesRecordId?:string;correctionOfRecordId?:string;reversedRecordId?:string;permissionScope?:string};
export type EvidenceFindingCode="duplicate-record-id"|"conflicting-values"|"quantity-mismatch"|"unit-invalid"|"duplicate-allocation"|"over-allocation"|"partial-shipment"|"stale-evidence"|"event-order-reversal"|"cancelled-record"|"reversed-record"|"invalid-correction"|"unverified-source"|"rejected-evidence"|"missing-permission-scope"|"unknown-evidence";
export type EvidenceFindingSeverity="error"|"warning"|"info";
export type EvidenceFinding={code:EvidenceFindingCode;severity:EvidenceFindingSeverity;recordIds:string[];message:string;group?:string};
export type TypedEvidenceAssessment={status:"conflict"|"gap"|"blocked"|"stale"|"unknown"|"satisfied";normalizedQuantityGroups:Record<string,number>;findings:EvidenceFinding[];activeRecordIds:string[];ignoredRecordIds:string[];sourceCount:number;verifiedRecordCount:number};
export type TypedEvidencePolicy={now?:string;staleAfterMs?:number;requiredQuantityGroups?:string[];expectedQuantities?:Record<string,{quantity:number;unit:QuantityUnit}>;expectedShipmentQuantity?:{quantity:number;unit:QuantityUnit;group:string};requiredPermissionScope?:string;upstreamState?:DependencyStatus};
const unitFactor:Record<QuantityUnit,number>={g:0.000001,kg:0.001,tonne:1,mt:1};
function normalizeQuantity(quantity:number,unit:QuantityUnit){return quantity*unitFactor[unit];}
function iso(value?:string):number|null{if(!value)return null;const n=Date.parse(value);return Number.isFinite(n)?n:null;}
function push(f:EvidenceFinding[],code:EvidenceFindingCode,severity:EvidenceFindingSeverity,recordIds:string[],message:string,group?:string){f.push({code,severity,recordIds,message,...(group?{group}:{})});}
function groupBy<T>(items:T[],key:(item:T)=>string|undefined){const m=new Map<string,T[]>();for(const item of items){const k=key(item);if(!k)continue;m.set(k,[...(m.get(k)||[]),item]);}return m;}
function filterActive(records:TypedEvidenceObservation[]){const superseded=new Set(records.map(r=>r.supersedesRecordId).filter(Boolean) as string[]);const active=records.filter(r=>(r.recordState||"active")==="active"&&!superseded.has(r.recordId));return {active,ignored:records.filter(r=>!active.includes(r)};}
export function assessTypedEvidence(records:TypedEvidenceObservation[],policy:TypedEvidencePolicy={}):TypedEvidenceAssessment{
 const findings:EvidenceFinding[]=[];const {active,ignored}=filterActive(records);
 for(const [id,group] of groupBy(records,r=>r.recordId))if(group.length>1)push(findings,"duplicate-record-id","error",group.map(r=>r.recordId),"Record ID is not unique.");
 for(const [key,group] of groupBy(active,r=>r.evidenceKey)){if(new Set(group.map(r=>JSON.stringify(r.value))).size>1)push(findings,"conflicting-values","error",group.map(r=>r.recordId),`Conflicting values for evidence key '${key}'.`,key);}
 for(const r of records){
  if(r.recordState==="cancelled")push(findings,"cancelled-record","warning",[r.recordId],"Cancelled record is excluded from active evidence.");
  if(r.recordState==="reversed")push(findings,"reversed-record","warning",[r.recordId],"Reversed record is excluded from active evidence.");
  if(r.verification==="rejected")push(findings,"rejected-evidence","error",[r.recordId],"Evidence was rejected.");
  if(r.verification==="unverified")push(findings,"unverified-source","warning",[r.recordId],"Evidence is unverified.");
  if(policy.requiredPermissionScope&&r.permissionScope!==policy.requiredPermissionScope)push(findings,"missing-permission-scope","error",[r.recordId],"Evidence is outside the required permission scope.");
  if(r.correctionOfRecordId&&!records.some(x=>x.recordId===r.correctionOfRecordId))push(findings,"invalid-correction","error",[r.recordId],"Correction reference is missing.");
  if(r.reversedRecordId&&!records.some(x=>x.recordId===r.reversedRecordId))push(findings,"invalid-correction","error",[r.recordId],"Reversal reference is missing.");
  if(r.quantity!==undefined&&(r.quantity<0||!Number.isFinite(r.quantity)||!r.unit))push(findings,"unit-invalid","error",[r.recordId],"Quantity is invalid or unit missing.");
  if(r.quantity!==undefined&&r.unit&&Number.isFinite(r.quantity)&&r.quantity>=0&&r.quantityGroup){
   if(policy.expectedQuantities?.[r.quantityGroup]){const e=policy.expectedQuantities[r.quantityGroup],a=normalizeQuantity(r.quantity,r.unit),target=normalizeQuantity(e.quantity,e.unit);if(Math.abs(a-target)>1e-9)push(findings,"quantity-mismatch","error",[r.recordId],`Quantity mismatch for '${r.quantityGroup}': expected ${target} MT, got ${a} MT.`,r.quantityGroup);}
   const now=policy.now?Date.parse(policy.now):Date.now(),event=iso(r.eventAt);if(policy.staleAfterMs!==undefined&&event!==null&&now-event>policy.staleAfterMs)push(findings,"stale-evidence","warning",[r.recordId],"Evidence exceeds freshness window.",r.quantityGroup);
  }
 }
 for(const [ref,group] of groupBy(active.filter(r=>r.kind==="allocation"),r=>r.allocationRef))if(group.length>1)push(findings,"duplicate-allocation","error",group.map(r=>r.recordId),`Allocation '${ref}' is duplicated.`,ref);
 const qtyGroups=groupBy(active.filter(r=>r.quantity!==undefined&&r.unit&&r.quantityGroup),r=>r.quantityGroup);const normalized:Record<string,number>={};
 for(const [g,items] of qtyGroups)normalized[g]=items.reduce((sum,r)=>sum+normalizeQuantity(r.quantity!,r.unit!),0);
 for(const [g,e] of Object.entries(policy.expectedQuantities||{})){if(normalized[g]===undefined)continue;const target=normalizeQuantity(e.quantity,e.unit),actual=normalized[g];if(Math.abs(actual-target)>1e-9)push(findings,"quantity-mismatch","error",qtyGroups.get(g)?.map(r=>r.recordId)||[],`Total '${g}' differs from expected quantity: expected ${target} MT, got ${actual} MT.`,g);if(actual>target+1e-9)push(findings,"over-allocation","error",qtyGroups.get(g)?.map(r=>r.recordId)||[],`Total '${g}' exceeds expected quantity.`,g);}
 if(policy.expectedShipmentQuantity){const e=policy.expectedShipmentQuantity,target=normalizeQuantity(e.quantity,e.unit),actual=normalized[e.group];if(actual!==undefined&&actual+1e-9<target)push(findings,"partial-shipment","warning",qtyGroups.get(e.group)?.map(r=>r.recordId)||[],`Shipment '${e.group}' is below expected quantity.`,e.group);}
 const events=active.filter(r=>r.eventAt&&iso(r.eventAt)).sort((a,b)=>Date.parse(a.eventAt!)-Date.parse(b.eventAt!));for(let i=1;i<events.length;i++)if(events[i].receivedAt&&events[i-1].receivedAt&&Date.parse(events[i].receivedAt!)<Date.parse(events[i-1].receivedAt!))push(findings,"event-order-reversal","warning",[events[i-1].recordId,events[i].recordId],"Events were received in reverse event-time order.");
 const missing=(policy.requiredQuantityGroups||[]).filter(g=>normalized[g]===undefined);for(const g of missing)push(findings,"unknown-evidence","warning",[], `Required quantity group '${g}' is absent.`,g);
 if(policy.upstreamState==="gap"||policy.upstreamState==="blocked")push(findings,"unknown-evidence","error",[],"Upstream dependency blocks assessment.");
 const errors=findings.some(f=>f.severity==="error"),stale=findings.some(f=>f.code==="stale-evidence"),warnings=findings.some(f=>f.severity==="warning");
 const status:TypedEvidenceAssessment["status"]=policy.upstreamState==="gap"||policy.upstreamState==="blocked"?"blocked":errors?"conflict":stale?"stale":missing.length?"gap":warnings?"unknown":records.length?"satisfied":"gap";
 return {status,normalizedQuantityGroups:normalized,findings,activeRecordIds:active.map(r=>r.recordId),ignoredRecordIds:ignored.map(r=>r.recordId),sourceCount:new Set(active.map(r=>r.sourceId)).size,verifiedRecordCount:active.filter(r=>r.verification==="verified").length};
}
export type DependencyEvidenceChainItem={dependencyId:string;providedEvidence:string[];upstreamState?:DependencyStatus};
export function propagateDependencyChain(dependencies:ProcessDependency[],items:DependencyEvidenceChainItem[]):{dependencyId:string;status:DependencyStatus}[]{const m=new Map(items.map(i=>[i.dependencyId,i]));let upstream:DependencyStatus|undefined;return dependencies.map(d=>{const i=m.get(d.id);const state=i?.upstreamState??upstream;const status=state==="gap"||state==="blocked"?"blocked":state==="stale"?"stale":state==="unknown"?"unknown":d.requiredEvidence.every(e=>i?.providedEvidence.includes(e))?"satisfied":"gap";upstream=status;return {dependencyId:d.id,status};});}

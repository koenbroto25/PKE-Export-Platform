import {evaluateCrosscheck} from "../export-crosscheck";
import {evaluateScenario,type SimScenario,type SimStage,type SimState} from "./export-scenario-catalog";
export type SyntheticDocument={code:string;required:boolean;status:"verified"|"missing"|"expired"|"unverified";expiresAt?:string};
export type SyntheticShipment={
 simulationOnly:true;scenarioId:string;shipmentId:string;projectId:string;buyer:string;supplier:string;pksSite:string;product:"PKE";
 contractMt:number;shipmentQuantityMt:number;committedMt:number;producedMt:number;qualityStatus:"released"|"hold"|"rejected"|"pending";
 stockAvailableMt:number;allocatedMt:number;lotGenealogyVerified:boolean;
 transportStatus:"completed"|"delayed"|"pending"|"capacity-exceeded"|"gps-unverified";
 portCapabilityVerified:boolean;tallyMt:number;surveyMt:number;quantityToleranceMt:number;
 vesselAisObservedAt:string|null;vesselEta:string|null;
 documents:SyntheticDocument[];customsStatus:"npe-verified"|"pending"|"rejected";
 settlementStatus:"settled"|"pending"|"blocked";currency:string;fxVariancePercent:number;
};
const base:Omit<SyntheticShipment,"scenarioId"|"shipmentId">={
 simulationOnly:true,projectId:"SIM-PROJECT-001",buyer:"PT Buyer Contoh (SIM)",supplier:"Supplier Demo A (SIM)",pksSite:"KCP Demo Kumai (SIM)",product:"PKE",
 contractMt:2500,shipmentQuantityMt:2500,committedMt:2500,producedMt:2600,qualityStatus:"released",stockAvailableMt:2500,allocatedMt:2500,lotGenealogyVerified:true,
 transportStatus:"completed",portCapabilityVerified:true,tallyMt:2498,surveyMt:2498,quantityToleranceMt:5,
 vesselAisObservedAt:"2026-11-25T11:30:00Z",vesselEta:"2026-11-26T04:00:00Z",
 documents:[{code:"COA",required:true,status:"verified"},{code:"INVOICE",required:true,status:"verified"},{code:"PACKING_LIST",required:true,status:"verified"},{code:"PEB",required:true,status:"verified"},{code:"NPE",required:true,status:"verified"}],
 customsStatus:"npe-verified",settlementStatus:"settled",currency:"IDR",fxVariancePercent:0,
};
const make=(scenarioId:string,shipmentId:string,patch:Partial<SyntheticShipment>):SyntheticShipment=>({...base,scenarioId,shipmentId,...patch} as SyntheticShipment);
export const SYNTHETIC_EXPORT_TRANSACTIONS:SyntheticShipment[]=[
 make("SIM-001","SIM-SHIP-001",{}),
 make("SIM-002","SIM-SHIP-002",{shipmentQuantityMt:1800,committedMt:1800,producedMt:1800,stockAvailableMt:1800,allocatedMt:1800,tallyMt:1798,surveyMt:1798}),
 make("SIM-004","SIM-SHIP-004",{qualityStatus:"hold",stockAvailableMt:0,allocatedMt:0}),
 make("SIM-005","SIM-SHIP-005",{stockAvailableMt:1900,allocatedMt:2500}),
 make("SIM-006","SIM-SHIP-006",{transportStatus:"delayed"}),
 make("SIM-009","SIM-SHIP-009",{tallyMt:2500,surveyMt:2440}),
 make("SIM-012","SIM-SHIP-012",{documents:[{code:"COA",required:true,status:"missing"},{code:"INVOICE",required:true,status:"verified"},{code:"PACKING_LIST",required:true,status:"verified"}],customsStatus:"pending"}),
 make("SIM-013","SIM-SHIP-013",{customsStatus:"pending"}),
 make("SIM-014","SIM-SHIP-014",{settlementStatus:"pending",currency:"USD",fxVariancePercent:8}),
 make("SIM-011","SIM-SHIP-011",{vesselAisObservedAt:"2026-11-24T00:00:00Z"}),
 make("SIM-027","SIM-SHIP-027",{transportStatus:"capacity-exceeded"}),
 make("SIM-028","SIM-SHIP-028",{portCapabilityVerified:false}),
 make("SIM-037","SIM-SHIP-037",{lotGenealogyVerified:false}),
 make("SIM-030","SIM-SHIP-030",{documents:[{code:"LC-PRESENTATION",required:true,status:"unverified"}],settlementStatus:"blocked"}),
 make("SIM-044","SIM-SHIP-044",{tallyMt:2500,surveyMt:2400,stockAvailableMt:2400,allocatedMt:2500}),
 make("SIM-045","SIM-SHIP-045",{vesselAisObservedAt:null,customsStatus:"pending",documents:[{code:"COA",required:true,status:"unverified"},{code:"INVOICE",required:true,status:"verified"},{code:"PACKING_LIST",required:true,status:"verified"},{code:"PEB",required:true,status:"verified"},{code:"NPE",required:true,status:"verified"}]}),
 make("SIM-052","SIM-SHIP-052",{vesselAisObservedAt:"not-a-date"}),
 make("SIM-053","SIM-SHIP-053",{documents:[{code:"COA",required:true,status:"verified"},{code:"INVOICE",required:true,status:"verified"},{code:"PACKING_LIST",required:true,status:"verified"},{code:"PEB",required:true,status:"verified"}]}),
 make("SIM-054","SIM-SHIP-054",{contractMt:-1,committedMt:-1,producedMt:-1,stockAvailableMt:-1,allocatedMt:-1,tallyMt:-1,surveyMt:-1}),
 make("SIM-055","SIM-SHIP-055",{currency:"BAD!",fxVariancePercent:-5}),
 make("SIM-056","SIM-SHIP-056",{documents:[{code:"COA",required:true,status:"verified"},{code:"COA",required:true,status:"verified"},{code:"INVOICE",required:true,status:"verified"},{code:"PACKING_LIST",required:true,status:"verified"},{code:"PEB",required:true,status:"verified"},{code:"NPE",required:true,status:"verified"}]}),
 make("SIM-057","SIM-SHIP-057",{vesselAisObservedAt:"2026-11-25T14:00:00Z"}),
 make("SIM-058","SIM-SHIP-058",{shipmentQuantityMt:1200,committedMt:2500,producedMt:2500,stockAvailableMt:1200,allocatedMt:1200,tallyMt:1200,surveyMt:1200}),
 make("SIM-059","SIM-SHIP-059",{documents:[{code:"COA",required:true,status:"expired",expiresAt:"2026-11-24T00:00:00Z"},{code:"INVOICE",required:true,status:"verified"},{code:"PACKING_LIST",required:true,status:"verified"},{code:"PEB",required:true,status:"verified"},{code:"NPE",required:true,status:"verified"}]}),
 make("SIM-060","SIM-SHIP-060",{transportStatus:"gps-unverified"}),
 make("SIM-061","SIM-SHIP-061",{transportStatus:"pending"}),
 make("SIM-062","SIM-SHIP-062",{settlementStatus:"pending",currency:"USD",fxVariancePercent:1.2}),
 make("SIM-063","SIM-SHIP-063",{qualityStatus:"rejected"}),
 make("SIM-064","SIM-SHIP-064",{customsStatus:"rejected"}),
 make("SIM-065","SIM-SHIP-065",{vesselEta:"bad-eta"}),
 make("SIM-066","SIM-SHIP-066",{projectId:"REAL-PROJECT-066"}),
 make("SIM-067","SIM-SHIP-067",{documents:[]}),
 make("SIM-068","SIM-SHIP-068",{tallyMt:2500,surveyMt:2500,quantityToleranceMt:0}),
 make("SIM-069","SIM-SHIP-069",{stockAvailableMt:2500,allocatedMt:2500,lotGenealogyVerified:false}),
 make("SIM-070","SIM-SHIP-070",{documents:[{code:"COA",required:true,status:"verified",expiresAt:"2026-11-24T00:00:00Z"},{code:"INVOICE",required:true,status:"verified"},{code:"PACKING_LIST",required:true,status:"verified"},{code:"PEB",required:true,status:"verified"},{code:"NPE",required:true,status:"verified"}]}),
 make("SIM-071","SIM-SHIP-071",{documents:[{code:"COA",required:true,status:"verified",expiresAt:"invalid"},{code:"INVOICE",required:true,status:"verified"},{code:"PACKING_LIST",required:true,status:"verified"},{code:"PEB",required:true,status:"verified"},{code:"NPE",required:true,status:"verified"}]}),
];
const freshness=3*60*60*1000;
const REQUIRED_DOCUMENTS=["COA","INVOICE","PACKING_LIST","PEB","NPE"];
function validNonNegative(...values:number[]):boolean{return values.every(v=>typeof v==="number"&&Number.isFinite(v)&&v>=0);}
function validTimestamp(v:string|null):boolean{return v===null||Number.isFinite(Date.parse(v));}
function documentExpiryState(docs:SyntheticDocument[],nowMs:number):"ready"|"stale"|"unverified"|"missing"{
 const required=docs.filter(d=>d.required);
 if(required.some(d=>d.expiresAt!==undefined&&!Number.isFinite(Date.parse(d.expiresAt))))return "unverified";
 if(required.some(d=>d.expiresAt!==undefined&&Date.parse(d.expiresAt)<=nowMs))return "stale";
 if(required.some(d=>d.status==="expired"))return "stale";
 if(required.some(d=>d.status==="unverified"))return "unverified";
 if(required.some(d=>d.status==="missing"))return "missing";
 return "ready";
}
function invalidDocumentSet(docs:SyntheticDocument[]):boolean{
 const codes=docs.map(d=>d.code.trim().toUpperCase());
 return docs.some(d=>!d.code.trim()||!["verified","missing","expired","unverified"].includes(d.status))||new Set(codes).size!==codes.length||REQUIRED_DOCUMENTS.some(code=>!codes.includes(code));
}
function mapCrosscheck(status:string):SimState{
 return status==="MATCH"?"ready":status==="MISMATCH"?"mismatch":status==="MISSING"?"missing":status==="STALE"?"stale":status==="EXTERNAL_CONFIRMATION_PENDING"?"pending":"unverified";
}
export function backtestSyntheticExport(s:SyntheticShipment,nowMs=Date.parse("2026-11-25T12:00:00Z")):SimScenario{
 const quantityValid=validNonNegative(s.contractMt,s.shipmentQuantityMt,s.committedMt,s.producedMt,s.stockAvailableMt,s.allocatedMt,s.tallyMt,s.surveyMt,s.quantityToleranceMt);
 const invalidIdentity=!s.shipmentId.startsWith("SIM-")||!s.projectId.startsWith("SIM-")||!s.simulationOnly;
 const invalidTimestamp=!validTimestamp(s.vesselAisObservedAt)||!validTimestamp(s.vesselEta);
 const invalidFx=!Number.isFinite(s.fxVariancePercent)||s.fxVariancePercent<0||!/^([A-Z]{3})$/.test(s.currency);
 const invalidDocs=invalidDocumentSet(s.documents);
 const stages:Record<SimStage,SimState>={
  contract:!quantityValid||invalidIdentity?"blocked":s.contractMt>0?"ready":"missing",
  supplier:!quantityValid?"blocked":s.committedMt>=s.contractMt?"ready":"mismatch",
  production:!quantityValid?"blocked":s.producedMt>=s.contractMt?"ready":"mismatch",
  quality:s.qualityStatus==="released"?"ready":s.qualityStatus==="hold"?"hold":s.qualityStatus==="rejected"?"blocked":"pending",
  warehouse:!quantityValid?"blocked":!s.lotGenealogyVerified?"missing":s.allocatedMt!==s.shipmentQuantityMt?"mismatch":s.stockAvailableMt<s.allocatedMt?"blocked":"ready",
  transport:s.transportStatus==="completed"?"ready":s.transportStatus==="delayed"?"stale":s.transportStatus==="capacity-exceeded"?"blocked":s.transportStatus==="gps-unverified"?"unverified":"pending",
  port:s.portCapabilityVerified?"ready":"unverified",
  loading:!quantityValid?"blocked":mapCrosscheck(evaluateCrosscheck({field:"loading_quantity",label:"Loading quantity",type:"quantity",tolerance:s.quantityToleranceMt,canonicalUnit:"MT"},[{sourceId:"shipment_plan",sourceLabel:"Approved shipment allocation",tier:1,value:s.shipmentQuantityMt,unit:"MT",verification:"verified",observedAt:new Date(nowMs).toISOString()},{sourceId:"tally",sourceLabel:"Tally",tier:1,value:s.tallyMt,unit:"MT",verification:"verified",observedAt:new Date(nowMs).toISOString()},{sourceId:"survey",sourceLabel:"Survey",tier:1,value:s.surveyMt,unit:"MT",verification:"verified",observedAt:new Date(nowMs).toISOString()}],nowMs).status),
  vessel:invalidTimestamp?"unverified":s.vesselAisObservedAt===null?"pending":!Number.isFinite(Date.parse(s.vesselAisObservedAt))||nowMs-Date.parse(s.vesselAisObservedAt)>freshness||Date.parse(s.vesselAisObservedAt)-nowMs>5*60_000?"stale":"ready",
  documents:invalidDocs?"missing":documentExpiryState(s.documents,nowMs),
  customs:s.customsStatus==="npe-verified"?"ready":s.customsStatus==="rejected"?"blocked":"pending",
  settlement:invalidFx?"blocked":s.settlementStatus==="blocked"?"blocked":Math.abs(s.fxVariancePercent)>2?"mismatch":s.settlementStatus==="pending"?"pending":"ready",
 };
 const expectedOutcome=evaluateScenario({simulationOnly:true,id:s.scenarioId,title:s.shipmentId,category:"transaction-fixture",description:"Synthetic transaction fixture.",stages,expectedOutcome:"review",persona:"simulation",userFacingMessage:"Synthetic backtest result.",nextAction:"Review fixture."});
 return {simulationOnly:true,id:s.scenarioId,title:s.shipmentId,category:"transaction-fixture",description:"Synthetic transaction fixture; no persistent data.",stages,expectedOutcome,persona:"simulation",userFacingMessage:"Backtest only; never a production transaction.",nextAction:"Inspect stage-level finding and expected gate."};
}

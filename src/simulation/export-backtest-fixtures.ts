import {evaluateCrosscheck} from "../export-crosscheck";
import {evaluateScenario,type SimScenario,type SimStage,type SimState} from "./export-scenario-catalog";
export type SyntheticDocument={code:string;required:boolean;status:"verified"|"missing"|"expired"|"unverified";expiresAt?:string};
export type SyntheticShipment={
 simulationOnly:true;scenarioId:string;shipmentId:string;projectId:string;buyer:string;supplier:string;pksSite:string;product:"PKE";
 contractMt:number;committedMt:number;producedMt:number;qualityStatus:"released"|"hold"|"rejected"|"pending";
 stockAvailableMt:number;allocatedMt:number;lotGenealogyVerified:boolean;
 transportStatus:"completed"|"delayed"|"pending"|"capacity-exceeded"|"gps-unverified";
 portCapabilityVerified:boolean;tallyMt:number;surveyMt:number;quantityToleranceMt:number;
 vesselAisObservedAt:string|null;vesselEta:string|null;
 documents:SyntheticDocument[];customsStatus:"npe-verified"|"pending"|"rejected";
 settlementStatus:"settled"|"pending"|"blocked";currency:string;fxVariancePercent:number;
};
const base:Omit<SyntheticShipment,"scenarioId"|"shipmentId">={
 simulationOnly:true,projectId:"SIM-PROJECT-001",buyer:"PT Buyer Contoh (SIM)",supplier:"Supplier Demo A (SIM)",pksSite:"KCP Demo Kumai (SIM)",product:"PKE",
 contractMt:2500,committedMt:2500,producedMt:2600,qualityStatus:"released",stockAvailableMt:2500,allocatedMt:2500,lotGenealogyVerified:true,
 transportStatus:"completed",portCapabilityVerified:true,tallyMt:2498,surveyMt:2498,quantityToleranceMt:5,
 vesselAisObservedAt:"2026-11-25T11:30:00Z",vesselEta:"2026-11-26T04:00:00Z",
 documents:[{code:"COA",required:true,status:"verified"},{code:"INVOICE",required:true,status:"verified"},{code:"PACKING_LIST",required:true,status:"verified"},{code:"PEB",required:true,status:"verified"},{code:"NPE",required:true,status:"verified"}],
 customsStatus:"npe-verified",settlementStatus:"settled",currency:"IDR",fxVariancePercent:0,
};
const make=(scenarioId:string,shipmentId:string,patch:Partial<SyntheticShipment>):SyntheticShipment=>({...base,scenarioId,shipmentId,...patch} as SyntheticShipment);
export const SYNTHETIC_EXPORT_TRANSACTIONS:SyntheticShipment[]=[
 make("SIM-001","SIM-SHIP-001",{}),
 make("SIM-002","SIM-SHIP-002",{committedMt:1800,producedMt:1800,stockAvailableMt:1800,allocatedMt:1800,tallyMt:1798,surveyMt:1798}),
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
 make("SIM-045","SIM-SHIP-045",{vesselAisObservedAt:null,customsStatus:"pending",documents:[{code:"COA",required:true,status:"unverified"}]}),
];
const freshness=3*60*60*1000;
function mapCrosscheck(status:string):SimState{
 return status==="MATCH"?"ready":status==="MISMATCH"?"mismatch":status==="MISSING"?"missing":status==="STALE"?"stale":status==="EXTERNAL_CONFIRMATION_PENDING"?"pending":"unverified";
}
export function backtestSyntheticExport(s:SyntheticShipment,nowMs=Date.parse("2026-11-25T12:00:00Z")):SimScenario{
 const stages:Record<SimStage,SimState>={
  contract:s.contractMt>0?"ready":"missing",
  supplier:s.committedMt>=s.contractMt?"ready":"mismatch",
  production:s.producedMt>=s.contractMt?"ready":"mismatch",
  quality:s.qualityStatus==="released"?"ready":s.qualityStatus==="hold"?"hold":s.qualityStatus==="rejected"?"blocked":"pending",
  warehouse:!s.lotGenealogyVerified?"missing":s.stockAvailableMt<s.allocatedMt?"blocked":"ready",
  transport:s.transportStatus==="completed"?"ready":s.transportStatus==="delayed"?"stale":s.transportStatus==="capacity-exceeded"?"blocked":s.transportStatus==="gps-unverified"?"unverified":"pending",
  port:s.portCapabilityVerified?"ready":"unverified",
  loading:mapCrosscheck(evaluateCrosscheck({field:"loading_quantity",label:"Loading quantity",type:"quantity",tolerance:s.quantityToleranceMt,canonicalUnit:"MT"},[{sourceId:"tally",sourceLabel:"Tally",tier:1,value:s.tallyMt,unit:"MT",verification:"verified",observedAt:new Date(nowMs).toISOString()},{sourceId:"survey",sourceLabel:"Survey",tier:1,value:s.surveyMt,unit:"MT",verification:"verified",observedAt:new Date(nowMs).toISOString()}],nowMs).status),
  vessel:s.vesselAisObservedAt===null?"pending":nowMs-Date.parse(s.vesselAisObservedAt)>freshness?"stale":"ready",
  documents:s.documents.some(d=>d.required&&d.status==="missing")?"missing":s.documents.some(d=>d.required&&d.status==="expired")?"stale":s.documents.some(d=>d.required&&d.status!=="verified")?"unverified":"ready",
  customs:s.customsStatus==="npe-verified"?"ready":s.customsStatus==="rejected"?"blocked":"pending",
  settlement:s.settlementStatus==="blocked"?"blocked":s.fxVariancePercent>2?"mismatch":s.settlementStatus==="pending"?"pending":"ready",
 };
 const expectedOutcome=evaluateScenario({simulationOnly:true,id:s.scenarioId,title:s.shipmentId,category:"transaction-fixture",description:"Synthetic transaction fixture.",stages,expectedOutcome:"review",persona:"simulation",userFacingMessage:"Synthetic backtest result.",nextAction:"Review fixture."});
 return {simulationOnly:true,id:s.scenarioId,title:s.shipmentId,category:"transaction-fixture",description:"Synthetic transaction fixture; no persistent data.",stages,expectedOutcome,persona:"simulation",userFacingMessage:"Backtest only; never a production transaction.",nextAction:"Inspect stage-level finding and expected gate."};
}

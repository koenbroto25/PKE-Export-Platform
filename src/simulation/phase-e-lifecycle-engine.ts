import{createPhaseEOperationalDataset,type SyntheticOperationalShipment,type SyntheticLifecycleStage}from"./phase-e-operational-fixtures";
export type SimLifecycleResult={shipmentId:string;stages:{stage:SyntheticLifecycleStage;status:"ready"|"blocked"|"gap"|"conflict"|"pending";reason:string}[];terminalStatus:"complete"|"blocked"|"conflict"|"incomplete"};
const order:SyntheticLifecycleStage[]=["contract","supply","production","quality","inventory","transport","port","loading","documents","customs","voyage","settlement"];
const downstream=new Map<SyntheticLifecycleStage,SyntheticLifecycleStage[]>(order.map((s,i)=>[s,order.slice(i+1)]));
export function simulateLifecycle(s:SyntheticOperationalShipment):SimLifecycleResult{
 let stopped=false;const stages:SimLifecycleResult["stages"]=[];
 for(const stage of order){let status=s.stageState[stage],reason=status==="ready"?"Synthetic evidence contract satisfied.":status==="blocked"?"Stage is explicitly blocked by fixture.":status==="conflict"?"Conflicting synthetic evidence detected.":status==="gap"?"Required evidence is missing.":"Stage is not yet completed.";
 if(stopped&&status==="ready"){status="blocked";reason="Upstream stage failed; downstream readiness is suppressed.";}
 if(status==="blocked"||status==="gap"||status==="conflict")stopped=true;
 stages.push({stage,status,reason});}
 const terminalStatus=stages.every(x=>x.status==="ready")?"complete":stages.some(x=>x.status==="conflict")?"conflict":stages.some(x=>x.status==="blocked")?"blocked":"incomplete";
 return{shipmentId:s.id,stages,terminalStatus};
}
export function simulateAllLifecycles(dataset=createPhaseEOperationalDataset()):SimLifecycleResult[]{return dataset.shipments.map(simulateLifecycle);}
export function cascadeStageChange(s:SyntheticOperationalShipment,stage:SyntheticLifecycleStage,next:"ready"|"blocked"|"gap"|"conflict"|"pending"):SyntheticOperationalShipment{
 const copy=structuredClone(s);copy.stageState[stage]=next;
 if(next!=="ready"){for(const target of downstream.get(stage)??[])if(copy.stageState[target]==="ready")copy.stageState[target]="pending";}
 return copy;
}
export function phaseEEndToEndSummary(results=simulateAllLifecycles()){return{shipmentCount:results.length,complete:results.filter(x=>x.terminalStatus==="complete").length,blocked:results.filter(x=>x.terminalStatus==="blocked").length,conflict:results.filter(x=>x.terminalStatus==="conflict").length,incomplete:results.filter(x=>x.terminalStatus==="incomplete").length,stageResults:results.reduce((n,x)=>n+x.stages.length,0),failClosed:results.every(x=>x.stages.every((s,i)=>i===0||(["blocked","gap","conflict"].includes(x.stages[i-1].status)?s.status!=="ready":true)))};}

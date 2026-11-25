export type CrosscheckValueType = "quantity" | "text" | "date" | "presence";
export type EvidenceVerification = "verified" | "unverified" | "pending";
export type CrosscheckStatus = "MATCH" | "MISMATCH" | "MISSING" | "STALE" | "UNVERIFIED" | "EXTERNAL_CONFIRMATION_PENDING";

export type CrosscheckEvidence = {
  sourceId: string;
  sourceLabel: string;
  tier: 1 | 2 | 3 | 4 | 5;
  value: string | number | boolean | null;
  unit?: string | null;
  observedAt?: string | null;
  verification: EvidenceVerification;
};

export type CrosscheckRule = {
  field: string;
  label: string;
  type: CrosscheckValueType;
  tolerance?: number;
  canonicalUnit?: "MT" | "KG";
  maxAgeMs?: number;
};

export type CrosscheckFinding = {
  field: string;
  label: string;
  status: CrosscheckStatus;
  sources: Array<{sourceId:string;sourceLabel:string;tier:number;value:string|number|boolean|null;unit?:string|null;observedAt?:string|null}>;
  comparedPairs: number;
  mismatchPairs: number;
  variance?: number | null;
  canonicalUnit?: string;
  reasons: string[];
};

const unitFactorToKg: Record<string,number> = {
  kg:1, kilogram:1, kilograms:1,
  mt:1000, tonne:1000, tonnes:1000, metric_ton:1000, metric_tons:1000,
};
function normalizedUnit(unit?:string|null):string { return (unit||"").trim().toLowerCase().replace(/[ .-]/g,"_"); }
function quantityKg(value:unknown,unit?:string|null):number|null {
  const n=typeof value==="number"?value:typeof value==="string"?Number(value.trim()):NaN;
  const factor=unitFactorToKg[normalizedUnit(unit)];
  return Number.isFinite(n)&&n>=0&&factor!==undefined?n*factor:null;
}
function normalizedText(value:unknown):string {
  return String(value??"").normalize("NFKC").trim().toLowerCase().replace(/\s+/g," ");
}
function dateDay(value:unknown):string|null {
  if(typeof value!=="string"&&typeof value!=="number")return null;
  const d=new Date(value);if(!Number.isFinite(d.getTime()))return null;
  return d.toISOString().slice(0,10);
}
function isStale(e:CrosscheckEvidence,rule:CrosscheckRule,nowMs:number):boolean {
  if(!rule.maxAgeMs)return false;
  if(!e.observedAt)return true;
  const stamp=Date.parse(e.observedAt);
  if(!Number.isFinite(stamp))return true;
  return nowMs-stamp>rule.maxAgeMs||stamp-nowMs>5*60_000;
}
function isEmptyEvidenceValue(value:unknown):boolean{return value===null||value===undefined||(typeof value==="string"&&value.trim()==="");}
function normalizePresence(value:unknown):boolean|null{
  if(typeof value==="boolean")return value;
  if(typeof value==="number")return value===1?true:value===0?false:null;
  if(typeof value!=="string")return null;
  const v=normalizedText(value);
  if(["true","1","yes","y","present","available","verified"].includes(v))return true;
  if(["false","0","no","n","absent","missing","unavailable"].includes(v))return false;
  return null;
}
export function evaluateCrosscheck(rule:CrosscheckRule,evidence:CrosscheckEvidence[],nowMs=Date.now()):CrosscheckFinding {
  const sources=evidence.map(e=>({sourceId:e.sourceId,sourceLabel:e.sourceLabel,tier:e.tier,value:e.value,unit:e.unit,observedAt:e.observedAt}));
  const reasons:string[]=[];
  if(evidence.length<2||evidence.some(e=>isEmptyEvidenceValue(e.value))) {
    reasons.push("At least two non-empty evidence values are required for comparison.");
    return {field:rule.field,label:rule.label,status:"MISSING",sources,comparedPairs:0,mismatchPairs:0,reasons};
  }
  if(evidence.some(e=>isStale(e,rule,nowMs))) {
    reasons.push("One or more source observations are stale or have an invalid timestamp.");
    return {field:rule.field,label:rule.label,status:"STALE",sources,comparedPairs:0,mismatchPairs:0,reasons};
  }
  if(evidence.some(e=>e.verification==="pending")) {
    reasons.push("External or independent confirmation is pending.");
    return {field:rule.field,label:rule.label,status:"EXTERNAL_CONFIRMATION_PENDING",sources,comparedPairs:0,mismatchPairs:0,reasons};
  }
  if(evidence.some(e=>e.verification!=="verified")) {
    reasons.push("One or more evidence values are not verified.");
    return {field:rule.field,label:rule.label,status:"UNVERIFIED",sources,comparedPairs:0,mismatchPairs:0,reasons};
  }
  let comparedPairs=0,mismatchPairs=0,variance:number|undefined;
  for(let i=0;i<evidence.length;i++)for(let j=i+1;j<evidence.length;j++) {
    const aEvidence=evidence[i],bEvidence=evidence[j];comparedPairs++;
    let match=false;
    if(rule.type==="quantity") {
      const a=quantityKg(aEvidence.value,aEvidence.unit),b=quantityKg(bEvidence.value,bEvidence.unit);
      if(a===null||b===null){reasons.push("Quantity unit/value is not recognized; comparison is advisory and unverified.");return {field:rule.field,label:rule.label,status:"UNVERIFIED",sources,comparedPairs,mismatchPairs,reasons};}
      const deltaKg=b-a;variance=deltaKg/(rule.canonicalUnit==="MT"?1000:1);
      match=Math.abs(deltaKg)<=Math.max(0,rule.tolerance??0)*(rule.canonicalUnit==="MT"?1000:1);
    } else if(rule.type==="text") match=normalizedText(aEvidence.value)===normalizedText(bEvidence.value);
    else if(rule.type==="date") {
      const a=dateDay(aEvidence.value),b=dateDay(bEvidence.value);
      if(a===null||b===null){reasons.push("One or more date values are invalid; comparison cannot be verified.");return {field:rule.field,label:rule.label,status:"UNVERIFIED",sources,comparedPairs,mismatchPairs,reasons};}
      match=a===b;
    } else {
      const a=normalizePresence(aEvidence.value),b=normalizePresence(bEvidence.value);
      if(a===null||b===null){reasons.push("One or more presence values are not recognized; comparison cannot be verified.");return {field:rule.field,label:rule.label,status:"UNVERIFIED",sources,comparedPairs,mismatchPairs,reasons};}
      match=a===b;
    }
    if(!match)mismatchPairs++;
  }
  if(mismatchPairs>0) {
    reasons.push(`${mismatchPairs} of ${comparedPairs} evidence pair(s) differ.`);
    return {field:rule.field,label:rule.label,status:"MISMATCH",sources,comparedPairs,mismatchPairs,...(variance!==undefined?{variance,canonicalUnit:rule.canonicalUnit||"KG"}:{}),reasons};
  }
  reasons.push("Compared values match within the configured rule; this does not itself approve or certify the transaction.");
  return {field:rule.field,label:rule.label,status:"MATCH",sources,comparedPairs,mismatchPairs,...(variance!==undefined?{variance,canonicalUnit:rule.canonicalUnit||"KG"}:{}),reasons};
}

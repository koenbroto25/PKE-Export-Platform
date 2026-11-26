export type KnowledgeEvidenceType="official"|"company"|"industry"|"historical"|"field"|"transaction"|"commercial";
export type KnowledgeVerificationStatus="unverified"|"corroborated"|"verified"|"conflicting"|"expired";
export type AiAllowedUse="candidate-discovery"|"explanation"|"triage"|"draft-only"|"prohibited-decision";
export type KnowledgeClaimValue=string|number|boolean|null|Record<string,unknown>;
export type KnowledgeObservation={
 observationId:string; entityType:string; entityId?:string; claimType:string; claimValue:KnowledgeClaimValue;
 sourceId:string; sourceUrl:string; publisher:string; sourceTitle:string; sourcePublishedAt?:string; retrievedAt:string;
 validFrom?:string; validTo?:string; geography?:string; product?:string; destination?:string;
 evidenceType:KnowledgeEvidenceType; verificationStatus:KnowledgeVerificationStatus; confidence:number; confidenceReason:string;
 scopeLimitations:string[]; unit?:string; measurementBasis?:string; method?:string;
 supersedesObservationId?:string; conflictGroupId?:string; reviewer?:string; reviewedAt?:string;
 aiAllowedUse:AiAllowedUse[]; safetyBoundary:string; simulationOnly?:boolean;
};
export type FreshnessPolicy={maxAgeMsByEvidenceType:Partial<Record<KnowledgeEvidenceType,number>>; now?:string};
export type ObservationAssessment={observationId:string;status:"fresh"|"stale"|"future-dated"|"invalid-date"|"expired"|"scope-mismatch";reasons:string[]};
export type ObservationConflict={conflictGroupId:string;claimType:string;observationIds:string[];status:"conflict"|"uncomparable";reasons:string[]};
const parseDate=(value?:string):number|undefined=>{if(!value)return undefined;const t=Date.parse(value);return Number.isFinite(t)?t:undefined;};
export function assessObservation(o:KnowledgeObservation,policy:FreshnessPolicy,scope?:{geography?:string;product?:string;destination?:string}):ObservationAssessment{
 const now=parseDate(policy.now)??Date.now(), retrieved=parseDate(o.retrievedAt), validFrom=parseDate(o.validFrom), validTo=parseDate(o.validTo), reasons:string[]=[];
 if(!retrieved)return {observationId:o.observationId,status:"invalid-date",reasons:["retrievedAt is missing or invalid"]};
 if(retrieved>now)return {observationId:o.observationId,status:"future-dated",reasons:["retrievedAt is in the future"]};
 if(validFrom!==undefined&&now<validFrom){reasons.push("Observation is not yet valid");return {observationId:o.observationId,status:"stale",reasons};}
 if(o.validTo&&!validTo)return {observationId:o.observationId,status:"invalid-date",reasons:["validTo is invalid"]};
 if(validTo!==undefined&&now>validTo)return {observationId:o.observationId,status:"expired",reasons:["validTo has elapsed"]};
 const maxAge=policy.maxAgeMsByEvidenceType[o.evidenceType];
 if(maxAge!==undefined&&now-retrieved>maxAge){reasons.push(`retrievedAt exceeds freshness policy (${maxAge}ms)`);return {observationId:o.observationId,status:"stale",reasons};}
 for(const k of ["geography","product","destination"] as const){if(scope?.[k]&&o[k]&&scope[k]!==o[k]){reasons.push(`Scope mismatch: ${k}=${o[k]}`);return {observationId:o.observationId,status:"scope-mismatch",reasons};}}
 return {observationId:o.observationId,status:"fresh",reasons:[]};
}
const comparable=(a:KnowledgeObservation,b:KnowledgeObservation)=>a.unit===b.unit&&a.measurementBasis===b.measurementBasis;
const sameValue=(a:KnowledgeClaimValue,b:KnowledgeClaimValue)=>JSON.stringify(a)===JSON.stringify(b);
export function detectObservationConflicts(observations:KnowledgeObservation[]):ObservationConflict[]{
 const groups=new Map<string,KnowledgeObservation[]>();
 for(const o of observations){const key=o.conflictGroupId??`${o.entityType}:${o.entityId??"unknown"}:${o.claimType}`;const arr=groups.get(key)??[];arr.push(o);groups.set(key,arr);}
 const out:ObservationConflict[]=[];
 for(const [key,items] of groups){if(items.length<2)continue;const claimType=items[0].claimType;if(items.some(x=>x.claimType!==claimType)){out.push({conflictGroupId:key,claimType,observationIds:items.map(x=>x.observationId),status:"uncomparable",reasons:["Claim types differ within group"]});continue;}
 const basisMismatch=items.some(x=>!comparable(items[0],x));if(basisMismatch){out.push({conflictGroupId:key,claimType,observationIds:items.map(x=>x.observationId),status:"uncomparable",reasons:["Unit or measurement basis differs; normalize before comparison"]});continue;}
 if(items.some(x=>!sameValue(items[0].claimValue,x.claimValue))){out.push({conflictGroupId:key,claimType,observationIds:items.map(x=>x.observationId),status:"conflict",reasons:["Claims disagree; preserve all observations and require review"]});}
 }
 return out;
}
export function summarizeObservationSafety(o:KnowledgeObservation):string[]{
 const issues:string[]=[];
 if(o.verificationStatus==="unverified"||o.verificationStatus==="conflicting"||o.verificationStatus==="expired")issues.push(`Verification status is ${o.verificationStatus}`);
 if(o.confidence<0.6)issues.push("Low confidence; do not present as established fact");
 if(o.aiAllowedUse.includes("prohibited-decision"))issues.push("AI use is prohibited for consequential decisions");
 if(o.scopeLimitations.length===0)issues.push("No scope limitation documented");
 return issues;
}

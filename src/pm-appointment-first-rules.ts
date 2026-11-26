export type PMAppointmentStatus = "active" | "suspended" | "revoked";
export interface PMProjectCreateInput {
  idempotencyKey?: unknown; name?: unknown; buyerId?: unknown; basisType?: unknown;
  basisReference?: unknown; basisDate?: unknown; contractReference?: unknown;
  evidenceUrl?: unknown; commercialTerms?: unknown; settlementUnit?: unknown;
  targetQuantity?: unknown; exportCountryCode?: unknown;
}
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_DATE=/^\d{4}-\d{2}-\d{2}$/;
export function isValidPMProjectCreateInput(input:PMProjectCreateInput):boolean {
  const name=typeof input.name==="string"?input.name.trim():"";
  const buyerId=typeof input.buyerId==="string"?input.buyerId:"";
  const basisReference=typeof input.basisReference==="string"?input.basisReference.trim():"";
  const basisType=input.basisType;
  const contractReference=typeof input.contractReference==="string"?input.contractReference.trim():"";
  const settlementUnit=typeof input.settlementUnit==="string"?input.settlementUnit.trim():"";
  const quantity=Number(input.targetQuantity);
  const key=typeof input.idempotencyKey==="string"?input.idempotencyKey:"";
  const date=input.basisDate;
  const evidence=typeof input.evidenceUrl==="string"&&input.evidenceUrl.trim()?input.evidenceUrl.trim():null;
  const country=typeof input.exportCountryCode==="string"&&input.exportCountryCode?input.exportCountryCode.toUpperCase():null;
  const validDate=date===null||date===undefined||date===""||(typeof date==="string"&&ISO_DATE.test(date)&&!Number.isNaN(Date.parse(date))&&new Date(date).toISOString().slice(0,10)===date);
  const terms=input.commercialTerms===undefined||input.commercialTerms===null||input.commercialTerms===""||(typeof input.commercialTerms==="object"&&!Array.isArray(input.commercialTerms));
  return name.length>=2&&name.length<=200&&UUID.test(buyerId)&&["buyer_agreement","executed_contract"].includes(String(basisType))&&basisReference.length>=2&&basisReference.length<=200&&settlementUnit.length>=1&&settlementUnit.length<=40&&Number.isFinite(quantity)&&quantity>0&&UUID.test(key)&&(basisType!=="executed_contract"||contractReference.length>=2)&&(!evidence||/^https:\/\//i.test(evidence))&&validDate&&(!country||/^[A-Z]{2}$/.test(country))&&terms;
}
export function canPMCreateProject(status:PMAppointmentStatus|undefined,userActive:boolean,authLinked:boolean):boolean {
  return status==="active"&&userActive&&authLinked;
}
export function canTransferProjectPM(newPMStatus:PMAppointmentStatus|undefined,reason:string):boolean {
  return newPMStatus==="active"&&reason.trim().length>=5;
}
export function shouldRevokePMProjectAssignments(status:PMAppointmentStatus):boolean {
  return status==="suspended"||status==="revoked";
}
export function idempotentProjectResult<T>(key:string,existing:Map<string,T>,create:()=>T):{result:T;replayed:boolean} {
  if(existing.has(key))return {result:existing.get(key) as T,replayed:true};
  const result=create();existing.set(key,result);return {result,replayed:false};
}

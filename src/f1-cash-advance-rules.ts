export function isValidCashAdvanceRequest(input:{amount:unknown;currencyId:unknown;purpose:unknown;advanceDate:unknown}):boolean{
 const amount=typeof input.amount==="number"?input.amount:Number(input.amount);
 if(!Number.isFinite(amount)||amount<=0)return false;
 if(typeof input.currencyId!=="string"||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.currencyId))return false;
 if(typeof input.purpose!=="string"||input.purpose.trim().length<3||input.purpose.trim().length>4000)return false;
 if(typeof input.advanceDate!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(input.advanceDate))return false;
 const d=new Date(input.advanceDate+"T00:00:00.000Z");
 return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===input.advanceDate;
}
export function canDecideCashAdvance(input:{actorId:string;requestorId:string;roleCode:string;currentStatus:string;decision:string}):boolean{
 return input.roleCode==="finance"&&input.actorId!==input.requestorId&&(input.currentStatus==="draft"||input.currentStatus==="pending")&&(input.decision==="approved"||input.decision==="rejected");
}

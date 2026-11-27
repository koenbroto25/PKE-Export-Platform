export type FieldCaptureInput={
 captureId:string;workItemId:string;captureKind:string;note:string;capturedAt:string;
 latitude?:number;longitude?:number;gpsAccuracyM?:number;gpsCapturedAt?:string;
 evidenceObjectKey?:string;evidenceSha256?:string;evidenceSizeBytes?:number;evidenceMimeType?:string;evidenceOriginalFilename?:string;
};
export type FieldCaptureValidationContext={projectId:string;actorUserId:string};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sha=/^[a-f0-9]{64}$/i;
const mime=new Set(["image/jpeg","image/png","image/webp"]);
export function validateFieldCaptureInput(input:FieldCaptureInput,context:FieldCaptureValidationContext):string[]{
 const e:string[]=[];
 if(!uuid.test(context.projectId))e.push("projectId must be a UUID");
 if(!context.actorUserId.trim())e.push("authenticated actor is required");
 if(!uuid.test(input.captureId))e.push("captureId must be a UUID");
 if(!uuid.test(input.workItemId))e.push("workItemId must be a UUID");
 if(!["checkpoint","warehouse","inspection","exception"].includes(input.captureKind))e.push("captureKind is invalid");
 if(typeof input.note!=="string"||input.note.trim().length<1||input.note.length>4000)e.push("note must be 1-4000 characters");
 if(!Number.isFinite(Date.parse(input.capturedAt)))e.push("capturedAt must be a valid timestamp");
 const gps=[input.latitude,input.longitude,input.gpsAccuracyM,input.gpsCapturedAt];
 const gpsAny=gps.some(v=>v!==undefined&&v!==null),gpsAll=gps.every(v=>v!==undefined&&v!==null);
 if(gpsAny&&!gpsAll)e.push("GPS fields must be supplied together");
 if(gpsAll){if(typeof input.latitude!=="number"||input.latitude < -90||input.latitude>90)e.push("latitude must be within -90..90");if(typeof input.longitude!=="number"||input.longitude < -180||input.longitude>180)e.push("longitude must be within -180..180");if(typeof input.gpsAccuracyM!=="number"||!Number.isFinite(input.gpsAccuracyM)||input.gpsAccuracyM<=0)e.push("gpsAccuracyM must be positive");if(!Number.isFinite(Date.parse(String(input.gpsCapturedAt))))e.push("gpsCapturedAt must be valid");}
 const ev=[input.evidenceObjectKey,input.evidenceSha256,input.evidenceSizeBytes,input.evidenceMimeType,input.evidenceOriginalFilename];
 const evAny=ev.some(v=>v!==undefined&&v!==null),evAll=ev.every(v=>v!==undefined&&v!==null);
 if(evAny&&!evAll)e.push("evidence metadata must be supplied together");
 if(evAll){if(!sha.test(String(input.evidenceSha256)))e.push("evidence SHA-256 is invalid");if(!Number.isSafeInteger(input.evidenceSizeBytes)||Number(input.evidenceSizeBytes)<=0||Number(input.evidenceSizeBytes)>15*1024*1024)e.push("evidence size must be 1 byte to 15 MB");if(!mime.has(String(input.evidenceMimeType)))e.push("evidence MIME type is not allowed");if(!String(input.evidenceOriginalFilename).trim()||String(input.evidenceOriginalFilename).length>255)e.push("evidence filename is invalid");const prefix=`projects/${context.projectId}/field-captures/${input.captureId}/`;const suffix=String(input.evidenceObjectKey).slice(prefix.length);if(!String(input.evidenceObjectKey).startsWith(prefix)||!/^([0-9a-f-]{36})\.(jpg|png|webp)$/i.test(suffix)||String(input.evidenceObjectKey).includes("..")||String(input.evidenceObjectKey).length>1024)e.push("evidence object key is outside the capture Project namespace");}
 return e;
}
export function normalizeFieldCapturePayload(input:FieldCaptureInput,context:FieldCaptureValidationContext){
 return {projectId:context.projectId,actorUserId:context.actorUserId,captureId:input.captureId,workItemId:input.workItemId,captureKind:input.captureKind,note:input.note.trim(),capturedAt:input.capturedAt,latitude:input.latitude??null,longitude:input.longitude??null,gpsAccuracyM:input.gpsAccuracyM??null,gpsCapturedAt:input.gpsCapturedAt??null,evidenceObjectKey:input.evidenceObjectKey??null,evidenceSha256:input.evidenceSha256??null,evidenceSizeBytes:input.evidenceSizeBytes??null,evidenceMimeType:input.evidenceMimeType??null,evidenceOriginalFilename:input.evidenceOriginalFilename??null};
}

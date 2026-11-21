export const P1_RECORD_TYPES = [
  "purchase_requisition","purchase_order","supplier_commitment","goods_receipt_match",
  "production_batch","packing_batch","quality_sample","quality_result","qa_release",
  "hse_inspection","hse_action","dispatch_assignment","vessel_call","loading_plan",
  "loading_survey","ship_master_ack","laytime_event","lc_record","lc_clause",
  "lc_discrepancy","lc_presentation","audit_finding","audit_response","audit_closure",
] as const;

export type P1RecordType = typeof P1_RECORD_TYPES[number];
export type P1Status = "draft"|"submitted"|"approved"|"issued"|"acknowledged"|"in_progress"|"blocked"|"partially_received"|"received"|"matched"|"held"|"released"|"rejected"|"completed"|"cancelled"|"open"|"responded"|"verified"|"closed"|"presented"|"accepted"|"discrepancy"|"expired";

const transitions: Record<P1RecordType, Partial<Record<P1Status, readonly P1Status[]>>> = {
  purchase_requisition:{draft:["submitted","cancelled"],submitted:["approved","rejected","cancelled"],approved:["cancelled"]},
  purchase_order:{draft:["submitted","cancelled"],submitted:["approved","rejected"],approved:["issued","cancelled"],issued:["acknowledged","partially_received","received"],acknowledged:["partially_received","received"],partially_received:["received","discrepancy"]},
  supplier_commitment:{draft:["submitted","cancelled"],submitted:["acknowledged","rejected"],acknowledged:["in_progress","blocked","completed"]},
  goods_receipt_match:{draft:["matched","discrepancy"],discrepancy:["matched","rejected"],matched:["verified"]},
  production_batch:{draft:["in_progress","cancelled"],in_progress:["completed","held","blocked"],held:["in_progress","rejected"],blocked:["in_progress","cancelled"]},
  packing_batch:{draft:["in_progress","cancelled"],in_progress:["completed","held","blocked"],held:["in_progress","rejected"],blocked:["in_progress","cancelled"]},
  quality_sample:{draft:["submitted","cancelled"],submitted:["accepted","rejected","blocked"],accepted:["verified"],blocked:["submitted"]},
  quality_result:{draft:["submitted"],submitted:["accepted","rejected","blocked"],blocked:["submitted"]},
  qa_release:{draft:["submitted"],submitted:["released","held","rejected"],held:["submitted"],released:[]},
  hse_inspection:{draft:["submitted","cancelled"],submitted:["verified","blocked"],blocked:["submitted"]},
  hse_action:{open:["in_progress","cancelled"],in_progress:["completed","blocked"],blocked:["in_progress"],completed:["verified"],verified:[]},
  dispatch_assignment:{draft:["approved","cancelled"],approved:["issued","cancelled"],issued:["acknowledged","in_progress","blocked"],acknowledged:["in_progress","blocked"],in_progress:["completed","blocked"],blocked:["in_progress","cancelled"]},
  vessel_call:{draft:["submitted","cancelled"],submitted:["approved","rejected"],approved:["acknowledged"],acknowledged:["completed","blocked"],blocked:["acknowledged"]},
  loading_plan:{draft:["submitted","cancelled"],submitted:["approved","rejected"],approved:["in_progress"],in_progress:["completed","blocked"],blocked:["in_progress"]},
  loading_survey:{draft:["submitted"],submitted:["accepted","rejected","blocked"],blocked:["submitted"]},
  ship_master_ack:{draft:["submitted"],submitted:["acknowledged","rejected"],rejected:["submitted"]},
  laytime_event:{draft:["submitted"],submitted:["verified","rejected"],rejected:["submitted"]},
  lc_record:{draft:["issued","cancelled"],issued:["acknowledged","expired","closed"],acknowledged:["expired","closed"]},
  lc_clause:{draft:["submitted","cancelled"],submitted:["accepted","discrepancy"],discrepancy:["submitted"],accepted:[]},
  lc_discrepancy:{open:["responded","cancelled"],responded:["verified","discrepancy"],verified:["closed"]},
  lc_presentation:{draft:["presented","cancelled"],presented:["accepted","discrepancy"],discrepancy:["presented"],accepted:[]},
  audit_finding:{open:["responded","cancelled"],responded:["verified","open"],verified:["closed","open"],closed:[]},
  audit_response:{draft:["submitted","cancelled"],submitted:["verified","rejected"],rejected:["submitted"],verified:[]},
  audit_closure:{draft:["submitted"],submitted:["verified","rejected"],rejected:["submitted"],verified:["closed"]},
};

const nonEmpty = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const positive = (v: unknown): boolean => typeof v === "number" && Number.isFinite(v) && v > 0;
const isDate = (v: unknown): boolean => nonEmpty(v) && Number.isFinite(Date.parse(v));

export function isP1RecordType(value: unknown): value is P1RecordType {
  return typeof value === "string" && (P1_RECORD_TYPES as readonly string[]).includes(value);
}

export function validateP1Create(type: P1RecordType, payload: Record<string, unknown>): string[] {
  const errors: string[] = [];
  switch (type) {
    case "purchase_requisition":
    case "purchase_order": {
      if (!nonEmpty(payload.currencyCode) || !/^[A-Z]{3}$/.test(String(payload.currencyCode))) errors.push("currencyCode must be an ISO-4217 code");
      if (!Array.isArray(payload.items) || payload.items.length === 0) errors.push("items must contain at least one line");
      else for (const [i, raw] of payload.items.entries()) {
        const item = raw as Record<string, unknown>;
        if (!nonEmpty(item.description)) errors.push(`items[${i}].description is required`);
        if (!positive(item.quantity)) errors.push(`items[${i}].quantity must be positive`);
        if (!nonEmpty(item.unitCode)) errors.push(`items[${i}].unitCode is required`);
        if (typeof item.unitPrice !== "number" || !Number.isFinite(item.unitPrice) || item.unitPrice < 0) errors.push(`items[${i}].unitPrice must be non-negative`);
      }
      break;
    }
    case "supplier_commitment":
      if (!nonEmpty(payload.purchaseOrderRecordId)) errors.push("purchaseOrderRecordId is required");
      if (!positive(payload.committedQuantity)) errors.push("committedQuantity must be positive");
      if (!nonEmpty(payload.unitCode) || !isDate(payload.committedAt)) errors.push("unitCode and committedAt are required");
      break;
    case "goods_receipt_match":
      for (const key of ["purchaseOrderRecordId","warehouseReceiptId","apInvoiceId"]) if (!nonEmpty(payload[key])) errors.push(`${key} is required`);
      if (!positive(payload.matchedQuantity) || !positive(payload.matchedAmount)) errors.push("matchedQuantity and matchedAmount must be positive");
      if (!nonEmpty(payload.unitCode) || !nonEmpty(payload.currencyCode)) errors.push("unitCode and currencyCode are required");
      break;
    case "production_batch":
    case "packing_batch":
      if (!positive(payload.quantity) || !nonEmpty(payload.unitCode)) errors.push("positive quantity and unitCode are required");
      if (!isDate(payload.startedAt)) errors.push("startedAt must be a valid timestamp");
      break;
    case "quality_sample":
      if (!nonEmpty(payload.sampleId) && !nonEmpty(payload.sampleNumber)) errors.push("sampleId or sampleNumber is required");
      if (!nonEmpty(payload.sampleType)) errors.push("sampleType is required");
      break;
    case "quality_result":
      if (!nonEmpty(payload.sampleId) || !nonEmpty(payload.attributeId) || !nonEmpty(payload.methodCode)) errors.push("sampleId, attributeId and methodCode are required");
      if ([payload.resultNumeric,payload.resultText,payload.resultBoolean].filter(v => v !== null && v !== undefined).length !== 1) errors.push("exactly one result value is required");
      break;
    case "qa_release":
      if (!nonEmpty(payload.sourceRecordId) || !nonEmpty(payload.decisionReason)) errors.push("sourceRecordId and decisionReason are required");
      if (!["release","hold"].includes(String(payload.decision))) errors.push("decision must be release or hold");
      break;
    case "hse_inspection":
      if (!nonEmpty(payload.category) || !nonEmpty(payload.severity) || !isDate(payload.observedAt)) errors.push("category, severity and observedAt are required");
      break;
    case "hse_action":
      if (!nonEmpty(payload.findingRecordId) || !nonEmpty(payload.actionOwnerRoleCode) || !isDate(payload.dueAt)) errors.push("findingRecordId, actionOwnerRoleCode and dueAt are required");
      break;
    case "dispatch_assignment":
      if (!nonEmpty(payload.tripId) || !nonEmpty(payload.driverUserId) || !nonEmpty(payload.vehicleId)) errors.push("tripId, driverUserId and vehicleId are required");
      if (!isDate(payload.plannedDepartureAt) || !isDate(payload.plannedArrivalAt) || Date.parse(String(payload.plannedArrivalAt)) <= Date.parse(String(payload.plannedDepartureAt))) errors.push("planned arrival must be after planned departure");
      break;
    case "vessel_call":
      if (!nonEmpty(payload.voyageId) || !nonEmpty(payload.vesselId) || !nonEmpty(payload.portId) || !isDate(payload.predictedArrivalAt)) errors.push("voyageId, vesselId, portId and predictedArrivalAt are required");
      break;
    case "loading_plan":
      if (!nonEmpty(payload.loadingOperationId) || !nonEmpty(payload.shipmentId) || !positive(payload.plannedQuantity) || !nonEmpty(payload.unitCode)) errors.push("loadingOperationId, shipmentId, positive plannedQuantity and unitCode are required");
      break;
    case "loading_survey":
      if (!nonEmpty(payload.loadingOperationId) || !nonEmpty(payload.certificateObjectKey) || !/^[0-9a-f]{64}$/.test(String(payload.sha256Checksum ?? "")) || !positive(payload.surveyedQuantity)) errors.push("loadingOperationId, certificate object key, SHA-256 and positive surveyedQuantity are required");
      break;
    case "ship_master_ack":
      if (!nonEmpty(payload.voyageId) || !nonEmpty(payload.acknowledgementType) || !isDate(payload.acknowledgedAt)) errors.push("voyageId, acknowledgementType and acknowledgedAt are required");
      break;
    case "laytime_event":
      if (!nonEmpty(payload.voyageId) || !nonEmpty(payload.eventCode) || !isDate(payload.eventAt)) errors.push("voyageId, eventCode and eventAt are required");
      if (payload.laytimeImpactHours !== undefined && (typeof payload.laytimeImpactHours !== "number" || !Number.isFinite(payload.laytimeImpactHours) || payload.laytimeImpactHours < 0)) errors.push("laytimeImpactHours must be non-negative");
      break;
    case "lc_record":
      if (!nonEmpty(payload.lcNumber) || !nonEmpty(payload.issuingBank) || !nonEmpty(payload.currencyCode) || !positive(payload.amount) || !isDate(payload.expiryAt) || !isDate(payload.latestShipmentAt)) errors.push("LC number, issuing bank, currency, positive amount, expiry and latest shipment dates are required");
      break;
    case "lc_clause":
      if (!nonEmpty(payload.lcRecordId) || !nonEmpty(payload.clauseCode) || !nonEmpty(payload.requirementText)) errors.push("lcRecordId, clauseCode and requirementText are required");
      break;
    case "lc_discrepancy":
      if (!nonEmpty(payload.lcRecordId) || !nonEmpty(payload.clauseRecordId) || !nonEmpty(payload.description) || !isDate(payload.resolutionDueAt)) errors.push("LC, clause, discrepancy description and resolution deadline are required");
      break;
    case "lc_presentation":
      if (!nonEmpty(payload.lcRecordId) || !Array.isArray(payload.documentRecordIds) || payload.documentRecordIds.length === 0 || !nonEmpty(payload.presentationReference)) errors.push("LC, at least one document record and presentation reference are required");
      break;
    case "audit_finding":
      if (!nonEmpty(payload.findingCode) || !nonEmpty(payload.criteria) || !nonEmpty(payload.condition) || !nonEmpty(payload.cause) || !nonEmpty(payload.effect) || !nonEmpty(payload.recommendation) || !nonEmpty(payload.ownerRoleCode) || !isDate(payload.dueAt)) errors.push("findingCode, criteria, condition, cause, effect, recommendation, ownerRoleCode and dueAt are required");
      if (!["low","moderate","high","critical"].includes(String(payload.severity))) errors.push("severity must be low, moderate, high or critical");
      break;
    case "audit_response":
      if (!nonEmpty(payload.findingRecordId) || !nonEmpty(payload.response) || !nonEmpty(payload.correctiveAction) || !isDate(payload.dueAt)) errors.push("findingRecordId, response, correctiveAction and dueAt are required");
      break;
    case "audit_closure":
      if (!nonEmpty(payload.findingRecordId) || !nonEmpty(payload.verificationResult) || !nonEmpty(payload.closureReason)) errors.push("findingRecordId, verificationResult and closureReason are required");
      break;
  }
  return errors;
}

export function validateP1Transition(type: P1RecordType, from: P1Status, to: P1Status): boolean {
  return (transitions[type][from] ?? []).includes(to);
}

export function validateThreeWayMatch(input: {
  po: { projectId: string; supplierId: string; currencyCode: string; items: Array<{ quantity: number; unitCode: string; unitPrice: number }> };
  receipt: { projectId: string; quantity: number; unitCode: string; supplierId?: string | null };
  invoice: { projectId: string; supplierId: string; currencyCode: string; totalAmount: number };
  matchedQuantity: number; matchedAmount: number; unitCode: string; currencyCode: string; tolerance?: number;
}): { ok: boolean; reason?: string } {
  const tolerance = input.tolerance ?? 0.0001;
  if (input.po.projectId !== input.receipt.projectId || input.po.projectId !== input.invoice.projectId) return { ok:false, reason:"CROSS_PROJECT_REFERENCE" };
  if (input.po.supplierId !== input.invoice.supplierId || (input.receipt.supplierId && input.receipt.supplierId !== input.po.supplierId)) return { ok:false, reason:"SUPPLIER_MISMATCH" };
  if (input.po.currencyCode !== input.invoice.currencyCode || input.po.currencyCode !== input.currencyCode) return { ok:false, reason:"CURRENCY_MISMATCH" };
  if (input.receipt.unitCode !== input.unitCode) return { ok:false, reason:"UNIT_MISMATCH" };
  const poQty = input.po.items.reduce((sum,item)=>sum+item.quantity,0);
  const poAmount = input.po.items.reduce((sum,item)=>sum+item.quantity*item.unitPrice,0);
  if (input.matchedQuantity - input.receipt.quantity > tolerance || input.matchedQuantity - poQty > tolerance) return { ok:false, reason:"QUANTITY_OVER_MATCH" };
  if (Math.abs(input.matchedQuantity-input.receipt.quantity)>tolerance) return { ok:false, reason:"RECEIPT_QUANTITY_MISMATCH" };
  if (Math.abs(input.matchedAmount-input.invoice.totalAmount)>tolerance) return { ok:false, reason:"INVOICE_AMOUNT_MISMATCH" };
  if (input.matchedAmount - poAmount > tolerance) return { ok:false, reason:"PO_AMOUNT_EXCEEDED" };
  return {ok:true};
}

export function canApprovePurchaseOrder(actorId:string, creatorId:string, roleCode:string):boolean {
  return actorId !== creatorId && ["procurement","contract_manager"].includes(roleCode);
}
export function canDecideQaRelease(actorId:string, producerId:string, roleCode:string):boolean {
  return actorId !== producerId && roleCode === "qa_manager";
}
export function canCloseAuditFinding(actorId:string, findingCreatorId:string, responseActorId:string|null, roleCode:string):boolean {
  return roleCode === "internal_auditor" && actorId !== findingCreatorId && actorId !== responseActorId;
}

export function validateP1Evidence(input:{objectKey:string;sha256:string;bucket:string;sizeBytes?:number|null}):boolean {
  return input.objectKey.trim().length>=3 && /^[0-9a-f]{64}$/.test(input.sha256) &&
    input.bucket==="pke-private-documents" && (input.sizeBytes==null || (Number.isInteger(input.sizeBytes)&&input.sizeBytes>0&&input.sizeBytes<=52428800));
}

export function evaluateFreshness(lastUpdatedAt:string|null, nowMs=Date.now(), maxAgeMinutes:number):"fresh"|"stale"|"unavailable" {
  if (!lastUpdatedAt || !Number.isFinite(Date.parse(lastUpdatedAt))) return "unavailable";
  const age=nowMs-Date.parse(lastUpdatedAt);
  if (age<0) return "unavailable";
  return age<=maxAgeMinutes*60_000?"fresh":"stale";
}

export function calculateLaytime(input:{allowedHours:number;startAt:string;endAt:string;excludedHours?:number}):{usedHours:number;overrunHours:number;valid:boolean} {
  const start=Date.parse(input.startAt),end=Date.parse(input.endAt),excluded=input.excludedHours??0;
  if (!Number.isFinite(start)||!Number.isFinite(end)||end<start||!Number.isFinite(input.allowedHours)||input.allowedHours<0||!Number.isFinite(excluded)||excluded<0) return {usedHours:0,overrunHours:0,valid:false};
  const usedHours=Math.max(0,(end-start)/3_600_000-excluded);
  return {usedHours,overrunHours:Math.max(0,usedHours-input.allowedHours),valid:true};
}

export function isDispatchOnTime(plannedArrivalAt:string,actualArrivalAt:string|null):boolean|null {
  if (!actualArrivalAt) return null;
  const planned=Date.parse(plannedArrivalAt),actual=Date.parse(actualArrivalAt);
  if (!Number.isFinite(planned)||!Number.isFinite(actual)) return null;
  return actual<=planned;
}

export function validateLcPresentation(requiredClauseCodes:string[], submittedClauseCodes:string[], hasExpiredDocument:boolean):{ok:boolean;missing:string[]} {
  const submitted=new Set(submittedClauseCodes);
  const missing=requiredClauseCodes.filter(code=>!submitted.has(code));
  return {ok:missing.length===0&&!hasExpiredDocument,missing};
}

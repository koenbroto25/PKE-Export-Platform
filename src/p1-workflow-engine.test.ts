import { describe, expect, it } from "vitest";
import {
  calculateLaytime, canApprovePurchaseOrder, canCloseAuditFinding, canDecideQaRelease,
  evaluateFreshness, isDispatchOnTime, isP1RecordType, validateLcPresentation,
  validateP1Create, validateP1Evidence, validateP1Transition, validateThreeWayMatch,
} from "./p1-workflow-engine.js";

describe("P1 workflow domain contracts", () => {
  it("recognizes only the closed P1 record type set", () => {
    expect(isP1RecordType("purchase_order")).toBe(true);
    expect(isP1RecordType("payment_execution")).toBe(false);
  });
  it("requires PO line details and ISO currency", () => {
    expect(validateP1Create("purchase_order", {supplierId:"supplier-1",currencyCode:"IDR",items:[{description:"Palm kernel cake",quantity:10,unitCode:"MT",unitPrice:120}]})).toEqual([]);
    expect(validateP1Create("purchase_order", {currencyCode:"IDR",items:[{description:"Palm kernel cake",quantity:10,unitCode:"MT",unitPrice:120}]})).toContain("supplierId is required for a Purchase Order");
    expect(validateP1Create("purchase_order", {currencyCode:"idr",items:[]})).toHaveLength(3);
  });
  it("requires positive commitment quantity and a timestamp", () => {
    expect(validateP1Create("supplier_commitment",{purchaseOrderRecordId:"po-1",committedQuantity:0,unitCode:"MT",committedAt:"invalid"})).toHaveLength(2);
  });
  it("requires all three-way match references", () => {
    expect(validateP1Create("goods_receipt_match",{matchedQuantity:1,matchedAmount:1,unitCode:"MT",currencyCode:"IDR"}).length).toBe(3);
  });
  it("requires exactly one quality result value", () => {
    expect(validateP1Create("quality_result",{sampleId:"s",attributeId:"a",methodCode:"M",resultNumeric:1,resultText:"x"})).toContain("exactly one result value is required");
  });
  it("requires independent QA decision reason and source", () => {
    expect(validateP1Create("qa_release",{decision:"release",sourceRecordId:"x",decisionReason:"Reviewed"})).toEqual([]);
  });
  it("rejects missing HSE inspection severity and observation time", () => {
    expect(validateP1Create("hse_inspection",{category:"safety"})).toContain("category, severity and observedAt are required");
  });
  it("requires a positive planned dispatch window", () => {
    expect(validateP1Create("dispatch_assignment",{tripId:"t",driverUserId:"d",vehicleId:"v",plannedDepartureAt:"2026-01-02T12:00:00Z",plannedArrivalAt:"2026-01-02T11:00:00Z"})).toHaveLength(1);
  });
  it("requires loading survey evidence with a valid SHA-256", () => {
    expect(validateP1Create("loading_survey",{loadingOperationId:"l",certificateObjectKey:"key",sha256Checksum:"bad",surveyedQuantity:2})).toHaveLength(1);
  });
  it("requires LC dates and positive amount", () => {
    expect(validateP1Create("lc_record",{lcNumber:"LC1",issuingBank:"Bank",currencyCode:"IDR",amount:-1,expiryAt:"bad",latestShipmentAt:"bad"})).toHaveLength(1);
  });
  it("requires an audit finding with complete 5C details", () => {
    expect(validateP1Create("audit_finding",{findingCode:"AF-1",severity:"high",criteria:"policy",condition:"gap",cause:"cause",effect:"effect",recommendation:"fix",ownerRoleCode:"procurement",dueAt:"2026-12-01T00:00:00Z"})).toEqual([]);
  });
  it("enforces typed state transitions", () => {
    expect(validateP1Transition("purchase_order","submitted","approved")).toBe(true);
    expect(validateP1Transition("purchase_order","issued","draft")).toBe(false);
    expect(validateP1Transition("audit_finding","verified","closed")).toBe(true);
  });
  it("requires maker-checker separation for PO approval", () => {
    expect(canApprovePurchaseOrder("u2","u1","procurement")).toBe(true);
    expect(canApprovePurchaseOrder("u1","u1","procurement")).toBe(false);
    expect(canApprovePurchaseOrder("u2","u1","pm")).toBe(false);
  });
  it("requires independent QA role and actor", () => {
    expect(canDecideQaRelease("qa","producer","qa_manager")).toBe(true);
    expect(canDecideQaRelease("producer","producer","qa_manager")).toBe(false);
    expect(canDecideQaRelease("qa","producer","production_manager")).toBe(false);
  });
  it("requires an independent Internal Auditor for closure", () => {
    expect(canCloseAuditFinding("auditor","owner","responder","internal_auditor")).toBe(true);
    expect(canCloseAuditFinding("owner","owner","responder","internal_auditor")).toBe(false);
    expect(canCloseAuditFinding("responder","owner","responder","internal_auditor")).toBe(false);
  });
  it("rejects public or invalid evidence references", () => {
    const valid={objectKey:"p1/evidence/one.pdf",sha256:"a".repeat(64),bucket:"pke-private-documents",sizeBytes:100};
    expect(validateP1Evidence(valid)).toBe(true);
    expect(validateP1Evidence({...valid,bucket:"public"})).toBe(false);
    expect(validateP1Evidence({...valid,sha256:"bad"})).toBe(false);
  });
  it("treats missing and stale source timestamps explicitly", () => {
    const now=Date.parse("2026-11-21T00:00:00Z");
    expect(evaluateFreshness(null,60,now)).toBe("unavailable");
    expect(evaluateFreshness("2026-11-20T20:00:00Z",60,now)).toBe("stale");
    expect(evaluateFreshness("2026-11-20T23:30:00Z",60,now)).toBe("fresh");
  });
  it("requires a bounded laytime interval and allowance", () => {
    expect(validateP1Create("laytime_event",{voyageId:"v",eventCode:"NOR",eventAt:"2026-01-01T00:00:00Z",startAt:"2026-01-01T00:00:00Z",endAt:"2026-01-01T01:00:00Z",allowedHours:24,excludedHours:0})).toEqual([]);
    expect(validateP1Create("laytime_event",{voyageId:"v",eventCode:"NOR",eventAt:"2026-01-01T00:00:00Z"}).length).toBeGreaterThan(0);
  });
  it("requires typed LC document selections", () => {
    expect(validateP1Create("lc_presentation",{lcRecordId:"lc",presentationReference:"P-1",documentSelections:[{documentRecordId:"doc",clauseCode:"46A",copyType:"original"}]})).toEqual([]);
    expect(validateP1Create("lc_presentation",{lcRecordId:"lc",presentationReference:"P-1",documentSelections:[{documentRecordId:"doc",clauseCode:"46A",copyType:"unknown"}]}).length).toBeGreaterThan(0);
  });
  it("calculates laytime after excluded hours and never returns negative usage", () => {
    expect(calculateLaytime({allowedHours:24,startAt:"2026-01-01T00:00:00Z",endAt:"2026-01-02T12:00:00Z",excludedHours:12})).toEqual({usedHours:24,overrunHours:0,valid:true});
    expect(calculateLaytime({allowedHours:24,startAt:"bad",endAt:"bad"}).valid).toBe(false);
  });
  it("marks dispatch arrival against its committed SLA", () => {
    expect(isDispatchOnTime("2026-01-01T12:00:00Z","2026-01-01T11:59:00Z")).toBe(true);
    expect(isDispatchOnTime("2026-01-01T12:00:00Z","2026-01-01T12:01:00Z")).toBe(false);
    expect(isDispatchOnTime("2026-01-01T12:00:00Z",null)).toBe(null);
  });
  it("requires all LC clause document codes and no expired evidence", () => {
    expect(validateLcPresentation(["A","B"],["A"],false)).toEqual({ok:false,missing:["B"]});
    expect(validateLcPresentation(["A"],["A"],true).ok).toBe(false);
    expect(validateLcPresentation(["A"],["A"],false).ok).toBe(true);
  });
});

describe("P1 three-way match", () => {
  const base={
    po:{projectId:"p1",supplierId:"s1",currencyCode:"IDR",items:[{quantity:10,unitCode:"MT",unitPrice:100}]},
    receipt:{projectId:"p1",quantity:10,unitCode:"MT",supplierId:"s1"},
    invoice:{projectId:"p1",supplierId:"s1",currencyCode:"IDR",totalAmount:1000},
    matchedQuantity:10,matchedAmount:1000,unitCode:"MT",currencyCode:"IDR",
  };
  it("accepts an exact PO/receipt/invoice match",()=>expect(validateThreeWayMatch(base)).toEqual({ok:true}));
  it("rejects cross-Project references",()=>expect(validateThreeWayMatch({...base,invoice:{...base.invoice,projectId:"p2"}}).reason).toBe("CROSS_PROJECT_REFERENCE"));
  it("rejects supplier and currency mismatches",()=>{
    expect(validateThreeWayMatch({...base,invoice:{...base.invoice,supplierId:"s2"}}).reason).toBe("SUPPLIER_MISMATCH");
    expect(validateThreeWayMatch({...base,invoice:{...base.invoice,currencyCode:"USD"}}).reason).toBe("CURRENCY_MISMATCH");
  });
  it("rejects receipt quantity and invoice amount mismatches",()=>{
    expect(validateThreeWayMatch({...base,receipt:{...base.receipt,quantity:9}}).reason).toBe("RECEIPT_QUANTITY_MISMATCH");
    expect(validateThreeWayMatch({...base,invoice:{...base.invoice,totalAmount:900}}).reason).toBe("INVOICE_AMOUNT_MISMATCH");
  });
  it("rejects quantities or values exceeding the PO",()=>{
    expect(validateThreeWayMatch({...base,matchedQuantity:11,receipt:{...base.receipt,quantity:11}}).reason).toBe("QUANTITY_OVER_MATCH");
    expect(validateThreeWayMatch({...base,matchedAmount:1100,invoice:{...base.invoice,totalAmount:1100}}).reason).toBe("PO_AMOUNT_EXCEEDED");
  });
  it("initializes open-state action, audit and LC discrepancy records correctly",()=>{
    for(const type of ["hse_action","audit_finding","lc_discrepancy"] as const) expect(initialP1Status(type)).toBe("open");
    for(const type of P1_RECORD_TYPES.filter((type)=>!["hse_action","audit_finding","lc_discrepancy"].includes(type))) expect(initialP1Status(type)).toBe("draft");
  });
  it("accepts a valid payload fixture for every P1 workflow type",()=>{
    const validPayloads:Record<(typeof P1_RECORD_TYPES)[number],Record<string,unknown>> = {
      purchase_requisition:{currencyCode:"IDR",items:[{description:"Palm kernel cake",quantity:10,unitCode:"MT",unitPrice:1000}]},
      purchase_order:{supplierId:"supplier-1",currencyCode:"IDR",items:[{description:"Palm kernel cake",quantity:10,unitCode:"MT",unitPrice:1000}]},
      supplier_commitment:{purchaseOrderRecordId:"po-1",committedQuantity:10,unitCode:"MT",committedAt:"2026-11-22T00:00:00Z"},
      goods_receipt_match:{purchaseOrderRecordId:"po-1",warehouseReceiptId:"grn-1",apInvoiceId:"inv-1",matchedQuantity:10,matchedAmount:10000,unitCode:"MT",currencyCode:"IDR"},
      production_batch:{quantity:10,unitCode:"MT",startedAt:"2026-11-21T00:00:00Z"},
      packing_batch:{quantity:10,unitCode:"MT",startedAt:"2026-11-21T00:00:00Z"},
      quality_sample:{sampleId:"sample-1",sampleType:"raw_material"},
      quality_result:{sampleId:"sample-1",attributeId:"moisture",methodCode:"lab-01",resultNumeric:8.5},
      qa_release:{sourceRecordId:"batch-1",decisionReason:"QC and laboratory results accepted",decision:"release"},
      hse_inspection:{category:"workplace",severity:"low",observedAt:"2026-11-21T00:00:00Z"},
      hse_action:{findingRecordId:"hse-1",actionOwnerRoleCode:"procurement",dueAt:"2026-11-22T00:00:00Z"},
      dispatch_assignment:{tripId:"trip-1",driverUserId:"driver-1",vehicleId:"truck-1",plannedDepartureAt:"2026-11-21T01:00:00Z",plannedArrivalAt:"2026-11-21T05:00:00Z"},
      vessel_call:{voyageId:"voyage-1",vesselId:"vessel-1",portId:"port-1",predictedArrivalAt:"2026-11-23T00:00:00Z"},
      loading_plan:{loadingOperationId:"loading-1",shipmentId:"shipment-1",plannedQuantity:10,unitCode:"MT"},
      loading_survey:{loadingOperationId:"loading-1",certificateObjectKey:"projects/p1/survey/certificate.pdf",sha256Checksum:"a".repeat(64),surveyedQuantity:10,certificateFileSizeBytes:1024},
      ship_master_ack:{voyageId:"voyage-1",acknowledgementType:"loading_complete",acknowledgedAt:"2026-11-23T00:00:00Z"},
      laytime_event:{voyageId:"voyage-1",eventCode:"NOR_TENDERED",eventAt:"2026-11-23T00:00:00Z",startAt:"2026-11-23T00:00:00Z",endAt:"2026-11-23T12:00:00Z",allowedHours:24,excludedHours:0},
      lc_record:{lcNumber:"LC-001",issuingBank:"Bank A",currencyCode:"USD",amount:10000,expiryAt:"2027-01-01T00:00:00Z",latestShipmentAt:"2026-12-01T00:00:00Z"},
      lc_clause:{lcRecordId:"lc-1",clauseCode:"46A",requirementText:"Certificate of origin",documentTypeCode:"COO",requiredOriginals:1,requiredCopies:2},
      lc_discrepancy:{lcRecordId:"lc-1",clauseRecordId:"clause-1",description:"Missing certificate signature",resolutionDueAt:"2026-11-25T00:00:00Z"},
      lc_presentation:{lcRecordId:"lc-1",documentSelections:[{documentRecordId:"doc-1",clauseCode:"46A",copyType:"original"}],presentationReference:"PRES-001"},
      audit_finding:{findingCode:"AF-001",criteria:"SOP 01",condition:"Missing control evidence",cause:"Process gap",effect:"Traceability risk",recommendation:"Complete control evidence",ownerRoleCode:"procurement",dueAt:"2026-11-30T00:00:00Z",severity:"moderate"},
      audit_response:{findingRecordId:"finding-1",response:"Acknowledged",correctiveAction:"Implement control",dueAt:"2026-11-30T00:00:00Z"},
      audit_closure:{findingRecordId:"finding-1",verificationResult:"Effective",closureReason:"Independent evidence verified"}
    };
    expect(Object.keys(validPayloads).sort()).toEqual([...P1_RECORD_TYPES].sort());
    for(const type of P1_RECORD_TYPES) expect(validateP1Create(type,validPayloads[type])).toEqual([]);
  });
});

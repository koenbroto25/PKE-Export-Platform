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
    expect(validateP1Create("purchase_order", {currencyCode:"idr",items:[]})).toHaveLength(2);
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
});
